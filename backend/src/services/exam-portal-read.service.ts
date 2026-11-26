import { db } from '../config/db';
import { getPortalReadiness, PortalError } from './exam-portal.service';

export async function readPublicPortal(slug: unknown) {
    const result = await db.query(`SELECT jsonb_build_object('title',e.title,'is_active',e.is_active,'portal_enabled',e.portal_enabled) AS exam,
        CASE WHEN e.portal_enabled THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('code',c.code,'name',c.name) ORDER BY c.code)
            FROM exam_portal_centers c WHERE c.exam_id=e.id AND NULLIF(c.passcode_hash,'') IS NOT NULL),'[]'::jsonb) ELSE '[]'::jsonb END AS centers
        FROM exams e WHERE e.portal_slug=$1`, [slug]);
    if (!result.rows.length) throw new PortalError('Exam portal not found.', 404);
    return result.rows[0];
}

// Each read stays scoped to a currently valid session. No session/mark cache.
export async function readExaminerSession(slug: unknown, hash: string) {
    const result = await db.query(`SELECT jsonb_build_object('title',e.title,'is_active',e.is_active,'portal_enabled',e.portal_enabled) AS exam,
        jsonb_build_object('code',c.code,'name',c.name,'examiner_name',c.examiner_name,'locked',c.locked,'is_active',e.is_active) AS center,
        COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.serial_no) FROM exam_portal_allocations a WHERE a.exam_id=e.id AND a.center_id=c.id),'[]'::jsonb) AS students,
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.standard,s.created_at) FROM exam_subjects s WHERE s.exam_id=e.id AND s.question_count IS NOT NULL AND EXISTS
            (SELECT 1 FROM exam_portal_allocations a WHERE a.center_id=c.id AND a.exam_id=e.id AND a.standard=s.standard)),'[]'::jsonb) AS subjects,
        COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM exam_portal_valuations v JOIN exam_portal_allocations a USING(exam_id,student_id)
            WHERE a.exam_id=e.id AND a.center_id=c.id),'[]'::jsonb) AS valuations
        FROM exam_portal_sessions session JOIN exam_portal_centers c ON c.id=session.center_id JOIN exams e ON e.id=c.exam_id
        WHERE session.token_hash=$1 AND session.expires_at>now() AND e.portal_slug=$2 AND e.portal_enabled`, [hash, slug]);
    return result.rows[0];
}

export async function readAdministrationData(scope: { examId: unknown } | { slug: unknown; hash: string }, audit = false) {
    const session = 'slug' in scope;
    const result = await db.query(`SELECT to_jsonb(e) AS exam,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name',c.name,'examiner_name',c.examiner_name,'locked',c.locked,'has_passcode',NULLIF(c.passcode_hash,'') IS NOT NULL) ORDER BY c.code)
            FROM exam_portal_centers c WHERE c.exam_id=e.id),'[]'::jsonb) AS centers,
        COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.center_id,a.serial_no) FROM exam_portal_allocations a WHERE a.exam_id=e.id),'[]'::jsonb) AS students,
        COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.standard,s.created_at) FROM exam_subjects s WHERE s.exam_id=e.id),'[]'::jsonb) AS subjects,
        COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM exam_portal_valuations v WHERE v.exam_id=e.id),'[]'::jsonb) AS valuations,
        ${audit ? "COALESCE((SELECT jsonb_agg(to_jsonb(audit)) FROM (SELECT actor,action,details,created_at FROM exam_portal_audit WHERE exam_id=e.id ORDER BY id DESC LIMIT 100) audit),'[]'::jsonb)" : "'[]'::jsonb"} AS audit
        FROM exams e ${session ? 'JOIN exam_portal_admin_sessions session ON session.exam_id=e.id' : ''}
        WHERE e.department::text='Hifz' AND ${session ? 'e.portal_slug=$1 AND session.token_hash=$2 AND session.expires_at>now()' : 'e.id=$1'}`,
    session ? [(scope as {slug: unknown}).slug, (scope as {hash: string}).hash] : [(scope as {examId: unknown}).examId]);
    const data = result.rows[0];
    return data ? { ...data, readiness: getPortalReadiness(data.centers, data.students, data.subjects) } : undefined;
}

let cleanupAt = 0;
export function schedulePortalSessionCleanup() {
    if (Date.now() < cleanupAt) return;
    cleanupAt = Date.now() + 5 * 60_000;
    const timer = setTimeout(() => {
        void Promise.all([
            db.query('DELETE FROM exam_portal_sessions WHERE expires_at<now()'),
            db.query('DELETE FROM exam_portal_admin_sessions WHERE expires_at<now()')
        ]).catch(() => { cleanupAt = 0; });
    }, 1000);
    timer.unref();
}
