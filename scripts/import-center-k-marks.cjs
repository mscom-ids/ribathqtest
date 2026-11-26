// Inspect by default; --apply imports only the supplied Centre K workbook.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../backend/node_modules/xlsx');
require('../backend/node_modules/dotenv').config({path:'.env.local',quiet:true});
const {Pool} = require('../backend/node_modules/pg');
const pool = new Pool({connectionString:process.env.POSTGRES_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const examId='0d268d5b-29ea-43e1-9ddb-6334f4750df1';
const file='C:/Users/swabe/OneDrive/Desktop/K CODE FILE TO ENTER MARKS.xlsx';
const workbook=XLSX.readFile(file);
const rows=XLSX.utils.sheet_to_json(workbook.Sheets['Center K'],{header:1,defval:null}).filter(r=>typeof r[1]==='string' && /^R\d+$/.test(r[1]));
const students=rows.map(r=>({id:r[1],name:r[2],juz:r[3]??'',marks:r.slice(4,14),total:r[14]}));
assert.equal(students.length,12);assert.equal(new Set(students.map(s=>s.id)).size,12);
for(const s of students){assert.equal(s.juz,'');assert.equal(s.marks.length,10);assert(s.marks.every(n=>typeof n==='number'&&n>=0&&n<=8));assert(Math.abs(s.marks.reduce((a,b)=>a+b,0)-s.total)<0.000001);}
(async()=>{const client=await pool.connect();try{
 await client.query('BEGIN');
 const exam=(await client.query('SELECT title,portal_slug FROM exams WHERE id=$1 FOR UPDATE',[examId])).rows[0];
 assert.equal(exam?.portal_slug,'half-yearly-hifz-nov26');
 const centers=(await client.query("SELECT id,code,examiner_name FROM exam_portal_centers WHERE exam_id=$1 AND code='K' FOR UPDATE",[examId])).rows;assert.equal(centers.length,1);const center=centers[0];
 const allocations=(await client.query('SELECT * FROM exam_portal_allocations WHERE exam_id=$1 AND center_id=$2 ORDER BY serial_no FOR UPDATE',[examId,center.id])).rows;
 const subjects=(await client.query("SELECT * FROM exam_subjects WHERE exam_id=$1 AND name='Hifz Valuation' FOR UPDATE",[examId])).rows;
 const ids=students.map(s=>s.id);
 const before=(await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=ANY($2::text[]) FOR UPDATE',[examId,ids])).rows;
 const results=(await client.query('SELECT * FROM exam_results WHERE exam_id=$1 AND student_id=ANY($2::text[]) FOR UPDATE',[examId,ids])).rows;
 const plan=students.map(s=>{const a=allocations.find(a=>a.student_id===s.id);assert(a,`Not in Centre K: ${s.id}`);const matches=subjects.filter(sub=>sub.standard===a.standard);assert.equal(matches.length,1);const sub=matches[0];assert.equal(sub.question_count,10);assert.equal(Number(sub.question_max),8);assert.equal(Number(sub.max_marks),80);return {...s,subjectId:sub.id,siteName:a.student_name,standard:a.standard};});
 console.log(JSON.stringify({exam:exam.title,center:center.code,students:plan.map(s=>({id:s.id,name:s.name,siteName:s.siteName,standard:s.standard,total:s.total})),existing:before.filter(v=>plan.some(s=>s.id===v.student_id&&s.subjectId===v.subject_id)).map(v=>({student:v.student_id,status:v.status,total:v.total})),juz:'blank',questions:10,maximum:80}));
 if(!process.argv.includes('--apply')){await client.query('ROLLBACK');return;}
 const dir=path.resolve('tmp/exam-workbook');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`before-center-k-import-${Date.now()}.json`),JSON.stringify({examId,source:file,center,allocations,subjects,before,results,plan},null,2),{flag:'wx'});
 for(const s of plan){
  await client.query(`INSERT INTO exam_portal_valuations(exam_id,student_id,subject_id,marks,juz,remarks,status,total,examiner_name,submitted_at) VALUES($1,$2,$3,$4,'','','submitted',$5,$6,now()) ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET marks=EXCLUDED.marks,juz='',status='submitted',total=EXCLUDED.total,submitted_at=COALESCE(exam_portal_valuations.submitted_at,now()),version=exam_portal_valuations.version+1,updated_at=now()`,[examId,s.id,s.subjectId,JSON.stringify(s.marks),s.total,center.examiner_name]);
  await client.query(`INSERT INTO exam_results(exam_id,student_id,subject_id,marks_obtained) VALUES($1,$2,$3,$4) ON CONFLICT(student_id,subject_id) DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained,updated_at=now()`,[examId,s.id,s.subjectId,s.total]);
  await client.query('UPDATE exam_portal_allocations SET mark_revision=mark_revision+1 WHERE exam_id=$1 AND student_id=$2',[examId,s.id]);
 }
 const after=(await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=ANY($2::text[])',[examId,ids])).rows;
 const afterResults=(await client.query('SELECT * FROM exam_results WHERE exam_id=$1 AND student_id=ANY($2::text[])',[examId,ids])).rows;
 for(const s of plan){const v=after.find(v=>v.student_id===s.id&&v.subject_id===s.subjectId);assert.deepEqual(v.marks,s.marks);assert.equal(v.juz,'');assert.equal(Number(v.total),s.total);assert.equal(v.status,'submitted');assert.equal(Number(afterResults.find(r=>r.student_id===s.id&&r.subject_id===s.subjectId).marks_obtained),s.total);}
 for(const v of before.filter(v=>!plan.some(s=>s.id===v.student_id&&s.subjectId===v.subject_id)))assert.deepEqual(after.find(a=>a.student_id===v.student_id&&a.subject_id===v.subject_id),v);
 await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,'Administrator requested workbook import','import_center_k_marks',$2)",[examId,JSON.stringify({source:path.basename(file),center:'K',subject:'Hifz Valuation',students:ids,questions:10,juz:'blank',totals:plan.map(s=>({student_id:s.id,total:s.total}))})]);
 await client.query('COMMIT');console.log('Verified and committed 12 students, 120 question marks, blank Juz fields, and matching exam results.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
