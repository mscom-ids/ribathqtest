// One-time November exam total adjustment. Individual question marks remain original.
// Read-only inspection by default; --apply backs up and verifies a single transaction.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('../backend/node_modules/dotenv').config({path:'.env.local',quiet:true});
const {Pool}=require('../backend/node_modules/pg');
const pool=new Pool({connectionString:process.env.POSTGRES_URL||process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const examId='0d268d5b-29ea-43e1-9ddb-6334f4750df1';
const round=n=>n==null?null:Math.ceil(Number((Number(n)*4).toFixed(8)))/4;
for(const [a,b] of [[56.8,57],[22.4,22.5],[77.2,77.25],[64.7,64.75],[20,20],[22.25,22.25],[22.5,22.5],[22.75,22.75],[0,0],[80,80]])assert.equal(round(a),b);
async function snapshot(c){return {valuations:(await c.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 ORDER BY student_id,subject_id',[examId])).rows,results:(await c.query('SELECT * FROM exam_results WHERE exam_id=$1 ORDER BY id',[examId])).rows};}
(async()=>{const c=await pool.connect();try{
await c.query('BEGIN');const exam=(await c.query('SELECT title,portal_slug FROM exams WHERE id=$1 FOR UPDATE',[examId])).rows[0];assert.equal(exam.portal_slug,'half-yearly-hifz-nov26');
const subjects=(await c.query('SELECT * FROM exam_subjects WHERE exam_id=$1 FOR UPDATE',[examId])).rows;
const targets=subjects.filter(s=>s.name.toLowerCase()==='hifz valuation');assert.equal(targets.length,9);assert(targets.every(s=>Number(s.max_marks)===80));
const ids=targets.map(s=>s.id),target=r=>ids.includes(r.subject_id);
await c.query('SELECT student_id FROM exam_portal_valuations WHERE exam_id=$1 FOR UPDATE',[examId]);await c.query('SELECT id FROM exam_results WHERE exam_id=$1 FOR UPDATE',[examId]);
const before=await snapshot(c);
const changed=before.valuations.filter(v=>target(v)&&v.total!=null&&Number(v.total)!==round(v.total));
const changedResults=before.results.filter(r=>target(r)&&r.marks_obtained!=null&&Number(r.marks_obtained)!==round(r.marks_obtained));
console.log(JSON.stringify({exam:exam.title,rule:'Round total upward to next 0.25; question marks unchanged',valuations_to_change:changed.length,results_to_change:changedResults.length,examples:changed.slice(0,8).map(v=>({student:v.student_id,before:Number(v.total),after:round(v.total)}))}));
if(!process.argv.includes('--apply')||(!changed.length&&!changedResults.length)){await c.query('ROLLBACK');return;}
const dir=path.resolve('tmp/exam-workbook');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`before-quarter-rounding-${Date.now()}.json`),JSON.stringify({examId,subjects,...before},null,2),{flag:'wx'});
await c.query('UPDATE exam_portal_valuations SET total=ceil(total*4)/4,version=version+1,updated_at=now() WHERE exam_id=$1 AND subject_id=ANY($2::uuid[]) AND total<>ceil(total*4)/4',[examId,ids]);
await c.query('UPDATE exam_results SET marks_obtained=ceil(marks_obtained*4)/4,updated_at=now() WHERE exam_id=$1 AND subject_id=ANY($2::uuid[]) AND marks_obtained<>ceil(marks_obtained*4)/4',[examId,ids]);
await c.query('UPDATE exam_portal_allocations SET mark_revision=mark_revision+1 WHERE exam_id=$1 AND student_id=ANY($2::text[])',[examId,[...new Set(changed.map(v=>v.student_id))]]);
const after=await snapshot(c);assert.equal(after.valuations.length,before.valuations.length);assert.equal(after.results.length,before.results.length);
for(const b of before.valuations){const a=after.valuations.find(a=>a.student_id===b.student_id&&a.subject_id===b.subject_id);if(!target(b)){assert.deepEqual(a,b);continue;}assert.deepEqual(a.marks,b.marks);assert.equal(a.juz,b.juz);assert.equal(a.status,b.status);assert.equal(a.remarks,b.remarks);assert.equal(a.total==null?null:Number(a.total),round(b.total));assert(Number(a.total)<=80);}
for(const b of before.results){const a=after.results.find(a=>a.id===b.id);if(!target(b)){assert.deepEqual(a,b);continue;}assert.equal(a.marks_obtained==null?null:Number(a.marks_obtained),round(b.marks_obtained));}
for(const v of after.valuations.filter(v=>target(v)&&v.status==='submitted')){const r=after.results.find(r=>r.student_id===v.student_id&&r.subject_id===v.subject_id);assert(r);assert.equal(Number(v.total),Number(r.marks_obtained));}
assert.deepEqual((await c.query('SELECT * FROM exam_subjects WHERE exam_id=$1',[examId])).rows.sort((a,b)=>a.id.localeCompare(b.id)),subjects.sort((a,b)=>a.id.localeCompare(b.id)));
await c.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,'Administrator requested quarter-mark rounding','round_hifz_valuation_totals',$2)",[examId,JSON.stringify({subject:'Hifz Valuation',rule:'ceil(total*4)/4',questions_unchanged:true,other_subjects_unchanged:true,changes:changed.map(v=>({student_id:v.student_id,subject_id:v.subject_id,before:Number(v.total),after:round(v.total)})),results:changedResults.length})]);
await c.query('COMMIT');console.log(`Committed and verified ${changed.length} valuation totals and ${changedResults.length} results. Other subjects and question marks unchanged.`);
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
