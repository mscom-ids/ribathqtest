import { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomBytes, createHash } from 'crypto';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import { db } from '../config/db';
import { PortalError, importAllocation, parseAllocationWorkbook, validateMarks, verifyAllocationStudents } from '../services/exam-portal.service';
import allocation from '../exam-allocation-nov26.json';
import type { QueryResult } from 'pg';
import { readAdministrationData, readExaminerSession, readPublicPortal, schedulePortalSessionCleanup } from '../services/exam-portal-read.service';
import type { ExamAdministrationRequest } from './exam-administration.controller';
import { createValuationWorkbook } from '../services/valuation-workbook.service';
import { createResultExportRows } from '../services/exam-result-export.service';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
type CenterRow = {id:string;exam_id:string;code:string;name:string;examiner_name:string;locked:boolean;is_active:boolean;portal_enabled:boolean;passcode_hash:string|null};
type PortalRequest = Request & {examCenter:CenterRow;user?:{id:string}};
const actor = (req: Request) => (req as ExamAdministrationRequest).examAdministration ? 'Exam administration' : String((req as PortalRequest).user?.id || 'administrator');
const cookieOptions = (slug: string) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: `/api/exam-portal/${slug}` });
export const portalAction = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => async (req, res) => {
    try { await fn(req, res); }
    catch (e) {
        if (!(e instanceof PortalError)) console.error('[Exam portal]', e);
        res.status(e instanceof PortalError ? e.status : 500).json({ success: false, error: e instanceof PortalError ? e.message : 'Unable to complete this action. Please try again.', ...(e instanceof PortalError && e.details ? { details: e.details } : {}) });
    }
};
async function examById(id: unknown, client: {query:(sql:string,params?:unknown[])=>Promise<QueryResult>} = db, lock = false, req?: Request) {
    const result = await client.query(`SELECT * FROM exams WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id]);
    if (!result.rows.length) throw new PortalError('Exam not found.', 404);
    if (String(result.rows[0].department).toLowerCase() !== 'hifz') throw new PortalError('Examiner portals are available for Hifz exams.', 400);
    const scope = (req as ExamAdministrationRequest | undefined)?.examAdministration;
    if (scope) {
        const session = await client.query('SELECT 1 FROM exam_portal_admin_sessions WHERE token_hash=$1 AND exam_id=$2 AND expires_at>now()', [scope.token_hash, id]);
        if (scope.exam_id !== id || !session.rows.length) throw new PortalError('Administration session expired. Enter the passcode again.', 401);
    }
    return result.rows[0];
}
export const publicExam = portalAction(async (req, res) => {
    res.json({ success: true, ...await readPublicPortal(req.params.slug) });
});
export const examinerBootstrap = portalAction(async (req, res) => {
    const token = req.cookies?.examiner_session;
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
        const data = await readExaminerSession(req.params.slug, digest(token));
        if (data) { res.json({ success: true, authenticated: true, exam: data.exam, roster: data }); return; }
        res.clearCookie('examiner_session', cookieOptions(String(req.params.slug)));
    }
    res.json({ success: true, authenticated: false, ...await readPublicPortal(req.params.slug) });
});
export const examinerLogin = portalAction(async (req, res) => {
    const code = String(req.body.center || '').trim().toUpperCase();
    const passcode = String(req.body.passcode || '');
    const result = await db.query('SELECT c.id,c.passcode_hash,e.portal_enabled FROM exam_portal_centers c JOIN exams e ON e.id=c.exam_id WHERE e.portal_slug=$1 AND c.code=$2', [req.params.slug, code]);
    const center = result.rows[0];
    // Always perform a password check to avoid exposing configured center codes by timing.
    const fallback = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5vXImS4K0K6DWEJt8DYf0Z9k85A9TWK';
    const valid = await bcrypt.compare(passcode.slice(0, 128), center?.passcode_hash || fallback);
    if (!center?.portal_enabled || !center?.passcode_hash || !valid || passcode.length > 128) throw new PortalError('Invalid center or passcode, or the portal is not open.', 401);
    const token = randomBytes(32).toString('hex');
    const inserted = await db.query(`INSERT INTO exam_portal_sessions(token_hash,center_id,expires_at)
        SELECT $1,current.id,now()+interval '12 hours' FROM
        (SELECT c.id FROM exam_portal_centers c JOIN exams e ON e.id=c.exam_id
         WHERE c.id=$2 AND c.passcode_hash=$3 AND e.portal_enabled FOR UPDATE OF c) current RETURNING center_id`,
    [digest(token), center.id, center.passcode_hash]);
    if (!inserted.rows.length) throw new PortalError('Passcode changed or portal closed. Please sign in again.', 401);
    const data = await readExaminerSession(req.params.slug, digest(token));
    if (!data) throw new PortalError('Session changed or portal closed. Please sign in again.', 401);
    res.cookie('examiner_session', token, { ...cookieOptions(String(req.params.slug)), maxAge: 12 * 60 * 60 * 1000 });
    res.json({ success: true, authenticated: true, exam: data.exam, roster: data });
    schedulePortalSessionCleanup();
});
export const examinerSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies?.examiner_session;
        if (!token || typeof token !== 'string' || token.length !== 64) throw new PortalError('Please sign in to this exam.', 401);
        const result = await db.query(`SELECT c.*,e.is_active,e.portal_enabled FROM exam_portal_sessions s JOIN exam_portal_centers c ON c.id=s.center_id JOIN exams e ON e.id=c.exam_id WHERE s.token_hash=$1 AND s.expires_at>now() AND e.portal_slug=$2`, [digest(token), req.params.slug]);
        if (!result.rows.length || !result.rows[0].portal_enabled) throw new PortalError('Session expired. Please sign in again.', 401);
        (req as PortalRequest).examCenter = result.rows[0]; next();
    } catch (e) { res.status(e instanceof PortalError ? e.status : 500).json({ success: false, error: e instanceof PortalError ? e.message : 'Unable to verify session.' }); }
};
export const examinerLogout = portalAction(async (req, res) => {
    if (req.cookies?.examiner_session) await db.query('DELETE FROM exam_portal_sessions WHERE token_hash=$1', [digest(req.cookies.examiner_session)]);
    res.clearCookie('examiner_session', cookieOptions(String(req.params.slug)));
    res.json({ success: true });
});
export const examinerRoster = portalAction(async (req, res) => {
    const token = req.cookies?.examiner_session;
    const data = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? await readExaminerSession(req.params.slug, digest(token)) : undefined;
    if (!data) throw new PortalError('Session expired. Please sign in again.', 401);
    res.json({ success: true, ...data });
});
export const saveValuation = portalAction(async (req, res) => {
    const c = (req as PortalRequest).examCenter;
    const { subject_id, student_id, version, status, confirmed } = req.body;
    if (!['draft', 'submitted'].includes(status) || !Number.isInteger(version) || version < 0) throw new PortalError('Invalid valuation status or version.');
    const juz = String(req.body.juz || '').trim(); const remarks = String(req.body.remarks || '').trim();
    if (juz.length > 120 || remarks.length > 2000) throw new PortalError('Juz or remarks are too long.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const exam = await examById(c.exam_id, client, true);
        const center = (await client.query('SELECT * FROM exam_portal_centers WHERE id=$1 FOR UPDATE', [c.id])).rows[0];
        const session = await client.query('SELECT 1 FROM exam_portal_sessions WHERE token_hash=$1 AND center_id=$2 AND expires_at>now()', [digest(req.cookies.examiner_session), c.id]);
        if (!session.rows.length || !exam.portal_enabled) throw new PortalError('Session expired. Sign in again.', 401);
        if (!exam.is_active || center.locked) throw new PortalError('This mark sheet is locked or the exam is completed.', 423);
        const assigned = await client.query('SELECT * FROM exam_portal_allocations WHERE exam_id=$1 AND student_id=$2 AND center_id=$3', [c.exam_id, student_id, c.id]);
        if (!assigned.rows.length) throw new PortalError('Student is not assigned to your center.', 403);
        if ((req.body.mark_revision ?? 0) !== assigned.rows[0].mark_revision) throw new PortalError('Administration reset this student’s marks. Reload the student before marking again.', 409);
        const subjects = await client.query('SELECT * FROM exam_subjects WHERE exam_id=$1 AND id=$2 AND standard=$3 AND question_count IS NOT NULL', [c.exam_id, subject_id, assigned.rows[0].standard]);
        if (!subjects.rows.length) throw new PortalError('Subject is not configured for this student.');
        const s = subjects.rows[0]; const submit = status === 'submitted';
        if (submit && (confirmed !== true || !center.examiner_name.trim())) throw new PortalError('Confirm your valuation. An examiner name must be configured.');
        const checked = validateMarks(req.body.marks, s.question_count, s.question_max, submit);
        const previous = (await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3', [c.exam_id, student_id, subject_id])).rows[0];
        if (previous?.total != null) previous.total = Number(previous.total);
        if (previous?.status === 'submitted') throw new PortalError('Submitted marks are locked. Ask an administrator to reopen them.', 409);
        if ((previous?.version || 0) !== version) throw new PortalError('This valuation changed in another tab. Reload before saving.', 409);
        if (submit) {
            const existing = await client.query('SELECT 1 FROM exam_results WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3', [c.exam_id, student_id, subject_id]);
            if (existing.rows.length) throw new PortalError('An existing admin result must be reopened by an administrator before submission.', 409);
        }
        const saved = await client.query(`INSERT INTO exam_portal_valuations(exam_id,student_id,subject_id,marks,juz,remarks,status,total,examiner_name,submitted_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $7='submitted' THEN now() END)
            ON CONFLICT(exam_id,student_id,subject_id) DO UPDATE SET marks=EXCLUDED.marks,juz=EXCLUDED.juz,remarks=EXCLUDED.remarks,status=EXCLUDED.status,total=EXCLUDED.total,examiner_name=EXCLUDED.examiner_name,submitted_at=EXCLUDED.submitted_at,updated_at=now(),version=exam_portal_valuations.version+1 RETURNING *`,
        [c.exam_id, student_id, subject_id, JSON.stringify(checked.marks), juz, remarks, status, checked.total, center.examiner_name]);
        if (saved.rows[0].total != null) saved.rows[0].total = Number(saved.rows[0].total);
        if (submit) await client.query('INSERT INTO exam_results(exam_id,student_id,subject_id,marks_obtained,remarks) VALUES($1,$2,$3,$4,$5)', [c.exam_id, student_id, subject_id, checked.total, remarks || null]);
        await client.query('INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,$3,$4)', [c.exam_id, `Center ${center.code}: ${center.examiner_name}`, status, JSON.stringify({ student_id, subject_id, previous: previous || null, valuation: saved.rows[0] })]);
        await client.query('COMMIT'); res.json({ success: true, valuation: saved.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});

export const adminPortalData = portalAction(async (req, res) => {
    const data = await readAdministrationData({ examId: req.params.id }, req.query.audit === 'true');
    if (!data) throw new PortalError('Exam not found.', 404);
    res.json({ success: true, ...data });
});
export const editValuation = portalAction(async (req, res) => {
    const { student_id, subject_id, version, confirmed } = req.body;
    if (confirmed !== true) throw new PortalError('Confirm the corrected marks before saving.');
    if (!Number.isInteger(version) || version < 1) throw new PortalError('Reload this valuation before editing.');
    const juz = String(req.body.juz || '').trim();
    const remarks = String(req.body.remarks || '').trim();
    if (juz.length > 120 || remarks.length > 2000) throw new PortalError('Juz or remarks are too long.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const allocation = (await client.query('SELECT standard,mark_revision FROM exam_portal_allocations WHERE exam_id=$1 AND student_id=$2', [req.params.id, student_id])).rows[0];
        if (!allocation) throw new PortalError('Student is not assigned to this exam.', 404);
        if ((req.body.mark_revision ?? 0) !== allocation.mark_revision) throw new PortalError('These marks were reset. Reload the student before editing.', 409);
        const subject = (await client.query('SELECT * FROM exam_subjects WHERE exam_id=$1 AND id=$2 AND standard=$3 AND question_count IS NOT NULL', [req.params.id, subject_id, allocation.standard])).rows[0];
        if (!subject) throw new PortalError('Subject is not configured for this student in this exam.', 404);
        const keys = [req.params.id, student_id, subject_id];
        const previous = (await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3 FOR UPDATE', keys)).rows[0];
        if (!previous) throw new PortalError('There are no saved question marks to edit. Reload the results.', 404);
        if (previous.version !== version) throw new PortalError('This valuation changed. Reload it before saving corrections.', 409);
        if (previous.total != null) previous.total = Number(previous.total);
        const checked = validateMarks(req.body.marks, subject.question_count, subject.question_max, previous.status === 'submitted');
        const saved = await client.query(`UPDATE exam_portal_valuations SET marks=$4,juz=$5,remarks=$6,total=$7,version=version+1,updated_at=now()
            WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3 RETURNING *`, [...keys, JSON.stringify(checked.marks), juz, remarks, checked.total]);
        if (saved.rows[0].total != null) saved.rows[0].total = Number(saved.rows[0].total);
        if (previous.status === 'submitted') await client.query(`INSERT INTO exam_results(exam_id,student_id,subject_id,marks_obtained,remarks) VALUES($1,$2,$3,$4,$5)
            ON CONFLICT(student_id,subject_id) DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained,remarks=EXCLUDED.remarks,updated_at=now()`, [...keys, checked.total, remarks || null]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'edit_valuation',$3)", [req.params.id, actor(req), JSON.stringify({ student_id, subject_id, previous, valuation: saved.rows[0] })]);
        await client.query('COMMIT'); res.json({ success: true, valuation: saved.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const updatePortal = portalAction(async (req, res) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); const exam = await examById(req.params.id, client, true, req);
        const slug = String(req.body.slug || exam.portal_slug || '').trim();
        if ((req as ExamAdministrationRequest).examAdministration && slug !== exam.portal_slug) throw new PortalError('Change the exam URL from the institution admin exam page.', 403);
        if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(slug) || typeof req.body.enabled !== 'boolean') throw new PortalError('Use a URL name of 2–80 lowercase letters, numbers or hyphens.');
        const duplicate = await client.query('SELECT 1 FROM exams WHERE portal_slug=$1 AND id<>$2', [slug, exam.id]);
        if (duplicate.rows.length) throw new PortalError('This exam URL is already in use.', 409);
        await client.query('UPDATE exams SET portal_slug=$1,portal_enabled=$2 WHERE id=$3', [slug, req.body.enabled, exam.id]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'portal_settings',$3)", [exam.id, actor(req), JSON.stringify({ slug, enabled: req.body.enabled })]);
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const importRoster = portalAction(async (req, res) => {
    const bundled = allocation.centers.flatMap(c => c.students.map(s => ({ ...s, code: c.code })));
    const rows = req.file ? parseAllocationWorkbook(req.file.buffer) : req.body.source === 'nov26' ? bundled : [];
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const summary = req.query.preview === 'true' ? await verifyAllocationStudents(client, rows) : await importAllocation(client, String(req.params.id), rows, actor(req));
        await client.query('COMMIT'); res.json({ success: true, summary });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const updateCenter = portalAction(async (req, res) => {
    const customPasscode = req.body.passcode;
    const hasCustomPasscode = Object.prototype.hasOwnProperty.call(req.body, 'passcode');
    if (hasCustomPasscode && (typeof customPasscode !== 'string' || customPasscode.trim().length < 6 || Buffer.byteLength(customPasscode, 'utf8') > 72)) throw new PortalError('Use a center passcode with at least 6 characters and at most 72 bytes.');
    if (hasCustomPasscode && req.body.reset_passcode === true) throw new PortalError('Choose a custom passcode or generate a random one, not both.');
    const replacement = hasCustomPasscode ? customPasscode as string : req.body.reset_passcode === true ? randomBytes(9).toString('base64url') : undefined;
    const replacementHash = replacement !== undefined ? await bcrypt.hash(replacement, 12) : undefined;
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const c = (await client.query('SELECT * FROM exam_portal_centers WHERE exam_id=$1 AND id=$2 FOR UPDATE', [req.params.id, req.params.centerId])).rows[0];
        if (!c) throw new PortalError('Center not found.', 404);
        const name = String(req.body.examiner_name ?? c.examiner_name).trim();
        if (name.length > 120) throw new PortalError('Examiner name is too long.');
        if (req.body.locked !== undefined && typeof req.body.locked !== 'boolean') throw new PortalError('Invalid lock setting.');
        let passcode: string | undefined; let hash = c.passcode_hash;
        if (replacement !== undefined) {
            passcode = replacement; hash = replacementHash!;
            await client.query('DELETE FROM exam_portal_sessions WHERE center_id=$1', [c.id]);
        }
        await client.query('UPDATE exam_portal_centers SET examiner_name=$1,locked=$2,passcode_hash=$3 WHERE id=$4', [name, req.body.locked ?? c.locked, hash, c.id]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'center_settings',$3)", [req.params.id, actor(req), JSON.stringify({ center: c.code, examiner_name: name, locked: req.body.locked ?? c.locked, passcode_reset: !!passcode })]);
        await client.query('COMMIT'); res.json({ success: true, passcode });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const createCenter = portalAction(async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new PortalError('Use a center code of 1–12 letters, numbers or hyphens.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const exists = await client.query('SELECT 1 FROM exam_portal_centers WHERE exam_id=$1 AND code=$2', [req.params.id, code]);
        if (exists.rows.length) throw new PortalError('This center code already exists.', 409);
        await client.query('INSERT INTO exam_portal_centers(exam_id,code,name) VALUES($1,$2,$3)', [req.params.id, code, `Exam Center ${code}`]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'create_center',$3)", [req.params.id, actor(req), JSON.stringify({ code })]);
        await client.query('COMMIT');res.json({success:true});
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const deleteCenter = portalAction(async (req, res) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const occupied = await client.query('SELECT 1 FROM exam_portal_allocations WHERE exam_id=$1 AND center_id=$2 LIMIT 1', [req.params.id, req.params.centerId]);
        if (occupied.rows.length) throw new PortalError('Move all students before deleting this center.', 409);
        const deleted = await client.query('DELETE FROM exam_portal_centers WHERE exam_id=$1 AND id=$2 RETURNING code', [req.params.id, req.params.centerId]);
        if (!deleted.rows.length) throw new PortalError('Center not found.', 404);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'delete_center',$3)", [req.params.id, actor(req), JSON.stringify(deleted.rows[0])]);
        await client.query('COMMIT'); res.json({success:true});
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const configureSubject = portalAction(async (req, res) => {
    const count = req.body.question_count; const max = req.body.question_max; const pass = req.body.min_marks;
    const name = String(req.body.name || '').trim(); const standard = String(req.body.standard || '').trim();
    if (!name || name.length > 120 || !standard || standard.length > 60 || !Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(max) || max < 1 || max > 100 || !Number.isInteger(pass) || pass < 0 || pass > count * max) throw new PortalError('Enter a subject, standard, 1–50 questions, 1–100 marks per question, and a valid pass mark.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const subjectId = req.body.subject_id;
        if (subjectId) {
            const exists = await client.query('SELECT 1 FROM exam_subjects WHERE exam_id=$1 AND id=$2', [req.params.id, subjectId]);
            if (!exists.rows.length) throw new PortalError('Subject not found.', 404);
            const used = await client.query('SELECT 1 FROM exam_portal_valuations WHERE exam_id=$1 AND subject_id=$2 UNION ALL SELECT 1 FROM exam_results WHERE exam_id=$1 AND subject_id=$2 LIMIT 1', [req.params.id, subjectId]);
            if (used.rows.length) throw new PortalError('A subject with saved marks cannot be reconfigured.', 409);
        }
        const duplicate = await client.query('SELECT 1 FROM exam_subjects WHERE exam_id=$1 AND lower(name)=lower($2) AND standard=$3 AND ($4::uuid IS NULL OR id<>$4)', [req.params.id, name, standard, subjectId || null]);
        if (duplicate.rows.length) throw new PortalError('That subject already exists for this standard.', 409);
        if (subjectId) await client.query('UPDATE exam_subjects SET name=$1,standard=$2,question_count=$3,question_max=$4,max_marks=$3::integer*$4::integer,min_marks=$5 WHERE exam_id=$6 AND id=$7', [name, standard, count, max, pass, req.params.id, subjectId]);
        else await client.query('INSERT INTO exam_subjects(exam_id,name,standard,question_count,question_max,max_marks,min_marks) VALUES($1,$2,$3,$4,$5,$4::integer*$5::integer,$6)', [req.params.id, name, standard, count, max, pass]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'subject_setup',$3)", [req.params.id, actor(req), JSON.stringify({ subject_id: subjectId, name, standard, count, max, pass })]);
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const reopenValuation = portalAction(async (req, res) => {
    if (req.body.confirmed !== true) throw new PortalError('Confirm reopening this result.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const keys = [req.params.id, req.body.student_id, req.body.subject_id];
        const previous = await client.query('SELECT * FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3', keys);
        if (previous.rows[0]?.total != null) previous.rows[0].total = Number(previous.rows[0].total);
        const result = await client.query('DELETE FROM exam_results WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3 RETURNING *', keys);
        await client.query("UPDATE exam_portal_valuations SET status='draft',submitted_at=NULL,version=version+1,updated_at=now() WHERE exam_id=$1 AND student_id=$2 AND subject_id=$3", keys);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'reopen',$3)", [req.params.id, actor(req), JSON.stringify({ student_id: req.body.student_id, subject_id: req.body.subject_id, previous: previous.rows[0], result: result.rows[0] })]);
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const moveStudent = portalAction(async (req, res) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const keys = [req.params.id, req.body.student_id];
        const allocation = (await client.query('SELECT * FROM exam_portal_allocations WHERE exam_id=$1 AND student_id=$2', keys)).rows[0];
        const center = (await client.query('SELECT id FROM exam_portal_centers WHERE exam_id=$1 AND id=$2', [req.params.id, req.body.center_id])).rows[0];
        if (!allocation || !center) throw new PortalError('Student or destination center not found.', 404);
        if (allocation.center_id === center.id) throw new PortalError('Student already belongs to that center.');
        const serial = (await client.query('SELECT coalesce(max(serial_no),0)+1 AS n FROM exam_portal_allocations WHERE center_id=$1', [center.id])).rows[0].n;
        await client.query('UPDATE exam_portal_allocations SET center_id=$1,serial_no=$2 WHERE exam_id=$3 AND student_id=$4', [center.id, serial, ...keys]);
        // Close gaps from the bottom upward without transient unique constraint violations.
        const rest = await client.query('SELECT student_id,serial_no FROM exam_portal_allocations WHERE center_id=$1 ORDER BY serial_no', [allocation.center_id]);
        for (let i = 0; i < rest.rows.length; i++) if (rest.rows[i].serial_no !== i + 1) await client.query('UPDATE exam_portal_allocations SET serial_no=$1 WHERE exam_id=$2 AND student_id=$3', [i + 1, req.params.id, rest.rows[i].student_id]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'move_student',$3)", [req.params.id, actor(req), JSON.stringify({ student_id: req.body.student_id, from: allocation.center_id, to: center.id })]);
        await client.query('COMMIT'); res.json({ success: true });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const resetStudentMarks = portalAction(async (req, res) => {
    if (req.body.confirmed !== true) throw new PortalError('Confirm the reset before deleting this student’s exam marks.');
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); await examById(req.params.id, client, true, req);
        const keys = [req.params.id, req.body.student_id];
        const student = await client.query('SELECT student_id FROM exam_portal_allocations WHERE exam_id=$1 AND student_id=$2 FOR UPDATE', keys);
        if (!student.rows.length) throw new PortalError('Student is not assigned to this exam.', 404);
        const valuations = await client.query('DELETE FROM exam_portal_valuations WHERE exam_id=$1 AND student_id=$2', keys);
        const results = await client.query('DELETE FROM exam_results WHERE exam_id=$1 AND student_id=$2', keys);
        await client.query('UPDATE exam_portal_allocations SET mark_revision=mark_revision+1 WHERE exam_id=$1 AND student_id=$2', keys);
        // Erase prior score snapshots while preserving the history of administrative actions.
        await client.query("UPDATE exam_portal_audit SET details=jsonb_build_object('student_id',$2::text,'marks_cleared',true) WHERE exam_id=$1 AND details->>'student_id'=$2 AND action IN ('draft','submitted','reopen','edit_valuation')", keys);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'reset_student_marks',$3)", [req.params.id, actor(req), JSON.stringify({ student_id: req.body.student_id, deleted_valuations: valuations.rowCount, deleted_results: results.rowCount })]);
        await client.query('COMMIT'); res.json({ success: true, deleted_valuations: valuations.rowCount, deleted_results: results.rowCount });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const exportValuationSheets = portalAction(async (req, res) => {
    await examById(req.params.id, db, false, req);
    const data = await readAdministrationData({examId:req.params.id});
    if (!data) throw new PortalError('Exam not found.',404);
    if (req.query.center_id) {
        data.centers = data.centers.filter((c:{id:string})=>c.id===req.query.center_id);
        if (!data.centers.length) throw new PortalError('Center not found in this exam.',404);
    }
    if (!data.centers.length) throw new PortalError('Create an exam center first.');
    if (req.query.mode && !['blank','saved'].includes(String(req.query.mode))) throw new PortalError('Choose blank or saved valuation sheets.');
    const output = await createValuationWorkbook(data,req.query.mode==='blank');
    const center = data.centers.length===1 ? `-center-${data.centers[0].code}` : '-all-centers';
    const filename = `${data.exam.portal_slug || 'exam'}${center}-valuation-${req.query.mode==='blank'?'blank':'saved'}.xlsx`.replace(/[^a-zA-Z0-9_.-]/g,'-');
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);
    res.setHeader('Cache-Control','no-store');
    res.send(output);
});
export const exportPortal = portalAction(async (req, res) => {
    const exam = await examById(req.params.id);
    const result = await db.query(`SELECT c.code AS center,a.serial_no,a.student_id,a.student_name,a.standard,s.id AS subject_id,s.name AS subject,s.max_marks,s.min_marks,s.result_group,s.result_group_min_marks,s.result_component_min_marks,s.question_count,s.question_max,v.juz,v.marks,v.total,coalesce(v.status,'pending') AS status,v.remarks,v.examiner_name,v.submitted_at
      FROM exam_portal_allocations a JOIN exam_portal_centers c ON c.id=a.center_id LEFT JOIN exam_subjects s ON s.exam_id=a.exam_id AND s.standard=a.standard AND s.question_count IS NOT NULL LEFT JOIN exam_portal_valuations v ON v.exam_id=a.exam_id AND v.student_id=a.student_id AND v.subject_id=s.id WHERE a.exam_id=$1 ORDER BY c.code,a.serial_no,s.created_at`, [exam.id]);
    const wb = XLSX.utils.book_new();
    const data = createResultExportRows(result.rows);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Result Register');
    for (const code of [...new Set(result.rows.map(r => r.center))]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.filter(r => r.Center === code)), `Center ${code}`.slice(0, 31));
    const output = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.portal_slug || 'exam'}-results.xlsx"`);
    res.send(output);
});
