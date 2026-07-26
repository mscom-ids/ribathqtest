import { Request } from 'express';
import { db } from '../../config/db';
import { getStaffId } from '../../utils/staff.utils';
import { IncidentStatus, Severity, isReviewRole } from './discipline.types';

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

export async function getSetting<T>(key: string, fallback: T, queryable: Queryable = db): Promise<T> {
    const result = await queryable.query('SELECT value FROM discipline_settings WHERE key = $1', [key]);
    return (result.rows[0]?.value ?? fallback) as T;
}

export async function markExpiryDate(severity: Severity, queryable: Queryable) {
    const rules = await getSetting<Record<string, number | null>>(
        'mark_expiry_days',
        { minor: 30, moderate: 90, major: null, critical: null },
        queryable,
    );
    const days = rules[severity];
    if (!days) return null;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

export async function syncIncidentMark(client: Queryable, incident: {
    id: string;
    student_id: string;
    discipline_marks: number;
    severity: Severity;
    short_description: string;
}, actorId: string | null) {
    await client.query(
        `UPDATE discipline_marks SET status = 'adjusted'
         WHERE incident_id = $1 AND status = 'active'`,
        [incident.id],
    );
    if (incident.discipline_marks <= 0) return;
    const expiresAt = await markExpiryDate(incident.severity, client);
    await client.query(
        `INSERT INTO discipline_marks
            (incident_id, student_id, marks, reason, severity, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [incident.id, incident.student_id, incident.discipline_marks, incident.short_description, incident.severity, expiresAt, actorId],
    );
}

export async function calculateRisk(activeMarks: number) {
    const thresholds = await getSetting<Record<string, number>>(
        'risk_thresholds',
        { good_standing: 3, needs_attention: 7, warning: 12, high_risk: 20 },
    );
    if (activeMarks <= thresholds.good_standing) return 'Good Standing';
    if (activeMarks <= thresholds.needs_attention) return 'Needs Attention';
    if (activeMarks <= thresholds.warning) return 'Warning';
    if (activeMarks <= thresholds.high_risk) return 'High Risk';
    return 'Critical Review';
}

export function reporterScopeSql(role: string, staffId: string | null, params: any[]) {
    if (isReviewRole(role)) return '';
    if (!staffId) return ' AND false';
    params.push(staffId);
    return ` AND i.reported_by = $${params.length}`;
}

