// Import column F only, matching column B against the November exam allocations.
// Inspection by default; --apply saves verified numeric rows, leaving blank marks unchanged.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const x=require('../backend/node_modules/xlsx');
require('../backend/node_modules/dotenv').config({path:'.env.local',quiet:true});
const {Pool}=require('../backend/node_modules/pg');
const pool=new Pool({connectionString:process.env.POSTGRES_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const examId='0d268d5b-29ea-43e1-9ddb-6334f4750df1',file='C:/Users/swabe/OneDrive/Desktop/Portion mark.xlsx';
const w=x.readFile(file),raw=x.utils.sheet_to_json(w.Sheets.Students,{header:1,defval:null});
assert.equal(raw[0][1],'Roll No');assert.equal(raw[0][5],'Part Mark');
const rows=raw.slice(1).filter(r=>r[1]).map(r=>({student_id:String(r[1]).trim(),name:r[2],mark:r[5]}));
assert.equal(new Set(rows.map(r=>r.student_id)).size,rows.length);
const blank=rows.filter(r=>r.mark===null||r.mark==='');const numeric=rows.filter(r=>!blank.includes(r));
for(const r of numeric)assert(typeof r.mark==='number'&&Number.isFinite(r.mark)&&r.mark>=0&&r.mark<=20,`Invalid mark for ${r.student_id}`);
(async()=>{const c=await pool.connect();try{
await c.query('BEGIN');
const exam=(await c.query('SELECT title,portal_slug FROM exams WHERE id=$1 FOR UPDATE',[examId])).rows[0];assert.equal(exam.portal_slug,'half-yearly-hifz-nov26');
const allocations=(await c.query('SELECT a.*,c.examiner_name FROM exam_portal_allocations a JOIN exam_portal_centers c ON c.id=a.center_id WHERE a.exam_id=$1 FOR UPDATE OF a',[examId])).rows;
const subjects=(await c.query("SELECT * FROM exam_subjects WHERE exam_id=$1 AND name='Hifz Portion' FOR UPDATE",[examId])).rows;
const unmatched=numeric.filter(r=>!allocations.some(a=>a.student_id===r.student_id));
if(unmatched.length)console.log(JSON.stringify({unmatched_student_records:(await c.query('SELECT adm_no,name,status,standard,school_standard,hifz_standard FROM students WHERE adm_no=ANY($1::text[])',[unmatched.map(r=>r.student_id)])).rows}));
const plan=numeric.filter(r=>!unmatched.includes(r)).map(r=>{const a=allocations.find(a=>a.student_id===r.student_id),subs=subjects.filter(s=>s.standard===a.standard);assert.equal(subs.length,1,`Subject missing for ${r.student_id} (${a.standard})`);const s=subs[0];assert.equal(s.question_count,1);assert.equal(Number(s.question_max),20);assert.equal(Number(s.max_marks),20);return {...r,subject_id:s.id,standard:a.standard,site_name:a.student_name,examiner_name:a.examiner_name};});
const subjectIds=subjects.map(s=>s.id);
const before=(await c.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND subject_id=ANY($2::uuid[]) FOR UPDATE',[examId,subjectIds])).rows;
const results=(await c.query('SELECT * FROM exam_results WHERE exam_id=$1 AND subject_id=ANY($2::uuid[]) FOR UPDATE',[examId,subjectIds])).rows;
console.log(JSON.stringify({exam:exam.title,source_rows:rows.length,import_count:plan.length,blank:blank.map(r=>({id:r.student_id,name:r.name})),unmatched,subjects:subjects.map(s=>({standard:s.standard,questions:s.question_count,max:s.max_marks})),existing:before.length,name_differences:plan.filter(r=>r.name.trim().toUpperCase()!==r.site_name.trim().toUpperCase()).map(r=>({id:r.student_id,sheet:r.name,site:r.site_name})),total:plan.reduce((a,r)=>a+r.mark,0)}));
if(!process.argv.includes('--apply')){await c.query('ROLLBACK');return;}
// Stop on any unmatched real student; a spreadsheet-only test row is reported and excluded.
assert(unmatched.every(r=>['R152','R999'].includes(r.student_id)),'Unmatched student needs review');
const dir=path.resolve('tmp/exam-workbook');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`before-portion-import-${Date.now()}.json`),JSON.stringify({examId,file,allocations,subjects,before,results,plan,blank,unmatched},null,2),{flag:'wx'});
const payload=JSON.stringify(plan);
await c.query(`INSERT INTO exam_portal_valuations(exam_id,student_id,subject_id,marks,juz,remarks,status,total,examiner_name,submitted_at)
 SELECT $1,r.student_id,r.subject_id,jsonb_build_array(r.mark),'','','submitted',r.mark,r.examiner_name,now()
 FROM jsonb_to_recordset($2::jsonb) AS r(student_id text,subject_id uuid,mark numeric,examiner_name text)
 ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET marks=EXCLUDED.marks,total=EXCLUDED.total,status='submitted',submitted_at=COALESCE(exam_portal_valuations.submitted_at,now()),updated_at=now(),version=exam_portal_valuations.version+1`,[examId,payload]);
await c.query(`INSERT INTO exam_results(exam_id,student_id,subject_id,marks_obtained)
 SELECT $1,r.student_id,r.subject_id,r.mark FROM jsonb_to_recordset($2::jsonb) AS r(student_id text,subject_id uuid,mark numeric)
 ON CONFLICT(student_id,subject_id) DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained,updated_at=now()`,[examId,payload]);
await c.query('UPDATE exam_portal_allocations SET mark_revision=mark_revision+1 WHERE exam_id=$1 AND student_id=ANY($2::text[])',[examId,plan.map(r=>r.student_id)]);
const after=(await c.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND subject_id=ANY($2::uuid[])',[examId,subjectIds])).rows;
const afterResults=(await c.query('SELECT * FROM exam_results WHERE exam_id=$1 AND subject_id=ANY($2::uuid[])',[examId,subjectIds])).rows;
for(const r of plan){const v=after.find(v=>v.student_id===r.student_id&&v.subject_id===r.subject_id);assert.deepEqual(v.marks,[r.mark]);assert.equal(Number(v.total),r.mark);assert.equal(v.status,'submitted');assert.equal(Number(afterResults.find(v=>v.student_id===r.student_id&&v.subject_id===r.subject_id).marks_obtained),r.mark);}
for(const v of before.filter(v=>!plan.some(r=>r.student_id===v.student_id&&r.subject_id===v.subject_id)))assert.deepEqual(after.find(a=>a.student_id===v.student_id&&a.subject_id===v.subject_id),v);
await c.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,'Administrator requested workbook import','import_hifz_portion',$2)",[examId,JSON.stringify({source:path.basename(file),column:'F',subject:'Hifz Portion',count:plan.length,blank:blank.map(r=>r.student_id),excluded:unmatched.map(r=>r.student_id)})]);
await c.query('COMMIT');console.log(`Verified and committed ${plan.length} Hifz Portion marks. Blank rows unchanged.`);
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
