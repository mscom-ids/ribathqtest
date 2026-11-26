import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { db } from '../config/db';
import { portalAction } from './exam-portal.controller';
import { PortalError } from '../services/exam-portal.service';
import { readAdministrationData, readPublicPortal, schedulePortalSessionCleanup } from '../services/exam-portal-read.service';

export type ExamAdministrationRequest = Request & { examAdministration?: { exam_id: string; token_hash: string } };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const options = (slug: string) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: `/api/exam-portal/${slug}/admin` });
export const getAdministrationPasscode = portalAction(async (req, res) => {
    const result = await db.query('SELECT 1 FROM exam_portal_admin_credentials WHERE exam_id=$1', [req.params.id]);
    res.json({ success: true, configured: result.rows.length > 0 });
});
export const setAdministrationPasscode = portalAction(async (req, res) => {
    const generated = req.body.generate === true;
    const passcode = generated ? randomBytes(12).toString('base64url') : req.body.passcode;
    if (typeof passcode !== 'string' || passcode.trim().length < 8 || Buffer.byteLength(passcode, 'utf8') > 72) throw new PortalError('Use an administration passcode with at least 8 characters and at most 72 bytes.');
    const hash = await bcrypt.hash(passcode, 12);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const exam = await client.query("SELECT id FROM exams WHERE id=$1 AND department::text='Hifz' FOR UPDATE", [req.params.id]);
        if (!exam.rows.length) throw new PortalError('Hifz exam not found.', 404);
        await client.query('INSERT INTO exam_portal_admin_credentials(exam_id,passcode_hash) VALUES($1,$2) ON CONFLICT(exam_id) DO UPDATE SET passcode_hash=EXCLUDED.passcode_hash,updated_at=now()', [req.params.id, hash]);
        await client.query('DELETE FROM exam_portal_admin_sessions WHERE exam_id=$1', [req.params.id]);
        await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action) VALUES($1,$2,'administration_passcode_changed')", [req.params.id, String((req as Request & { user?: { id: string } }).user?.id || 'Institution administrator')]);
        await client.query('COMMIT'); res.json({ success: true, configured: true, ...(generated ? { passcode } : {}) });
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
});
export const administrationLogin = portalAction(async (req, res) => {
    const passcode = req.body.passcode;
    const result = await db.query('SELECT e.id,c.passcode_hash FROM exams e JOIN exam_portal_admin_credentials c ON c.exam_id=e.id WHERE e.portal_slug=$1', [req.params.slug]);
    const credential = result.rows[0];
    const validInput = typeof passcode === 'string' && Buffer.byteLength(passcode, 'utf8') <= 72;
    const valid = await bcrypt.compare(validInput ? passcode : '', credential?.passcode_hash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.5vXImS4K0K6DWEJt8DYf0Z9k85A9TWK');
    if (!credential || !validInput || !valid) throw new PortalError('Invalid examination administration passcode, or it has not been set.', 401);
    const token = randomBytes(32).toString('hex');
    const inserted = await db.query(`INSERT INTO exam_portal_admin_sessions(token_hash,exam_id,expires_at)
        SELECT $1,current.exam_id,now()+interval '8 hours' FROM
        (SELECT e.id AS exam_id FROM exams e JOIN exam_portal_admin_credentials c ON c.exam_id=e.id
         WHERE e.id=$2 AND c.passcode_hash=$3 FOR UPDATE OF e,c) current
        RETURNING exam_id`, [digest(token), credential.id, credential.passcode_hash]);
    if (!inserted.rows.length) throw new PortalError('Passcode changed. Sign in again.', 401);
    const data = await readAdministrationData({ slug: req.params.slug, hash: digest(token) });
    if (!data) throw new PortalError('Passcode changed. Sign in again.', 401);
    res.cookie('exam_administration_session', token, { ...options(String(req.params.slug)), maxAge: 8 * 60 * 60 * 1000 });
    res.json({ success: true, authenticated: true, data });
    schedulePortalSessionCleanup();
});
export const administrationBootstrap = portalAction(async (req, res) => {
    const token = req.cookies?.exam_administration_session;
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
        const data = await readAdministrationData({ slug: req.params.slug, hash: digest(token) });
        if (data) { res.json({ success: true, authenticated: true, data }); return; }
        res.clearCookie('exam_administration_session', options(String(req.params.slug)));
    }
    const { exam } = await readPublicPortal(req.params.slug);
    res.json({ success: true, authenticated: false, exam });
});
export async function administrationSession(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.cookies?.exam_administration_session;
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new PortalError('Enter this exam’s administration passcode.', 401);
        const hash = digest(token);
        const session = await db.query('SELECT s.exam_id FROM exam_portal_admin_sessions s JOIN exams e ON e.id=s.exam_id WHERE s.token_hash=$1 AND s.expires_at>now() AND e.portal_slug=$2', [hash, req.params.slug]);
        if (!session.rows.length) throw new PortalError('Administration session expired. Enter the passcode again.', 401);
        (req as ExamAdministrationRequest).examAdministration = { exam_id: session.rows[0].exam_id, token_hash: hash };
        next();
    } catch (e) { res.status(e instanceof PortalError ? e.status : 500).json({ success: false, error: e instanceof PortalError ? e.message : 'Unable to check administration access.' }); }
}
export const administrationLogout = portalAction(async (req, res) => {
    const token = req.cookies?.exam_administration_session;
    if (typeof token === 'string') await db.query('DELETE FROM exam_portal_admin_sessions WHERE token_hash=$1', [digest(token)]);
    res.clearCookie('exam_administration_session', options(String(req.params.slug)));
    res.json({ success: true });
});
