// Run against a disposable local PostgreSQL cluster; never touches the project database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('../backend/node_modules/pg');
const express = require('../backend/node_modules/express');
const cookieParser = require('../backend/node_modules/cookie-parser');
const jwt = require('../backend/node_modules/jsonwebtoken');
const XLSX = require('../backend/node_modules/xlsx');
process.env.TS_NODE_PROJECT = path.resolve('backend/tsconfig.json');
require('../backend/node_modules/ts-node/register/transpile-only');
const maintenanceUrl = process.env.EXAM_TEST_DATABASE_URL || 'postgres://postgres@127.0.0.1:55439/postgres';
const parsed = new URL(maintenanceUrl);
assert(['127.0.0.1', 'localhost'].includes(parsed.hostname), 'Tests require a local database.');
const databaseName = `exam_portal_test_${randomUUID().replaceAll('-', '')}`;
const adminDb = new Pool({ connectionString: maintenanceUrl });
let server, closeDatabasePool, testDb, created = false;
let passed = 0;
function check(label, fn) { fn(); passed++; console.log(`PASS ${label}`); }
async function main() {
    await adminDb.query(`CREATE DATABASE ${databaseName}`); created = true;
    parsed.pathname = `/${databaseName}`;
    process.env.DATABASE_URL = process.env.POSTGRES_URL = parsed.toString();
    process.env.DB_SSL = 'false'; process.env.JWT_SECRET = 'exam-portal-disposable-test-secret'; process.env.NODE_ENV = 'test';
    testDb = new Pool({ connectionString: parsed.toString() });
    await testDb.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
      CREATE TABLE students(adm_no text PRIMARY KEY,name text NOT NULL,status text NOT NULL DEFAULT 'active');
      CREATE TABLE exams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,type text,department text,start_date date NOT NULL,end_date date,is_active boolean DEFAULT true,created_at timestamptz DEFAULT now());
      CREATE TABLE exam_subjects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,name text NOT NULL,standard text,max_marks integer,min_marks integer,created_at timestamptz DEFAULT now());
      CREATE TABLE exam_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),exam_id uuid REFERENCES exams(id) ON DELETE CASCADE,student_id text REFERENCES students(adm_no),subject_id uuid REFERENCES exam_subjects(id) ON DELETE CASCADE,marks_obtained numeric NOT NULL,remarks text,grader_id uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(student_id,subject_id));`);
    await testDb.query(fs.readFileSync('supabase/migrations/20261126000000_examiner_portals.sql', 'utf8'));
    await testDb.query(fs.readFileSync('supabase/migrations/20261126010000_exam_administration_access.sql', 'utf8'));
    const fixture = require('../backend/src/exam-allocation-nov26.json');
    const rows = fixture.centers.flatMap(c => c.students.map(s => ({ ...s, code: c.code })));
    for (const row of rows) await testDb.query('INSERT INTO students(adm_no,name) VALUES($1,$2)', [row.admission_no, row.name]);
    const service = require('../backend/src/services/exam-portal.service');
    check('132 exact, unique allocation rows with required center counts', () => { assert.equal(rows.length,132); assert.equal(new Set(rows.map(s=>s.admission_no)).size,132); assert.deepEqual(fixture.centers.map(c=>c.students.length),[13,13,13,13,13,14,14,13,13,13]); });
    const workbookPath = process.argv[2];
    if (workbookPath) check('Excel parser matches independently extracted workbook allocation exactly', () => assert.deepEqual(service.parseAllocationWorkbook(fs.readFileSync(workbookPath)), rows.map(({code,serial_no,admission_no,name,standard})=>({code,serial_no,admission_no,name,standard}))));
    check('Duplicate admission and serial numbers are rejected', () => { assert.throws(()=>service.validateAllocation([...rows,rows[0]]),/Duplicate/);assert.throws(()=>service.validateAllocation([{...rows[0],serial_no:2}]),/restart/); });
    check('Blank is distinct from zero and decimals/negatives/out of range fail', () => { assert.deepEqual(service.validateMarks([null,0],2,10,false),{marks:[null,0],total:0}); assert.equal(service.validateMarks([null,null],2,10,false).total,null);for(const value of [-1,11,1.5,'4',false])assert.throws(()=>service.validateMarks([value],1,10,true));assert.throws(()=>service.validateMarks([null],1,10,true)); });
    const app = express();app.use(express.json());app.use(cookieParser());
    app.use('/api/exams',require('../backend/src/routes/exams.routes').default);
    app.use('/api/exam-portal',require('../backend/src/routes/exam-portal.routes').default);
    closeDatabasePool = require('../backend/src/config/db').closeDatabasePool;
    const databaseApi = require('../backend/src/config/db').db;
    const databaseQuery = databaseApi.query;
    let countedQueries = 0;
    databaseApi.query = async (sql, params) => { if (!/^DELETE FROM exam_portal_(admin_)?sessions WHERE expires_at/.test(sql)) countedQueries++; return databaseQuery(sql, params); };
    server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const adminToken=jwt.sign({id:randomUUID(),role:'admin'},process.env.JWT_SECRET);
    async function call(url, body, cookie='',method=body===undefined?'GET':'POST') {
        const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
        const data=await response.json().catch(()=>null);return {status:response.status,data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
    }
    const admin=(url,body,method)=>call(url,body,`auth_token=${adminToken}`,method);
    let r=await admin('/exams',{title:fixture.title,department:'Hifz',type:'Hifz',start_date:'2026-11-26',is_active:true});
    check('New Hifz exam automatically gets its own URL',()=>{assert.equal(r.status,201);assert.match(r.data.exam.portal_slug,/mid-term-hifz/);});
    const id=r.data.exam.id;let slug=r.data.exam.portal_slug;const management=`/exams/${id}/portal`;
    let queryStart = countedQueries;
    r=await call(`/exam-portal/${slug}/bootstrap`);check('Examiner login screen uses one public query and no unauthorized response',()=>{assert.equal(r.status,200);assert.equal(r.data.authenticated,false);assert.equal(countedQueries-queryStart,1);});
    queryStart=countedQueries;
    r=await call(`/exam-portal/${slug}/admin/bootstrap`);check('Administration login screen uses one query without 401 session probes',()=>{assert.equal(r.status,200);assert.equal(r.data.authenticated,false);assert.equal(countedQueries-queryStart,1);});
    r=await call(management);check('Unauthenticated administration denied',()=>assert.equal(r.status,401));
    r=await call(management,undefined,`auth_token=${jwt.sign({id:randomUUID(),role:'mentor'},process.env.JWT_SECRET)}`);check('Mentor cannot manage examiner credentials',()=>assert.equal(r.status,403));
    r=await admin(management);check('Readiness identifies the missing student roster before setup',()=>{
        assert.equal(r.status,200);assert.equal(r.data.readiness.ready,false);assert.equal(r.data.readiness.student_count,0);
        assert(r.data.readiness.issues.some(issue=>issue.type==='students'));
    });
    r=await call(`/exam-portal/${slug}`);check('Closed portal does not list sign-in centers',()=>assert.deepEqual(r.data.centers,[]));
    r=await admin(management,{slug:'nov26',enabled:true},'PATCH');check('Administrator can open the portal before importing a roster or configuring centers',()=>assert.equal(r.status,200));slug='nov26';
    r=await call(`/exam-portal/${slug}`);check('An open portal without generated passcodes returns an empty center list',()=>{assert.equal(r.status,200);assert.equal(r.data.exam.portal_enabled,true);assert.deepEqual(r.data.centers,[]);});
    r=await admin(management,{slug:'invalid/slug',enabled:false},'PATCH');check('Invalid URL settings are rejected',()=>assert.equal(r.status,400));
    r=await admin(management);check('Rejected settings preserve the saved URL and open access state',()=>{
        assert.equal(r.data.exam.portal_slug,slug);assert.equal(r.data.exam.portal_enabled,true);
    });
    r=await admin(management+'/import?preview=true',{source:'nov26'});check('Import preview verifies all students',()=>{assert.equal(r.status,200);assert.equal(r.data.summary.total,132);});
    check('Preview leaves no allocations',()=>{});assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_portal_allocations')).rows[0].n,0);
    r=await admin(management+'/import',{source:'nov26'});check('Atomic allocation import succeeds',()=>{assert.equal(r.status,200);assert.equal(r.data.summary.unique,132);});
    r=await admin(management+'/import',{source:'nov26'});check('Repeat import cannot replace roster or duplicate students',()=>assert.equal(r.status,409));
    let data=(await admin(management)).data;check('All centers and workbook class labels persisted',()=>{assert.equal(data.centers.length,10);assert.equal(data.students.length,132);assert(data.subjects.some(s=>s.standard==='Non-class'));assert(data.subjects.some(s=>s.standard==='Plus Two'));});
    check('Readiness lists exact A–J centers missing examiner names and passcodes',()=>{
        assert.equal(data.readiness.ready,false);assert.equal(data.readiness.student_count,132);
        for(const type of ['examiner_name','passcode']) {
            assert.deepEqual(data.readiness.issues.filter(issue=>issue.type===type).map(issue=>issue.center_code).sort(),fixture.centers.map(c=>c.code));
        }
        assert(!data.readiness.issues.some(issue=>issue.type==='students'||issue.type==='subjects'));
    });
    r=await admin(management,{slug,enabled:true},'PATCH');check('Missing names and passcodes in all centers do not block opening the portal',()=>assert.equal(r.status,200));
    r=await call(`/exam-portal/${slug}`);check('Ungenerated centers are excluded from the public selector',()=>assert.deepEqual(r.data.centers,[]));
    const setupG=data.centers.find(c=>c.code==='G');
    r=await admin(`${management}/centers/${setupG.id}`,{examiner_name:'Examiner G',reset_passcode:true},'PATCH');const onlyGPasscode=r.data.passcode;
    r=await admin(management,{slug,enabled:true},'PATCH');check('Portal opens when only Center G has generated access',()=>assert.equal(r.status,200));
    r=await call(`/exam-portal/${slug}`);check('Only the generated center is listed, without private examiner or credential data',()=>{assert.deepEqual(r.data.centers,[{code:'G',name:'Exam Center G'}]);assert.deepEqual(Object.keys(r.data).sort(),['centers','exam','success']);assert(!JSON.stringify(r.data).includes(onlyGPasscode));});
    r=await call(`/exam-portal/${slug}/login`,{center:'A',passcode:onlyGPasscode});check('An ungenerated center cannot use another center passcode',()=>assert.equal(r.status,401));
    queryStart=countedQueries;
    r=await call(`/exam-portal/${slug}/login`,{center:'G',passcode:onlyGPasscode});check('Generated Center G can sign in while other centers remain unconfigured',()=>assert.equal(r.status,200));const onlyGCookie=r.cookie;
    check('Examiner login returns its roster in three database round trips',()=>{assert.equal(countedQueries-queryStart,3);assert.equal(r.data.roster.center.code,'G');assert.equal(r.data.roster.students.length,14);assert(!JSON.stringify(r.data).includes('passcode_hash'));});
    queryStart=countedQueries;
    r=await call(`/exam-portal/${slug}/bootstrap`,undefined,onlyGCookie);check('Existing examiner session opens from a single database read',()=>{assert.equal(r.status,200);assert.equal(r.data.authenticated,true);assert.equal(countedQueries-queryStart,1);});
    const gRoster=(await call(`/exam-portal/${slug}/roster`,undefined,onlyGCookie)).data;
    check('Partial setup login still restricts the examiner to the exact Center G roster',()=>assert.deepEqual(gRoster.students.map(s=>s.student_id),fixture.centers.find(c=>c.code==='G').students.map(s=>s.admission_no)));
    const gStudent=gRoster.students.find(s=>s.standard!=='Non-class');const gSubject=gRoster.subjects.find(s=>s.standard===gStudent.standard);
    r=await call(`/exam-portal/${slug}/valuation`,{student_id:gStudent.student_id,subject_id:gSubject.id,marks:Array(gSubject.question_count).fill(null),juz:'',remarks:'Partial setup draft',version:0,status:'draft'},onlyGCookie);check('A generated center can save assigned-student question marks during partial setup',()=>assert.equal(r.status,200));
    await admin(management,{slug,enabled:false},'PATCH');
    r=await call(`/exam-portal/${slug}`);check('Closing access hides even previously generated centers',()=>assert.deepEqual(r.data.centers,[]));
    r=await call(`/exam-portal/${slug}/login`,{center:'G',passcode:onlyGPasscode});check('Closing access prevents generated-center login',()=>assert.equal(r.status,401));
    await admin(management,{slug,enabled:true},'PATCH');
    const setupA=data.centers.find(c=>c.code==='A');const setupB=data.centers.find(c=>c.code==='B');
    await admin(`${management}/centers/${setupA.id}`,{examiner_name:'Examiner A'},'PATCH');
    await admin(`${management}/centers/${setupB.id}`,{reset_passcode:true},'PATCH');
    r=await admin(management);check('Readiness distinguishes name-only and passcode-only center setup',()=>{
        const issuesA=r.data.readiness.issues.filter(issue=>issue.center_id===setupA.id);
        const issuesB=r.data.readiness.issues.filter(issue=>issue.center_id===setupB.id);
        assert.deepEqual(issuesA.map(issue=>issue.type),['passcode']);
        assert.deepEqual(issuesB.map(issue=>issue.type),['examiner_name']);
    });
    await admin(`${management}/centers/${setupA.id}`,{reset_passcode:true},'PATCH');
    r=await call(`/exam-portal/${slug}`);check('Newly generated Center A becomes selectable while other centers remain unconfigured',()=>assert.deepEqual(r.data.centers.map(c=>c.code),['A','B','G']));
    const unconfigured=data.subjects.find(s=>s.standard==='Plus Two');
    await testDb.query('UPDATE exam_subjects SET question_count=NULL,question_max=NULL WHERE id=$1',[unconfigured.id]);
    r=await admin(management);check('Readiness identifies the exact standard without a configured subject',()=>{
        assert(r.data.readiness.issues.some(issue=>issue.type==='subjects'&&issue.standard==='Plus Two'&&issue.message.includes('Plus Two')));
    });
    r=await admin(management,{slug,enabled:true},'PATCH');check('A standard still awaiting question setup does not block global portal access',()=>assert.equal(r.status,200));
    await testDb.query('UPDATE exam_subjects SET question_count=10,question_max=10 WHERE id=$1',[unconfigured.id]);
    r=await admin(management+'/centers',{code:'K'});check('Admin can create an additional center',()=>assert.equal(r.status,200));
    const extra=(await admin(management)).data.centers.find(c=>c.code==='K');
    r=await admin(`${management}/centers/${extra.id}`,undefined,'DELETE');check('Empty center can be deleted',()=>assert.equal(r.status,200));
    r=await admin(`${management}/centers/${data.centers[0].id}`,undefined,'DELETE');check('Occupied center cannot be deleted',()=>assert.equal(r.status,409));
    const nonclass=data.subjects.find(s=>s.standard==='Non-class');
    r=await admin(management+'/subjects',{subject_id:nonclass.id,name:nonclass.name,standard:nonclass.standard,question_count:5,question_max:4,min_marks:8});check('Per-standard question configuration derives the maximum',()=>assert.equal(r.status,200));
    assert.equal((await admin(management)).data.subjects.find(s=>s.id===nonclass.id).max_marks,20);
    const credentials={};
    for(const center of data.centers){r=await admin(`${management}/centers/${center.id}`,{examiner_name:`Examiner ${center.code}`,reset_passcode:true},'PATCH');assert.equal(r.status,200);credentials[center.code]=r.data.passcode;}
    check('Every center has a separate generated passcode',()=>assert.equal(new Set(Object.values(credentials)).size,10));
    r=await admin(management);check('Admin data never reveals password hashes or plain passcodes',()=>{assert(!JSON.stringify(r.data).includes('passcode_hash'));assert(!JSON.stringify(r.data).includes(credentials.A));});
    check('Fully configured occupied centers are ready to open',()=>{assert.equal(r.data.readiness.ready,true);assert.equal(r.data.readiness.student_count,132);assert.deepEqual(r.data.readiness.issues,[]);});
    await admin(management+'/centers',{code:'L'});
    const emptyCenterData=(await admin(management)).data;
    check('An unconfigured empty center does not block exam readiness',()=>{assert.equal(emptyCenterData.readiness.ready,true);assert.deepEqual(emptyCenterData.readiness.issues,[]);});
    r=await admin(management,{slug:'nov26',enabled:true},'PATCH');check('Configured portal can open at a custom URL with an empty spare center',()=>assert.equal(r.status,200));slug='nov26';
    const spare=emptyCenterData.centers.find(c=>c.code==='L');await admin(`${management}/centers/${spare.id}`,undefined,'DELETE');
    r=await call(`/exam-portal/${slug}`);check('Public page exposes only exam availability and generated center labels',()=>{assert.equal(r.status,200);assert(!r.data.students);assert.deepEqual(r.data.centers,data.centers.map(c=>({code:c.code,name:c.name})));});
    r=await call(`/exam-portal/${slug}/login`,{center:'A',passcode:'wrong'});check('Wrong passcode is rejected',()=>assert.equal(r.status,401));
    const cookies={};
    for(const center of data.centers){r=await call(`/exam-portal/${slug}/login`,{center:center.code,passcode:credentials[center.code]});assert.equal(r.status,200);cookies[center.code]=r.cookie;const roster=await call(`/exam-portal/${slug}/roster`,undefined,r.cookie);check(`Center ${center.code} sees exactly its assigned students`,()=>assert.deepEqual(roster.data.students.map(s=>s.student_id),fixture.centers.find(c=>c.code===center.code).students.map(s=>s.admission_no)));}
    r=await call('/exams',undefined,cookies.A);check('Examiner session grants no institution access',()=>assert.equal(r.status,401));
    r=await call(`/exam-portal/other-exam/roster`,undefined,cookies.A);check('Session cannot cross exam URLs',()=>assert.equal(r.status,401));
    const roster=(await call(`/exam-portal/${slug}/roster`,undefined,cookies.A)).data;
    const student=roster.students[0];const subject=roster.subjects.find(s=>s.standard===student.standard);
    const payload={student_id:student.student_id,subject_id:subject.id,version:0,status:'draft',marks:[0,null,...Array(8).fill(10)],juz:'1–5',remarks:'Test valuation'};
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,student_id:fixture.centers[1].students[0].admission_no},cookies.A);check('Cross-center submission denied on server',()=>assert.equal(r.status,403));
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,status:'submitted',confirmed:true},cookies.A);check('Final submission requires every question',()=>assert.equal(r.status,400));
    r=await call(`/exam-portal/${slug}/valuation`,payload,cookies.A);check('Draft retains blank mark and calculates partial total',()=>{assert.equal(r.status,200);assert.equal(r.data.valuation.marks[1],null);assert.equal(r.data.valuation.total,80);});
    check('Draft does not publish an exam result',()=>{});assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_results')).rows[0].n,0);
    r=await call(`/exam-portal/${slug}/valuation`,payload,cookies.A);check('Stale tab cannot overwrite a newer draft',()=>assert.equal(r.status,409));
    const raceStudent=roster.students[1];const raceSubject=roster.subjects.find(s=>s.standard===raceStudent.standard);
    const racing=await Promise.all([1,2].map(()=>call(`/exam-portal/${slug}/valuation`,{...payload,student_id:raceStudent.student_id,subject_id:raceSubject.id,marks:Array(raceSubject.question_count).fill(null)},cookies.A)));
    check('Concurrent saves cannot silently overwrite each other',()=>assert.deepEqual(racing.map(r=>r.status).sort(),[200,409]));
    r=await call(`/exam-portal/${slug}/logout`,{},cookies.A);assert.equal(r.status,200);
    r=await call(`/exam-portal/${slug}/roster`,undefined,cookies.A);check('Logout invalidates stored session',()=>assert.equal(r.status,401));
    r=await call(`/exam-portal/${slug}/login`,{center:'A',passcode:credentials.A});cookies.A=r.cookie;
    r=await call(`/exam-portal/${slug}/roster`,undefined,cookies.A);check('Draft persists across logout and fresh login',()=>assert.equal(r.data.valuations[0].marks[1],null));
    r=await admin(management+'/subjects',{subject_id:subject.id,name:subject.name,standard:subject.standard,question_count:5,question_max:10,min_marks:20});check('Question setup cannot change after marking starts',()=>assert.equal(r.status,409));
    const final={...payload,version:1,marks:[0,...Array(9).fill(10)],status:'submitted',confirmed:true};
    r=await call(`/exam-portal/${slug}/valuation`,{...final,confirmed:false},cookies.A);check('Final submission requires examiner confirmation',()=>assert.equal(r.status,400));
    r=await call(`/exam-portal/${slug}/valuation`,final,cookies.A);check('Final submission computes correct total from zero and ten marks',()=>{assert.equal(r.status,200);assert.equal(r.data.valuation.total,90);assert(r.data.valuation.submitted_at);});
    r=await admin(`/exams/${id}/marks`);check('Submitted total appears directly in existing exam setup',()=>{assert.equal(r.data.marks[0].marks_obtained,'90');assert.equal(r.data.marks[0].student_id,student.student_id);});
    r=await call(`/exam-portal/${slug}/valuation`,{...final,version:2},cookies.A);check('Submitted marks cannot be overwritten',()=>assert.equal(r.status,409));
    r=await admin(`/exams/${id}/marks`,{updates:[{subject_id:subject.id,student_id:student.student_id,marks_obtained:40}]});check('Manual totals cannot contradict detailed examiner marks',()=>assert.equal(r.status,400));
    const exportRes=await fetch(base+management+'/export',{headers:{Cookie:`auth_token=${adminToken}`}});const wb=XLSX.read(Buffer.from(await exportRes.arrayBuffer()),{type:'buffer'});const exported=XLSX.utils.sheet_to_json(wb.Sheets['Result Register']);
    check('Excel export includes zero marks, submitted totals and ten centers',()=>{assert.equal(exportRes.status,200);assert.equal(wb.SheetNames.length,11);const row=exported.find(r=>r['AD. NO']===student.student_id);assert.equal(row.Q1,0);assert.equal(row.Total,90);assert.equal(row.Status,'submitted');});
    r=await admin(management+'/reopen',{student_id:student.student_id,subject_id:subject.id,confirmed:true});check('Admin can reopen a locked valuation',()=>assert.equal(r.status,200));
    assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_results')).rows[0].n,0);
    r=await call(`/exam-portal/${slug}/valuation`,{...final,version:3},cookies.A);check('Reopened valuation can be corrected and republished',()=>assert.equal(r.status,200));
    const centerA=data.centers.find(c=>c.code==='A');
    r=await admin(`${management}/centers/${centerA.id}`,{locked:true},'PATCH');assert.equal(r.status,200);
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,student_id:roster.students[1].student_id},cookies.A);check('Center lock prevents writes',()=>assert.equal(r.status,423));
    await admin(`${management}/centers/${centerA.id}`,{locked:false},'PATCH');
    r=await admin(`${management}/centers/${centerA.id}`,{reset_passcode:true},'PATCH');credentials.A=r.data.passcode;
    r=await call(`/exam-portal/${slug}/roster`,undefined,cookies.A);check('Passcode reset immediately revokes old sessions',()=>assert.equal(r.status,401));
    r=await call(`/exam-portal/${slug}/login`,{center:'A',passcode:credentials.A});cookies.A=r.cookie;
    await admin(`/exams/${id}/status`,{is_active:false},'PATCH');
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,student_id:roster.students[1].student_id},cookies.A);check('Completed exam prevents writes',()=>assert.equal(r.status,423));
    await admin(`/exams/${id}/status`,{is_active:true},'PATCH');
    r=await admin(management+'/move',{student_id:student.student_id,center_id:data.centers.find(c=>c.code==='B').id});check('Admin can move student while preserving existing valuation',()=>assert.equal(r.status,200));
    const a=(await call(`/exam-portal/${slug}/roster`,undefined,cookies.A)).data;const b=(await call(`/exam-portal/${slug}/roster`,undefined,cookies.B)).data;
    check('Moved student disappears from old center and marks follow to destination',()=>{assert(!a.students.some(s=>s.student_id===student.student_id));assert(b.students.some(s=>s.student_id===student.student_id));assert(b.valuations.some(v=>v.student_id===student.student_id&&v.total===90));assert.deepEqual(a.students.map(s=>s.serial_no),Array.from({length:12},(_,i)=>i+1));});
    r=await admin(management+'?audit=true');check('Audit preserves prior marks and loads only when requested',()=>assert(r.data.audit.some(a=>a.action==='reopen'&&a.details.previous.total===90)));
    await admin(management,{slug,enabled:false},'PATCH');
    r=await call(`/exam-portal/${slug}/roster`,undefined,cookies.B);check('Closing portal revokes access to roster',()=>assert.equal(r.status,401));
    const newExam=(await admin('/exams',{title:'Another exam',department:'Hifz',type:'Hifz',start_date:'2026-11-26'})).data.exam;
    check('Independent exams get distinct URLs',()=>assert.notEqual(newExam.portal_slug,slug));
    const scopedBase=`/exam-portal/${slug}/admin`;
    const administrationPasscode='Exam-Admin-Local-26';
    r=await call(scopedBase,undefined,`auth_token=${adminToken}`);check('Institution cookie does not bypass exam administration passcode',()=>assert.equal(r.status,401));
    r=await admin(management+'/admin-passcode',{passcode:'short'});check('Administration passcode validates minimum length',()=>assert.equal(r.status,400));
    r=await call(management+'/admin-passcode',{passcode:administrationPasscode},`auth_token=${jwt.sign({id:randomUUID(),role:'mentor'},process.env.JWT_SECRET)}`);check('Only institution administrators can set exam administration passcode',()=>assert.equal(r.status,403));
    r=await admin(management+'/admin-passcode',{passcode:administrationPasscode});check('Institution admin can set a separate passcode for this exam',()=>assert.equal(r.status,200));
    r=await call(scopedBase+'/login',{passcode:'incorrect'});check('Incorrect administration passcode denied',()=>assert.equal(r.status,401));
    queryStart=countedQueries;
    r=await call(scopedBase+'/login',{passcode:administrationPasscode});let adminCookie=r.cookie;check('Exam administration can sign in with passcode alone',()=>assert.equal(r.status,200));
    check('Administration login returns its complete dashboard in three database round trips',()=>{assert.equal(countedQueries-queryStart,3);assert.equal(r.data.data.exam.id,id);assert.equal(r.data.data.students.length,132);assert.deepEqual(r.data.data.audit,[]);});
    queryStart=countedQueries;
    r=await call(scopedBase+'/bootstrap',undefined,adminCookie);check('Administration session resumes with one database query',()=>{assert.equal(r.status,200);assert.equal(r.data.authenticated,true);assert.equal(countedQueries-queryStart,1);});
    r=await call(scopedBase,undefined,adminCookie);check('Passcode session can read only its exam administration',()=>{assert.equal(r.status,200);assert.equal(r.data.exam.id,id);assert(!JSON.stringify(r.data).includes('passcode_hash'));});
    r=await call('/exams',undefined,adminCookie);check('Exam administration session grants no institution access',()=>assert.equal(r.status,401));
    r=await call(`/exam-portal/${newExam.portal_slug}/admin`,undefined,adminCookie);check('Administration session cannot cross into another exam',()=>assert.equal(r.status,401));
    r=await call(scopedBase,undefined,cookies.B);check('Examiner session cannot act as exam administrator',()=>assert.equal(r.status,401));
    r=await call(scopedBase+'/admin-passcode',{passcode:'Unwanted-Change'},adminCookie);check('Exam administrator cannot change institution-controlled administration credential',()=>assert.equal(r.status,404));
    r=await call(scopedBase+'/move',{student_id:student.student_id,center_id:centerA.id},adminCookie);check('Exam administrator can move students between already generated centers',()=>assert.equal(r.status,200));
    r=await call(scopedBase+'/move',{student_id:student.student_id,center_id:data.centers.find(c=>c.code==='B').id},adminCookie);assert.equal(r.status,200);
    const anotherSubject=randomUUID();const otherExamSubject=randomUUID();
    await testDb.query("INSERT INTO exam_subjects(id,exam_id,name,standard,max_marks,min_marks,question_count,question_max) VALUES($1,$2,'Second valuation',$3,100,40,10,10)",[anotherSubject,id,student.standard]);
    await testDb.query("INSERT INTO exam_subjects(id,exam_id,name,standard,max_marks,min_marks) VALUES($1,$2,'Other exam',$3,100,40)",[otherExamSubject,newExam.id,student.standard]);
    await testDb.query('INSERT INTO exam_results(exam_id,student_id,subject_id,marks_obtained) VALUES($1,$2,$3,25),($4,$2,$5,70)',[id,student.student_id,anotherSubject,newExam.id,otherExamSubject]);
    await testDb.query("INSERT INTO exam_portal_valuations(exam_id,student_id,subject_id,marks,total,examiner_name) VALUES($1,$2,$3,'[null,null,null,null,null,null,null,null,null,null]',NULL,'Examiner B')",[id,student.student_id,anotherSubject]);
    r=await call(scopedBase+'/reset-student',{student_id:student.student_id},adminCookie);check('Student mark reset requires explicit confirmation',()=>assert.equal(r.status,400));
    const peerBefore=(await testDb.query('SELECT count(*)::int AS n FROM exam_portal_valuations WHERE exam_id=$1 AND student_id<>$2',[id,student.student_id])).rows[0].n;
    r=await call(scopedBase+'/reset-student',{student_id:student.student_id,confirmed:true},adminCookie);check('Confirmed reset deletes every subject draft and result for this student in this exam',()=>{assert.equal(r.status,200);assert.equal(r.data.deleted_valuations,2);assert.equal(r.data.deleted_results,2);});
    check('Reset preserves peer marks, other-exam results and student assignment',()=>{});
    assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_portal_valuations WHERE exam_id=$1 AND student_id<>$2',[id,student.student_id])).rows[0].n,peerBefore);
    assert.equal((await testDb.query('SELECT marks_obtained FROM exam_results WHERE exam_id=$1 AND student_id=$2',[newExam.id,student.student_id])).rows[0].marks_obtained,'70');
    assert.equal((await testDb.query('SELECT center_id,mark_revision FROM exam_portal_allocations WHERE exam_id=$1 AND student_id=$2',[id,student.student_id])).rows[0].mark_revision,1);
    r=await call(scopedBase+'/reset-student',{student_id:'R999999',confirmed:true},adminCookie);check('Reset rejects a student outside the current exam',()=>assert.equal(r.status,404));
    await call(scopedBase,{slug,enabled:true},adminCookie,'PATCH');
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,version:0},cookies.B);check('Old examiner tab cannot restore marks after administrator reset',()=>assert.equal(r.status,409));
    r=await call(`/exam-portal/${slug}/valuation`,{...payload,version:0,mark_revision:1},cookies.B);check('Fresh valuation can start again after reset',()=>assert.equal(r.status,200));
    await admin(management+'/admin-passcode',{passcode:'Rotated-Exam-Admin-26'});
    r=await call(scopedBase,undefined,adminCookie);check('Changing administration passcode immediately revokes previous sessions',()=>assert.equal(r.status,401));
    r=await call(scopedBase+'/login',{passcode:'Rotated-Exam-Admin-26'});adminCookie=r.cookie;
    await call(scopedBase+'/logout',{},adminCookie);r=await call(scopedBase,undefined,adminCookie);check('Exam administration logout revokes its session',()=>assert.equal(r.status,401));
    await admin(management+'/admin-passcode',{passcode:administrationPasscode});
    if(process.env.EXAM_PORTAL_UI_CHECKS==='1') {
        await admin(management,{slug,enabled:true},'PATCH');
        await browserChecks({base,id,slug,adminToken,passcode:credentials.A,centerBPasscode:credentials.B,administrationPasscode});
    }
    console.log(`\n${passed} examination portal checks passed.`);
}
async function browserChecks({base,id,slug,adminToken,passcode,centerBPasscode,administrationPasscode}) {
    const {createRequire}=require('node:module');
    const runtimeRequire=createRequire('C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules/package.json');
    const {chromium}=runtimeRequire('playwright');
    const {spawn}=require('node:child_process');
    const outDir=path.resolve('tmp/exam-portal-ui');fs.mkdirSync(outDir,{recursive:true});
    const originalIncludes=new Set(JSON.parse(fs.readFileSync('tsconfig.json','utf8')).include);
    const log=fs.openSync(path.join(outDir,'next.log'),'w');
    const frontend=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3108'],{env:{...process.env,NODE_ENV:'development',NEXT_DIST_DIR:'.next-exam-portal-qa',BACKEND_API_URL:base,NEXT_PUBLIC_API_URL:base},stdio:['ignore',log,log],windowsHide:true});
    let browser;let completedStudentId;
    try {
        const origin='http://127.0.0.1:3108';
        for(let i=0;i<90;i++){try{const r=await fetch(origin+`/hifz/exam/${slug}`);if(r.ok)break;}catch{}if(i===89)throw new Error('Frontend did not start.');await new Promise(resolve=>setTimeout(resolve,1000));}
        browser=await chromium.launch({channel:'msedge',headless:true});
        const adminRequest=async(url,body,method='PATCH')=>{
            const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',Cookie:`auth_token=${adminToken}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
            assert.equal(response.status,200);return response.json();
        };
        const setupData=await adminRequest(`/exams/${id}/portal`,undefined,'GET');
        const availableCenter=setupData.centers.find(c=>c.code==='A');
        const credentialBackup=(await testDb.query('SELECT id,passcode_hash FROM exam_portal_centers WHERE exam_id=$1',[id])).rows;
        await adminRequest(`/exams/${id}/portal`,{slug,enabled:false});
        await testDb.query('UPDATE exam_portal_centers SET passcode_hash=NULL WHERE exam_id=$1 AND id<>$2',[id,availableCenter.id]);
        await adminRequest(`/exams/${id}/portal/centers/${availableCenter.id}`,{examiner_name:''});
        const diagnosticsContext=await browser.newContext({viewport:{width:1440,height:1000}});
        try {
            await diagnosticsContext.addCookies([{name:'auth_token',value:adminToken,url:origin,httpOnly:true,sameSite:'Lax'}]);
            const diagnosticsPage=await diagnosticsContext.newPage();
            const adminResponses=[];diagnosticsPage.on('response',response=>{if(response.url().includes('/api/exam-portal/'))adminResponses.push({url:new URL(response.url()).pathname,method:response.request().method(),status:response.status()});});
            await diagnosticsPage.goto(origin+`/hifz/exam/${slug}/administration`);
            await diagnosticsPage.getByLabel('Administration passcode',{exact:true}).fill(administrationPasscode);
            check('Administration sign-in page makes one bootstrap request and no expected 401 calls',()=>{assert.equal(adminResponses.filter(r=>r.url.endsWith('/admin/bootstrap')).length,1);assert(!adminResponses.some(r=>r.status===401));});
            assert.equal(await diagnosticsPage.getByLabel('Email address',{exact:true}).count(),0);
            await diagnosticsPage.getByRole('button',{name:'Open examination administration',exact:true}).click();
            const access=diagnosticsPage.getByRole('region',{name:'Center access'});
            await access.waitFor();
            check('Administration opens directly from login without repeated dashboard fetches',()=>{assert.equal(adminResponses.filter(r=>r.method==='POST'&&r.url.endsWith('/admin/login')).length,1);assert.equal(adminResponses.filter(r=>r.method==='GET'&&r.url.endsWith('/admin')).length,0);});
            const availableCount=await access.getByText('1 of 10 centers available for sign in',{exact:false}).count();
            check('Administration shows available center access without demanding complete setup',()=>assert.equal(availableCount,1));
            await diagnosticsPage.getByRole('button',{name:'Portal & subjects',exact:true}).click();
            await diagnosticsPage.getByRole('checkbox',{name:'Open examiner access',exact:true}).check();
            await diagnosticsPage.getByRole('button',{name:'Save settings',exact:true}).click();
            await diagnosticsPage.getByRole('status').filter({hasText:'Portal settings saved.'}).waitFor();
            const nowOpen=await diagnosticsPage.getByText('Examiner portal open',{exact:false}).count();
            check('Administration can open the portal with only one generated passcode',()=>assert.equal(nowOpen,1));
            await diagnosticsPage.screenshot({path:path.join(outDir,'desktop-partial-access.png'),fullPage:true});
            const partialContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
            try {
                const partialPage=await partialContext.newPage();await partialPage.goto(origin+`/hifz/exam/${slug}`);
                const examinerResponses=[];partialPage.on('response',response=>{if(response.url().includes('/api/exam-portal/'))examinerResponses.push({url:new URL(response.url()).pathname,method:response.request().method(),status:response.status()});});
                const centerSelect=partialPage.getByLabel('Exam center',{exact:true});await centerSelect.waitFor();
                const optionValues=await centerSelect.locator('option').evaluateAll(options=>options.map(option=>option.value));
                check('Public center selector lists only the passcode-enabled center',()=>assert.deepEqual(optionValues,['','A']));
                await centerSelect.selectOption('A');await partialPage.getByLabel('Passcode',{exact:true}).fill(passcode);
                await partialPage.screenshot({path:path.join(outDir,'mobile-center-selector.png'),fullPage:true});
                await partialPage.getByRole('button',{name:'Open my center',exact:true}).click();await partialPage.getByText('Your assigned students',{exact:true}).waitFor();
                check('Center login renders returned roster without a second roster request',()=>{assert.equal(examinerResponses.filter(r=>r.method==='POST'&&r.url.endsWith('/login')).length,1);assert.equal(examinerResponses.filter(r=>r.url.endsWith('/roster')).length,0);assert(!examinerResponses.some(r=>r.status===401));});
                const assignedCount=await partialPage.locator('article').count();
                check('Selecting an available center and passcode opens its assigned marking roster',()=>assert.equal(assignedCount,12));
            } finally {await partialContext.close();}
        } finally {
            await diagnosticsContext.close();
            for(const center of credentialBackup)await testDb.query('UPDATE exam_portal_centers SET passcode_hash=$1 WHERE id=$2',[center.passcode_hash,center.id]);
            await adminRequest(`/exams/${id}/portal/centers/${availableCenter.id}`,{examiner_name:availableCenter.examiner_name});
            await adminRequest(`/exams/${id}/portal`,{slug,enabled:true});
        }
        const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
        const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(origin+`/hifz/exam/${slug}`);await page.getByRole('heading',{name:'Examiner sign in'}).waitFor();
        await page.screenshot({path:path.join(outDir,'mobile-login.png'),fullPage:true});
        check('Mobile login has no horizontal overflow',()=>{});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.getByLabel('Exam center',{exact:true}).selectOption('A');await page.getByLabel('Passcode',{exact:true}).fill(passcode);await page.getByRole('button',{name:'Open my center'}).click();await page.getByText('Your assigned students',{exact:true}).waitFor();
        await page.screenshot({path:path.join(outDir,'mobile-roster.png'),fullPage:true});
        check('Mobile login opens only the center roster',()=>{});assert.equal(await page.locator('article').count(),12);
        await page.locator('article').first().getByRole('button').first().click();await page.getByLabel('Juz / portion examined').fill('Juz 2–6');
        for(let i=1;i<=10;i++)await page.getByLabel(`Question ${i}`,{exact:true}).fill(i===1?'0':'10');
        await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
        await page.screenshot({path:path.join(outDir,'mobile-marking.png'),fullPage:true});
        check('Mobile valuation calculates 90/100 and saves a draft',()=>{});assert(await page.getByText('90',{exact:false}).count());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.getByRole('checkbox').check();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Submit valuation',exact:true}).click();await page.getByRole('status').filter({hasText:'Valuation submitted'}).waitFor();
        check('Mobile final submission locks question inputs',()=>{});assert(await page.getByLabel('Question 1',{exact:true}).isDisabled());
        await page.reload();await page.getByText('Your assigned students',{exact:true}).waitFor();
        check('Browser reload retains examiner session and submitted progress',()=>{});assert(await page.getByText('1 of 12 completed',{exact:false}).count());
        check('Examiner name is emphasized and assigned-students label stays secondary',()=>{});assert.equal(await page.getByRole('heading',{name:'Examiner A',exact:true}).count(),1);assert.equal(await page.getByText('Your assigned students',{exact:true}).evaluate(node=>node.tagName),'P');
        const transferredData=await adminRequest(`/exams/${id}/portal`,undefined,'GET');const originCenter=transferredData.centers.find(c=>c.code==='A');const destinationCenter=transferredData.centers.find(c=>c.code==='B');
        completedStudentId=transferredData.valuations.find(v=>v.status==='submitted'&&transferredData.students.some(s=>s.student_id===v.student_id&&s.center_id===originCenter.id)).student_id;
        const destinationContext=await browser.newContext({viewport:{width:390,height:844}});
        try {
            const destinationPage=await destinationContext.newPage();await destinationPage.goto(origin+`/hifz/exam/${slug}`);await destinationPage.getByLabel('Exam center',{exact:true}).selectOption('B');await destinationPage.getByLabel('Passcode',{exact:true}).fill(centerBPasscode);await destinationPage.getByRole('button',{name:'Open my center'}).click();await destinationPage.getByText('Your assigned students',{exact:true}).waitFor();
            await adminRequest(`/exams/${id}/portal/move`,{student_id:completedStudentId,center_id:destinationCenter.id},'POST');
            await page.locator('article').filter({hasText:completedStudentId}).waitFor({state:'detached'});await destinationPage.locator('article').filter({hasText:completedStudentId}).waitFor();
            check('Transferred student updates in both already-open generated centers without re-login',()=>{});assert.equal(await destinationPage.locator('article').filter({hasText:completedStudentId}).count(),1);
            await adminRequest(`/exams/${id}/portal/move`,{student_id:completedStudentId,center_id:originCenter.id},'POST');
        } finally {await destinationContext.close();}
        await context.close();
        const adminContext=await browser.newContext({viewport:{width:1440,height:1000}});await adminContext.addCookies([{name:'auth_token',value:adminToken,url:origin,httpOnly:true,sameSite:'Lax'}]);
        const adminPage=await adminContext.newPage();adminPage.on('pageerror',e=>errors.push(e.message));await adminPage.goto(origin+`/hifz/exam/${slug}/administration`);await adminPage.getByLabel('Administration passcode',{exact:true}).fill(administrationPasscode);await adminPage.getByRole('button',{name:'Open examination administration',exact:true}).click();await adminPage.getByRole('heading',{name:'Valuation progress'}).waitFor();
        await adminPage.screenshot({path:path.join(outDir,'desktop-progress.png'),fullPage:true});
        await adminPage.getByRole('button',{name:'Portal & subjects',exact:true}).click();await adminPage.getByRole('heading',{name:'Subjects and questions'}).waitFor();await adminPage.screenshot({path:path.join(outDir,'desktop-setup.png'),fullPage:true});
        await adminPage.getByRole('button',{name:'Centers & examiners',exact:true}).click();await adminPage.getByRole('heading',{name:'Centers and examiner access'}).waitFor();assert.equal(await adminPage.getByRole('button',{name:'Save name',exact:true}).count(),10);
        await adminPage.getByRole('button',{name:'Results & reports',exact:true}).click();await adminPage.getByRole('heading',{name:'Results and printable sheets'}).waitFor();await adminPage.getByLabel('Report type').selectOption('allocations');await adminPage.screenshot({path:path.join(outDir,'desktop-center-lists.png'),fullPage:true});
        await adminPage.getByLabel('Student whose exam marks to reset').selectOption(completedStudentId);
        adminPage.once('dialog',dialog=>dialog.dismiss());await adminPage.getByRole('button',{name:'Reset student marks',exact:true}).click();
        assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2',[id,completedStudentId])).rows[0].n,1);
        adminPage.once('dialog',dialog=>dialog.accept());await adminPage.getByRole('button',{name:'Reset student marks',exact:true}).click();await adminPage.getByRole('status').filter({hasText:'Student marks reset.'}).waitFor();
        check('Passcode administrator can confirm a student reset; cancelling preserves the marks',()=>{});assert.equal((await testDb.query('SELECT count(*)::int AS n FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2',[id,completedStudentId])).rows[0].n,0);
        await adminPage.emulateMedia({media:'print'});await adminPage.pdf({path:path.join(outDir,'center-lists.pdf'),format:'A4',printBackground:true});await adminPage.emulateMedia({media:'screen'});
        await adminPage.setViewportSize({width:390,height:844});await adminPage.getByRole('button',{name:'Portal & subjects',exact:true}).click();await adminPage.screenshot({path:path.join(outDir,'mobile-administration.png'),fullPage:true});
        check('Administration works on desktop and mobile without overflow',()=>{});assert(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        check('Examiner and administration pages have no browser runtime errors',()=>assert.deepEqual(errors,[]));
        const timeoutContext=await browser.newContext({viewport:{width:390,height:844}});
        try {
            const timeoutPage=await timeoutContext.newPage();
            await timeoutPage.goto(origin+`/hifz/exam/${slug}/administration`);
            await timeoutPage.getByLabel('Administration passcode',{exact:true}).fill(administrationPasscode);
            // Simulate a connection that never produces an authentication response.
            await timeoutPage.route('**/api/exam-portal/*/admin/login',()=>{});
            await timeoutPage.getByRole('button',{name:'Open examination administration',exact:true}).click();
            await timeoutPage.getByRole('alert').filter({hasText:'The connection took too long'}).waitFor({timeout:20000});
            check('A stalled administration login stops spinning and offers a safe retry',()=>{});assert(await timeoutPage.getByRole('button',{name:'Open examination administration',exact:true}).isEnabled());
        } finally {await timeoutContext.close();}
        await adminContext.close();console.log(`Browser previews: ${outDir}`);
    } finally {
        if(browser)await browser.close();frontend.kill();fs.closeSync(log);
        const config=JSON.parse(fs.readFileSync('tsconfig.json','utf8'));
        const includes=config.include.filter(p=>!p.startsWith('.next-exam-portal-qa/')||originalIncludes.has(p));
        if(includes.length!==config.include.length){config.include=includes;fs.writeFileSync('tsconfig.json',JSON.stringify(config,null,2)+'\n');}
    }
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
    if(server) await new Promise(resolve=>server.close(resolve));
    if(closeDatabasePool)await closeDatabasePool();
    if(testDb)await testDb.end();
    if(created){assert(/^exam_portal_test_[a-f0-9]{32}$/.test(databaseName));await adminDb.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);}
    await adminDb.end();
});
