import { Request } from 'express';
import { db } from '../../config/db';
import { getStaffId } from '../../utils/staff.utils';
import { IncidentStatus, isReviewRole } from './discipline.types';

type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export async function resolveDisciplineActor(req: Request) {
    const user = (req as any).user || {};
    const staffId = await getStaffId(req);
    return {
        userId: String(user.id || ''),
        role: String(user.role || '').toLowerCase(),
        email: String(user.email || ''),
        staffId,
        canReview: isReviewRole(user.role),
        ipAddress: req.ip || req.socket.remoteAddress || null,
    };
}

export async function nextReference(client: Queryable) {
    const result = await client.query(
        `SELECT 'DISC-' || to_char(CURRENT_DATE, 'YYMM') || '-' ||
                upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6)) AS reference_no`,
    );
    return result.rows[0].reference_no as string;
}

export async function audit(
    client: Queryable,
    input: {
        incidentId?: string | null;
        studentId?: string | null;
        actorId?: string | null;
        action: string;
        oldValue?: unknown;
        newValue?: unknown;
        ipAddress?: string | null;
    },
) {
    await client.query(
        `INSERT INTO discipline_audit_logs
            (incident_id, student_id, actor_id, action, old_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
        [
            input.incidentId || null,
            input.studentId || null,
            input.actorId || null,
            input.action,
            input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
            input.newValue === undefined ? null : JSON.stringify(input.newValue),
            input.ipAddress || null,
        ],
    );
}

export async function changeStatus(
    client: Queryable,
    incidentId: string,
    toStatus: IncidentStatus,
    actorId: string | null,
    note?: string | null,
) {
    const current = await client.query(
        `SELECT status, student_id FROM discipline_incidents WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [incidentId],
    );
    if (!current.rows[0]) throw new Error('Incident not found');
    const fromStatus = current.rows[0].status as IncidentStatus;

    const timestampField: Partial<Record<IncidentStatus, string>> = {
        submitted: 'submitted_at',
        under_review: 'reviewed_at',
        completed: 'closed_at',
        cancelled: 'cancelled_at',
    };
    const stamp = timestampField[toStatus];
    await client.query(
        `UPDATE discipline_incidents
         SET status = $2,
             updated_at = now()
             ${stamp ? `, ${stamp} = now()` : ''}
         WHERE id = $1`,
        [incidentId, toStatus],
    );
    await client.query(
        `INSERT INTO discipline_status_history (incident_id, from_status, to_status, note, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [incidentId, fromStatus, toStatus, note || null, actorId],
    );
    return { fromStatus, studentId: current.rows[0].student_id as string };
}

export function reporterScopeSql(role: string, staffId: string | null, params: any[]) {
    if (isReviewRole(role)) return '';
    if (!staffId) return ' AND false';
    params.push(staffId);
    return ` AND i.reported_by = $${params.length}`;
}

export async function assertCanReportStudent(actor: { role: string; staffId: string | null }, studentId: string, queryable: Queryable = db) {
    if (isReviewRole(actor.role)) return;
    if (!actor.staffId) throw new Error('A linked staff profile is required');

    const assigned = await queryable.query(
        `SELECT 1
         FROM students
         WHERE adm_no = $1
           AND status = 'active'
           AND (hifz_mentor_id = $2 OR school_mentor_id = $2 OR madrasa_mentor_id = $2)
         LIMIT 1`,
        [studentId, actor.staffId],
    );
    if (!assigned.rows[0]) {
        const error = new Error('You can report disciplinary incidents only for your assigned students') as Error & { statusCode?: number };
        error.statusCode = 403;
        throw error;
    }
}
