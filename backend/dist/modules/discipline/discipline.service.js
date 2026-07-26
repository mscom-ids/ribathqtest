"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDisciplineActor = resolveDisciplineActor;
exports.nextReference = nextReference;
exports.audit = audit;
exports.changeStatus = changeStatus;
exports.getSetting = getSetting;
exports.markExpiryDate = markExpiryDate;
exports.syncIncidentMark = syncIncidentMark;
exports.calculateRisk = calculateRisk;
exports.reporterScopeSql = reporterScopeSql;
const db_1 = require("../../config/db");
const staff_utils_1 = require("../../utils/staff.utils");
const discipline_types_1 = require("./discipline.types");
async function resolveDisciplineActor(req) {
    const user = req.user || {};
    const staffId = await (0, staff_utils_1.getStaffId)(req);
    return {
        userId: String(user.id || ''),
        role: String(user.role || '').toLowerCase(),
        email: String(user.email || ''),
        staffId,
        canReview: (0, discipline_types_1.isReviewRole)(user.role),
        ipAddress: req.ip || req.socket.remoteAddress || null,
    };
}
async function nextReference(client) {
    const result = await client.query(`SELECT 'DISC-' || to_char(CURRENT_DATE, 'YYMM') || '-' ||
                upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 6)) AS reference_no`);
    return result.rows[0].reference_no;
}
async function audit(client, input) {
    await client.query(`INSERT INTO discipline_audit_logs
            (incident_id, student_id, actor_id, action, old_value, new_value, ip_address)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`, [
        input.incidentId || null,
        input.studentId || null,
        input.actorId || null,
        input.action,
        input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
        input.newValue === undefined ? null : JSON.stringify(input.newValue),
        input.ipAddress || null,
    ]);
}
async function changeStatus(client, incidentId, toStatus, actorId, note) {
    const current = await client.query(`SELECT status, student_id FROM discipline_incidents WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [incidentId]);
    if (!current.rows[0])
        throw new Error('Incident not found');
    const fromStatus = current.rows[0].status;
    const timestampField = {
        submitted: 'submitted_at',
        under_review: 'reviewed_at',
        completed: 'closed_at',
        cancelled: 'cancelled_at',
    };
    const stamp = timestampField[toStatus];
    await client.query(`UPDATE discipline_incidents
         SET status = $2,
             updated_at = now()
             ${stamp ? `, ${stamp} = now()` : ''}
         WHERE id = $1`, [incidentId, toStatus]);
    await client.query(`INSERT INTO discipline_status_history (incident_id, from_status, to_status, note, changed_by)
         VALUES ($1, $2, $3, $4, $5)`, [incidentId, fromStatus, toStatus, note || null, actorId]);
    return { fromStatus, studentId: current.rows[0].student_id };
}
async function getSetting(key, fallback, queryable = db_1.db) {
    const result = await queryable.query('SELECT value FROM discipline_settings WHERE key = $1', [key]);
    return (result.rows[0]?.value ?? fallback);
}
async function markExpiryDate(severity, queryable) {
    const rules = await getSetting('mark_expiry_days', { minor: 30, moderate: 90, major: null, critical: null }, queryable);
    const days = rules[severity];
    if (!days)
        return null;
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}
async function syncIncidentMark(client, incident, actorId) {
    await client.query(`UPDATE discipline_marks SET status = 'adjusted'
         WHERE incident_id = $1 AND status = 'active'`, [incident.id]);
    if (incident.discipline_marks <= 0)
        return;
    const expiresAt = await markExpiryDate(incident.severity, client);
    await client.query(`INSERT INTO discipline_marks
            (incident_id, student_id, marks, reason, severity, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [incident.id, incident.student_id, incident.discipline_marks, incident.short_description, incident.severity, expiresAt, actorId]);
}
async function calculateRisk(activeMarks) {
    const thresholds = await getSetting('risk_thresholds', { good_standing: 3, needs_attention: 7, warning: 12, high_risk: 20 });
    if (activeMarks <= thresholds.good_standing)
        return 'Good Standing';
    if (activeMarks <= thresholds.needs_attention)
        return 'Needs Attention';
    if (activeMarks <= thresholds.warning)
        return 'Warning';
    if (activeMarks <= thresholds.high_risk)
        return 'High Risk';
    return 'Critical Review';
}
function reporterScopeSql(role, staffId, params) {
    if ((0, discipline_types_1.isReviewRole)(role))
        return '';
    if (!staffId)
        return ' AND false';
    params.push(staffId);
    return ` AND i.reported_by = $${params.length}`;
}
