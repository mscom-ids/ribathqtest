// One-time, idempotent conversion for the November 2026 examination only.
// Defaults to inspection. --apply writes a local backup, converts and verifies in one transaction.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../backend/node_modules/dotenv').config({path:'.env.local',quiet:true});
const {Pool} = require('../backend/node_modules/pg');
const examId = '0d268d5b-29ea-43e1-9ddb-6334f4750df1';
const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({connectionString:url,ssl:['localhost','127.0.0.1','::1'].includes(new URL(url).hostname)?false:{rejectUnauthorized:false}});
const scaled = n => n == null ? null : Number((Number(n)*0.8).toFixed(10));
async function snapshot(client) {
    const subjects = (await client.query('SELECT * FROM exam_subjects WHERE exam_id=$1 ORDER BY id',[examId])).rows;
    const valuations = (await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 ORDER BY student_id,subject_id',[examId])).rows;
    const results = (await client.query('SELECT * FROM exam_results WHERE exam_id=$1 ORDER BY id',[examId])).rows;
    return {subjects,valuations,results};
}
(async()=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const exam = (await client.query('SELECT title,portal_slug FROM exams WHERE id=$1 FOR UPDATE',[examId])).rows[0];
        assert.equal(exam?.portal_slug,'half-yearly-hifz-nov26','Unexpected exam');
        // Lock saved records before taking the backup and comparing non-target subjects.
        for(const table of ['exam_subjects','exam_portal_valuations','exam_results']) await client.query(`SELECT * FROM ${table} WHERE exam_id=$1 FOR UPDATE`,[examId]);
        const before = await snapshot(client);
        const targets = before.subjects.filter(s=>s.name==='Hifz Valuation');
        assert.equal(targets.length,9,'Expected the nine existing Hifz Valuation class subjects');
        const ids = targets.map(s=>s.id);
        const selected = row => ids.includes(row.subject_id);
        if(targets.every(s=>s.question_count===10 && Number(s.question_max)===8 && Number(s.max_marks)===80)) {
            console.log('Already converted to 10 questions × 8 = 80. No changes made.');
            await client.query('ROLLBACK'); return;
        }
        assert(targets.every(s=>s.question_count===10 && Number(s.question_max)===10 && Number(s.max_marks)===100),'Unexpected or mixed scoring configuration; refusing to scale twice');
        for(const v of before.valuations.filter(selected)) {
            assert.equal(v.marks.length,10);
            assert(v.marks.every(n=>n===null || (typeof n==='number' && Number.isFinite(n) && n>=0 && n<=10)));
            const total = v.marks.every(n=>n===null)?null:Number(v.marks.reduce((a,n)=>a+(n??0),0).toFixed(10));
            assert.equal(v.total==null?null:Number(v.total),total,'Existing valuation total does not match its questions');
        }
        console.log(JSON.stringify({exam:exam.title,subjects:ids.length,valuations:before.valuations.filter(selected).length,published_results:before.results.filter(selected).length,conversion:'Each mark × 0.8; 10 × 8 = 80; pass mark 40 → 32'}));
        if(!process.argv.includes('--apply')) { await client.query('ROLLBACK'); return; }
        const backupDir = path.resolve('tmp/exam-workbook'); fs.mkdirSync(backupDir,{recursive:true});
        const backupPath = path.join(backupDir,`before-hifz-80-${Date.now()}.json`);
        fs.writeFileSync(backupPath,JSON.stringify({examId,exam,...before},null,2),{flag:'wx'});
        await client.query(`UPDATE exam_portal_valuations v SET marks=(SELECT jsonb_agg(CASE WHEN item='null'::jsonb THEN 'null'::jsonb ELSE to_jsonb(round((item::text)::numeric*0.8,10)) END ORDER BY position) FROM jsonb_array_elements(v.marks) WITH ORDINALITY AS entries(item,position)),total=round(total*0.8,10),version=version+1,updated_at=now() WHERE exam_id=$1 AND subject_id=ANY($2::uuid[])`,[examId,ids]);
        await client.query('UPDATE exam_results SET marks_obtained=round(marks_obtained*0.8,10),updated_at=now() WHERE exam_id=$1 AND subject_id=ANY($2::uuid[])',[examId,ids]);
        await client.query('UPDATE exam_subjects SET question_max=8,max_marks=80,min_marks=min_marks*0.8 WHERE exam_id=$1 AND id=ANY($2::uuid[])',[examId,ids]);
        // Invalidate pre-conversion open forms, including empty unsaved valuations.
        await client.query('UPDATE exam_portal_allocations SET mark_revision=mark_revision+1 WHERE exam_id=$1',[examId]);
        const after = await snapshot(client);
        assert.deepEqual(after.subjects.filter(s=>!ids.includes(s.id)),before.subjects.filter(s=>!ids.includes(s.id)),'Non-target subject configuration changed');
        assert.deepEqual(after.valuations.filter(v=>!selected(v)),before.valuations.filter(v=>!selected(v)),'Non-target valuations changed');
        assert.deepEqual(after.results.filter(v=>!selected(v)),before.results.filter(v=>!selected(v)),'Non-target results changed');
        assert.equal(after.valuations.length,before.valuations.length); assert.equal(after.results.length,before.results.length);
        for(const v of before.valuations.filter(selected)) {
            const saved=after.valuations.find(row=>row.student_id===v.student_id && row.subject_id===v.subject_id);
            assert.deepEqual(saved.marks,v.marks.map(scaled));
            assert.equal(Number(saved.total),Number(scaled(v.total)));
            assert.equal(saved.status,v.status); assert.equal(saved.version,v.version+1);
            const sum=saved.marks.every(n=>n===null)?null:Number(saved.marks.reduce((a,n)=>a+(n??0),0).toFixed(10));
            assert.equal(saved.total==null?null:Number(saved.total),sum);
            if(v.status==='submitted') {
                const result=after.results.find(r=>r.student_id===v.student_id && r.subject_id===v.subject_id);
                assert(result,'Missing published result'); assert.equal(Number(result.marks_obtained),Number(saved.total));
            }
        }
        for(const r of before.results.filter(selected)) assert.equal(Number(after.results.find(row=>row.id===r.id).marks_obtained),scaled(r.marks_obtained));
        for(const s of after.subjects.filter(s=>ids.includes(s.id))) {assert.equal(Number(s.max_marks),80);assert.equal(s.question_max,8);assert.equal(Number(s.min_marks),scaled(before.subjects.find(row=>row.id===s.id).min_marks));}
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,'Administrator requested conversion','rescale_subject_marks',$2)",[examId,JSON.stringify({subject_ids:ids,subject_name:'Hifz Valuation',factor:0.8,old_maximum:100,new_maximum:80,old_question_max:10,new_question_max:8,valuations:before.valuations.filter(selected).length,other_subjects_unchanged:true})]);
        await client.query('COMMIT');
        console.log('Verified and committed: all target questions/totals converted; Muraja’a and other subjects unchanged. Original records backed up locally.');
    } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>pool.end());
