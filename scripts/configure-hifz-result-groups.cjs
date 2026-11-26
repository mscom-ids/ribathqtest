// Inspect by default. --apply adds group metadata and configures only the Nov 2026 exam.
// Saves a local backup and proves all marks, old thresholds and other exam settings unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({path:'.env.local',quiet:true});
const {Pool} = require('../backend/node_modules/pg');
const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const local = ['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname);
const pool = new Pool({connectionString,ssl:local?false:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const examId = '0d268d5b-29ea-43e1-9ddb-6334f4750df1';
const combined = 'Hifz Valuation + Hifz Portion';
const murajaa = "Hifz Muraja'a";
const sort = rows => rows.sort((a,b)=>String(a.id || `${a.student_id}:${a.subject_id}`).localeCompare(String(b.id || `${b.student_id}:${b.subject_id}`)));
async function marks(client) {
    return {
        valuations:sort((await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 ORDER BY student_id,subject_id',[examId])).rows),
        results:sort((await client.query('SELECT * FROM exam_results WHERE exam_id=$1 ORDER BY id',[examId])).rows),
    };
}
(async()=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const exam = (await client.query('SELECT * FROM exams WHERE id=$1 FOR UPDATE',[examId])).rows[0];
        assert.equal(exam?.portal_slug,'half-yearly-hifz-nov26','Unexpected examination');
        const beforeSubjects = sort((await client.query('SELECT * FROM exam_subjects WHERE exam_id=$1 FOR UPDATE',[examId])).rows);
        const plan = beforeSubjects.flatMap(subject=>{
            const name = subject.name.toLowerCase().replace(/[^a-z]/g,'');
            const type = name==='hifzvaluation'?'valuation':name==='hifzportion'?'portion':['hfzmurajaa','hifzmurajaa'].includes(name)?'murajaa':null;
            if (!type) return [];
            const maximum = type==='valuation'?80:type==='portion'?20:100;
            assert.equal(Number(subject.max_marks),maximum,`Unexpected maximum for ${subject.name}`);
            assert.equal(subject.question_count,type==='valuation'?10:1);
            return [{id:subject.id,standard:subject.standard,type,group:type==='murajaa'?murajaa:combined,min:35,componentMin:type==='valuation'?30:null}];
        });
        assert.equal(plan.length,27,'Expected nine standards with three Hifz subjects');
        const standards = [...new Set(plan.map(subject=>subject.standard))];
        assert.equal(standards.length,9);
        for (const standard of standards) assert.deepEqual(plan.filter(subject=>subject.standard===standard).map(subject=>subject.type).sort(),['murajaa','portion','valuation']);
        const changes = plan.filter(row=>{const previous=beforeSubjects.find(subject=>subject.id===row.id);return previous.result_group!==row.group || Number(previous.result_group_min_marks)!==row.min || (previous.result_component_min_marks==null?null:Number(previous.result_component_min_marks))!==row.componentMin;});
        console.log(JSON.stringify({exam:exam.title,standards,subjects:plan.length,to_configure:changes.length,rule:[{group:combined,maximum:100,minimum:35},{group:murajaa,maximum:100,minimum:35}],overall_minimum:70,require_each_group:true,marks_unchanged:true}));
        if (!process.argv.includes('--apply')) {await client.query('ROLLBACK');return;}
        await client.query('SELECT student_id FROM exam_portal_valuations WHERE exam_id=$1 FOR UPDATE',[examId]);
        await client.query('SELECT id FROM exam_results WHERE exam_id=$1 FOR UPDATE',[examId]);
        const beforeMarks = await marks(client);
        const backupDir=path.resolve('tmp/exam-workbook');fs.mkdirSync(backupDir,{recursive:true});
        const backupPath=path.join(backupDir,`before-hifz-result-groups-${Date.now()}.json`);
        fs.writeFileSync(backupPath,JSON.stringify({exam,subjects:beforeSubjects,...beforeMarks,plan},null,2),{flag:'wx'});
        // The migration is idempotent. Remove its transaction wrapper to keep this change atomic.
        const migration=fs.readFileSync('supabase/migrations/20261126030000_exam_result_groups.sql','utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
        await client.query(migration);
        await client.query(fs.readFileSync('supabase/migrations/20261126040000_exam_component_minimum.sql','utf8'));
        if (changes.length) await client.query(`UPDATE exam_subjects subject SET result_group=row.result_group,result_group_min_marks=row.minimum,result_component_min_marks=row.component_minimum
            FROM jsonb_to_recordset($2::jsonb) AS row(id uuid,result_group text,minimum numeric,component_minimum numeric)
            WHERE subject.exam_id=$1 AND subject.id=row.id`,[examId,JSON.stringify(changes.map(row=>({id:row.id,result_group:row.group,minimum:row.min,component_minimum:row.componentMin})))]);
        const afterSubjects=sort((await client.query('SELECT * FROM exam_subjects WHERE exam_id=$1',[examId])).rows);
        assert.equal(afterSubjects.length,beforeSubjects.length);
        for (const before of beforeSubjects) {
            const after=afterSubjects.find(subject=>subject.id===before.id);
            const row=plan.find(subject=>subject.id===before.id);
            const {result_group:oldGroup,result_group_min_marks:oldMinimum,result_component_min_marks:oldComponent,...oldFields}=before;
            const {result_group:newGroup,result_group_min_marks:newMinimum,result_component_min_marks:newComponent,...newFields}=after;
            assert.deepEqual(newFields,oldFields,'Existing subject configuration changed');
            assert.equal(newGroup,row?.group ?? oldGroup ?? null);
            assert.equal(newMinimum==null?null:Number(newMinimum),row?.min ?? (oldMinimum==null?null:Number(oldMinimum)));
            assert.equal(newComponent==null?null:Number(newComponent),row ? row.componentMin : oldComponent==null?null:Number(oldComponent));
        }
        assert.deepEqual(await marks(client),beforeMarks,'Saved marks changed');
        assert.deepEqual((await client.query('SELECT * FROM exams WHERE id=$1',[examId])).rows[0],exam,'Exam settings changed');
        if (changes.length) await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,'Administrator requested grouped pass rule','configure_result_groups',$2)",[examId,JSON.stringify({rule:'Valuation minimum 30/80; each 100-mark group must reach 35; combined minimum 70/200',subjects:plan,marks_unchanged:true})]);
        await client.query('COMMIT');
        console.log(`Committed and verified ${changes.length} subject group settings. Saved marks and existing thresholds unchanged. Backup: ${backupPath}`);
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
