"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listIncidents = listIncidents;
exports.createIncident = createIncident;
exports.getIncident = getIncident;
exports.reviewIncident = reviewIncident;
exports.addStudentResponse = addStudentResponse;
exports.addCorrectiveAction = addCorrectiveAction;
exports.updateCorrectiveAction = updateCorrectiveAction;
exports.closeIncident = closeIncident;
exports.addPositiveBehaviour = addPositiveBehaviour;
exports.getStudentDisciplineProfile = getStudentDisciplineProfile;
const db_1 = require("../../config/db");
const server_cache_1 = require("../../utils/server-cache");
const discipline_service_1 = require("./discipline.service");
const discipline_validation_1 = require("./discipline.validation");
function respondError(res, error, fallback) {
    const message = error?.message || fallback;
    const status = /required|invalid|must be|not found|before closing/i.test(message) ? 400 : 500;
    if (status === 500)
        console.error(`[discipline] ${fallback}:`, error);
    return res.status(status).json({ success: false, error: message });
}
const clearDisciplineCache = () => (0, server_cache_1.invalidateCacheByPrefix)('discipline:');
async function listIncidents(req, res) {
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const { page, limit, offset } = (0, discipline_validation_1.pagination)(req.query);
        const params = [];
        const where = ['i.deleted_at IS NULL'];
        const add = (fragment, value) => { params.push(value); where.push(fragment.replace('?', `$${params.length}`)); };
        if (req.query.status)
            add('i.status = ?', req.query.status);
        if (req.query.severity)
            add('i.severity = ?', req.query.severity);
        if (req.query.category_id)
            add('i.category_id = ?', req.query.category_id);
        if (req.query.student_id)
            add('i.student_id = ?', req.query.student_id);
        if (req.query.from)
            add('i.reported_at >= ?::date', req.query.from);
        if (req.query.to)
            add('i.reported_at < (?::date + 1)', req.query.to);
        if (req.query.search) {
            params.push(`%${String(req.query.search).trim()}%`);
            where.push(`(s.name ILIKE $${params.length} OR s.adm_no ILIKE $${params.length} OR i.reference_no ILIKE $${params.length} OR o.name ILIKE $${params.length})`);
        }
        const scope = (0, discipline_service_1.reporterScopeSql)(actor.role, actor.staffId, params).replace(/^ AND /, '');
        if (scope)
            where.push(scope);
        params.push(limit, offset);
        const result = await db_1.db.query(`SELECT i.id,i.reference_no,i.student_id,s.name student_name,s.photo_url,i.status,i.severity,
                    i.discipline_marks,i.reported_at,i.location,i.repeat_offence,i.parent_notification_status,
                    c.name category_name,o.name offence_name,r.name reporter_name,count(*) OVER()::int total_count
             FROM discipline_incidents i
             JOIN students s ON s.adm_no=i.student_id
             JOIN discipline_categories c ON c.id=i.category_id
             JOIN discipline_offence_types o ON o.id=i.offence_type_id
             LEFT JOIN staff r ON r.id=i.reported_by
             WHERE ${where.join(' AND ')}
             ORDER BY i.reported_at DESC,i.created_at DESC
             LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
        return res.json({ success: true, incidents: result.rows, pagination: { page, limit, total: result.rows[0]?.total_count || 0 } });
    }
    catch (error) {
        return respondError(res, error, 'Failed to load incidents');
    }
}
async function createIncident(req, res) {
    const client = await db_1.db.getClient();
    try {
        const input = (0, discipline_validation_1.parseIncidentCreate)(req.body);
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        if (!actor.staffId)
            return res.status(403).json({ success: false, error: 'A linked staff profile is required' });
        await client.query('BEGIN');
        if (input.idempotency_key) {
            const duplicate = await client.query('SELECT id,reference_no FROM discipline_incidents WHERE idempotency_key=$1', [input.idempotency_key]);
            if (duplicate.rows[0]) {
                await client.query('ROLLBACK');
                return res.json({ success: true, incident: duplicate.rows[0], duplicate: true });
            }
        }
        const context = await client.query(`SELECT s.adm_no,ay.id academic_year_id,p.standard,p.division,o.category_id offence_category_id,
                    o.parent_notification_default
             FROM students s
             CROSS JOIN LATERAL (SELECT id FROM academic_years WHERE is_current=true ORDER BY start_date DESC LIMIT 1) ay
             LEFT JOIN academic_student_placements p ON p.student_id=s.adm_no AND p.academic_year_id=ay.id AND p.status='active'
             JOIN discipline_offence_types o ON o.id=$2 AND o.is_active=true
             WHERE s.adm_no=$1 AND s.status='active'`, [input.student_id, input.offence_type_id]);
        const row = context.rows[0];
        if (!row)
            throw new Error('Student or offence type not found');
        if (row.offence_category_id !== input.category_id)
            throw new Error('Invalid problem category');
        const repeated = await client.query(`SELECT EXISTS(SELECT 1 FROM discipline_incidents WHERE student_id=$1 AND offence_type_id=$2
              AND deleted_at IS NULL AND status<>'cancelled' AND reported_at >= $3::timestamptz - interval '90 days') repeated`, [input.student_id, input.offence_type_id, input.reported_at]);
        const status = input.save_as_draft ? 'draft' : 'submitted';
        const parentRequired = input.parent_notification_required || row.parent_notification_default;
        const reference = await (0, discipline_service_1.nextReference)(client);
        const inserted = await client.query(`INSERT INTO discipline_incidents
             (reference_no,idempotency_key,student_id,category_id,offence_type_id,academic_year_id,reported_by,status,
              severity,discipline_marks,reported_at,location,hostel,floor,room_number,class_name,division,
              short_description,immediate_action,student_position,parent_notification_required,parent_notification_status,
              private_staff_notes,repeat_offence,submitted_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
                     CASE WHEN $8='submitted' THEN now() ELSE NULL END) RETURNING *`, [reference, input.idempotency_key, input.student_id, input.category_id, input.offence_type_id, row.academic_year_id,
            actor.staffId, status, input.severity, input.discipline_marks, input.reported_at, input.location, input.hostel, input.floor,
            input.room_number, input.class_name || row.standard, input.division || row.division, input.short_description,
            input.immediate_action, input.student_position, parentRequired, parentRequired ? 'pending' : 'not_required',
            input.private_staff_notes, repeated.rows[0]?.repeated || false]);
        const incident = inserted.rows[0];
        for (const witness of input.witnesses || [])
            await client.query('INSERT INTO discipline_witnesses (incident_id,name,details) VALUES ($1,$2,$3)', [incident.id, witness.name, witness.details]);
        for (const evidence of input.evidence || [])
            await client.query(`INSERT INTO discipline_evidence (incident_id,uploaded_by,file_name,file_url,mime_type,file_size,visibility)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [incident.id, actor.staffId, evidence.file_name, evidence.file_url, evidence.mime_type, evidence.file_size, evidence.visibility]);
        await client.query('INSERT INTO discipline_status_history (incident_id,to_status,note,changed_by) VALUES ($1,$2,$3,$4)', [incident.id, status, input.save_as_draft ? 'Draft saved' : 'Incident submitted', actor.staffId]);
        if (!input.save_as_draft && (['major', 'critical'].includes(incident.severity) || incident.repeat_offence)) {
            await client.query(`INSERT INTO discipline_notifications (incident_id,recipient_role,notification_type,message)
                                VALUES ($1,'principal','review_required',$2)`, [incident.id, `${incident.reference_no} requires review`]);
        }
        await (0, discipline_service_1.audit)(client, { incidentId: incident.id, studentId: incident.student_id, actorId: actor.staffId, action: 'incident_created', newValue: incident, ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.status(201).json({ success: true, incident });
    }
    catch (error) {
        await client.query('ROLLBACK');
        if (error?.code === '23505')
            return res.status(409).json({ success: false, error: 'This incident was already submitted' });
        return respondError(res, error, 'Failed to create incident');
    }
    finally {
        client.release();
    }
}
async function getIncident(req, res) {
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const params = [String(req.params.id)];
        const scope = (0, discipline_service_1.reporterScopeSql)(actor.role, actor.staffId, params);
        const found = await db_1.db.query(`SELECT i.*,s.name student_name,s.photo_url,s.father_name,s.phone,c.name category_name,o.name offence_name,
                    r.name reporter_name,rv.name reviewer_name,assignee.name assigned_to_name
             FROM discipline_incidents i JOIN students s ON s.adm_no=i.student_id
             JOIN discipline_categories c ON c.id=i.category_id JOIN discipline_offence_types o ON o.id=i.offence_type_id
             LEFT JOIN staff r ON r.id=i.reported_by LEFT JOIN staff rv ON rv.id=i.reviewed_by
             LEFT JOIN staff assignee ON assignee.id=i.assigned_to
             WHERE i.id=$1 AND i.deleted_at IS NULL ${scope}`, params);
        const incident = found.rows[0];
        if (!incident)
            return res.status(404).json({ success: false, error: 'Incident not found' });
        const [witnesses, evidence, responses, actions, communications, history, audits] = await Promise.all([
            db_1.db.query('SELECT * FROM discipline_witnesses WHERE incident_id=$1 ORDER BY created_at', [incident.id]),
            db_1.db.query(`SELECT * FROM discipline_evidence WHERE incident_id=$1 ${actor.canReview ? '' : "AND visibility='student_parent'"} ORDER BY created_at`, [incident.id]),
            db_1.db.query('SELECT r.*,s.name recorded_by_name FROM discipline_student_responses r LEFT JOIN staff s ON s.id=r.recorded_by WHERE incident_id=$1 ORDER BY r.created_at DESC', [incident.id]),
            db_1.db.query(`SELECT a.*,s.name supervisor_name,COALESCE(json_agg(u ORDER BY u.created_at DESC) FILTER (WHERE u.id IS NOT NULL),'[]') updates
                      FROM discipline_actions a LEFT JOIN staff s ON s.id=a.supervisor_id LEFT JOIN discipline_action_updates u ON u.action_id=a.id
                      WHERE a.incident_id=$1 GROUP BY a.id,s.name ORDER BY a.created_at`, [incident.id]),
            db_1.db.query('SELECT c.*,s.name contacted_by_name FROM discipline_parent_communications c LEFT JOIN staff s ON s.id=c.contacted_by WHERE incident_id=$1 ORDER BY c.created_at DESC', [incident.id]),
            db_1.db.query('SELECT h.*,s.name changed_by_name FROM discipline_status_history h LEFT JOIN staff s ON s.id=h.changed_by WHERE incident_id=$1 ORDER BY h.created_at DESC', [incident.id]),
            actor.canReview ? db_1.db.query('SELECT a.*,s.name actor_name FROM discipline_audit_logs a LEFT JOIN staff s ON s.id=a.actor_id WHERE incident_id=$1 ORDER BY a.created_at DESC', [incident.id]) : Promise.resolve({ rows: [] }),
        ]);
        if (!actor.canReview)
            delete incident.private_staff_notes;
        return res.json({ success: true, incident, witnesses: witnesses.rows, evidence: evidence.rows, responses: responses.rows, actions: actions.rows, communications: communications.rows, history: history.rows, audit: audits.rows, permissions: { canReview: actor.canReview } });
    }
    catch (error) {
        return respondError(res, error, 'Failed to load incident');
    }
}
async function reviewIncident(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const input = (0, discipline_validation_1.parseReview)(req.body);
        await client.query('BEGIN');
        const current = await client.query('SELECT * FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [String(req.params.id)]);
        if (!current.rows[0])
            throw new Error('Incident not found');
        const incident = current.rows[0];
        const severity = input.severity || incident.severity;
        const marks = input.discipline_marks ?? incident.discipline_marks;
        await client.query(`UPDATE discipline_incidents SET reviewed_by=$2,reviewed_at=now(),severity=$3,discipline_marks=$4,
                            parent_notification_status=COALESCE($5,parent_notification_status),updated_at=now() WHERE id=$1`, [incident.id, actor.staffId, severity, marks, input.parent_notification_status || null]);
        const next = input.decision === 'request_explanation' ? 'waiting_student_explanation' : input.decision === 'assign_action' ? 'action_assigned' : input.decision === 'cancel' ? 'cancelled' : 'under_review';
        await (0, discipline_service_1.changeStatus)(client, incident.id, next, actor.staffId, input.note);
        if (!['cancelled', 'waiting_student_explanation'].includes(next))
            await (0, discipline_service_1.syncIncidentMark)(client, { ...incident, severity, discipline_marks: marks }, actor.staffId);
        if (input.decision === 'escalate')
            await client.query('UPDATE discipline_incidents SET escalated_at=now() WHERE id=$1', [incident.id]);
        await (0, discipline_service_1.audit)(client, { incidentId: incident.id, studentId: incident.student_id, actorId: actor.staffId, action: `review_${input.decision}`, oldValue: incident, newValue: { severity, marks, note: input.note }, ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.json({ success: true });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to review incident');
    }
    finally {
        client.release();
    }
}
async function addStudentResponse(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const type = String(req.body?.response_type || '').toLowerCase();
        if (!['accepted', 'denied'].includes(type))
            throw new Error('Invalid student response');
        const explanation = (0, discipline_validation_1.requiredText)(req.body?.explanation, 'Explanation', 4000);
        await client.query('BEGIN');
        const incident = await client.query('SELECT student_id FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL', [String(req.params.id)]);
        if (!incident.rows[0])
            throw new Error('Incident not found');
        await client.query(`INSERT INTO discipline_student_responses (incident_id,response_type,explanation,witness_details,attachment_url,recorded_by) VALUES ($1,$2,$3,$4,$5,$6)`, [String(req.params.id), type, explanation, (0, discipline_validation_1.cleanText)(req.body?.witness_details, 2000), (0, discipline_validation_1.cleanText)(req.body?.attachment_url, 1000), actor.staffId]);
        await client.query('UPDATE discipline_incidents SET student_position=$2,updated_at=now() WHERE id=$1', [String(req.params.id), type]);
        await (0, discipline_service_1.changeStatus)(client, String(req.params.id), 'under_review', actor.staffId, 'Student explanation recorded');
        await (0, discipline_service_1.audit)(client, { incidentId: String(req.params.id), studentId: incident.rows[0].student_id, actorId: actor.staffId, action: 'student_response_recorded', newValue: { type, explanation }, ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.status(201).json({ success: true });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to record response');
    }
    finally {
        client.release();
    }
}
async function addCorrectiveAction(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const actionType = (0, discipline_validation_1.requiredText)(req.body?.action_type, 'Action type', 160);
        await client.query('BEGIN');
        const incident = await client.query('SELECT student_id FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL', [String(req.params.id)]);
        if (!incident.rows[0])
            throw new Error('Incident not found');
        const action = await client.query(`INSERT INTO discipline_actions (incident_id,action_type,instructions,assigned_by,supervisor_id,due_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [String(req.params.id), actionType, (0, discipline_validation_1.cleanText)(req.body?.instructions, 2000), actor.staffId, (0, discipline_validation_1.cleanText)(req.body?.supervisor_id, 60), (0, discipline_validation_1.cleanText)(req.body?.due_date, 20)]);
        await (0, discipline_service_1.changeStatus)(client, String(req.params.id), 'action_assigned', actor.staffId, `${actionType} assigned`);
        await (0, discipline_service_1.audit)(client, { incidentId: String(req.params.id), studentId: incident.rows[0].student_id, actorId: actor.staffId, action: 'corrective_action_assigned', newValue: action.rows[0], ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.status(201).json({ success: true, action: action.rows[0] });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to assign action');
    }
    finally {
        client.release();
    }
}
async function updateCorrectiveAction(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const status = (0, discipline_validation_1.parseActionStatus)(req.body?.status);
        await client.query('BEGIN');
        const current = await client.query('SELECT * FROM discipline_actions WHERE id=$1 FOR UPDATE', [String(req.params.actionId)]);
        if (!current.rows[0])
            throw new Error('Corrective action not found');
        const updated = await client.query(`UPDATE discipline_actions SET status=$2,completion_note=$3,completion_evidence_url=$4,completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$1 RETURNING *`, [String(req.params.actionId), status, (0, discipline_validation_1.cleanText)(req.body?.note, 2000), (0, discipline_validation_1.cleanText)(req.body?.evidence_url, 1000)]);
        await client.query('INSERT INTO discipline_action_updates (action_id,status,note,evidence_url,updated_by) VALUES ($1,$2,$3,$4,$5)', [String(req.params.actionId), status, (0, discipline_validation_1.cleanText)(req.body?.note, 2000), (0, discipline_validation_1.cleanText)(req.body?.evidence_url, 1000), actor.staffId]);
        await (0, discipline_service_1.audit)(client, { incidentId: current.rows[0].incident_id, actorId: actor.staffId, action: 'corrective_action_updated', oldValue: current.rows[0], newValue: updated.rows[0], ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.json({ success: true, action: updated.rows[0] });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to update action');
    }
    finally {
        client.release();
    }
}
async function closeIncident(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        await client.query('BEGIN');
        const incident = await client.query('SELECT * FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [String(req.params.id)]);
        if (!incident.rows[0])
            throw new Error('Incident not found');
        const pending = await client.query("SELECT count(*)::int count FROM discipline_actions WHERE incident_id=$1 AND status NOT IN ('completed','cancelled')", [String(req.params.id)]);
        if (pending.rows[0].count > 0 && !req.body?.force)
            throw new Error('Complete or cancel pending corrective actions before closing');
        await (0, discipline_service_1.changeStatus)(client, String(req.params.id), 'completed', actor.staffId, (0, discipline_validation_1.cleanText)(req.body?.note, 2000));
        await (0, discipline_service_1.audit)(client, { incidentId: String(req.params.id), studentId: incident.rows[0].student_id, actorId: actor.staffId, action: 'incident_closed', newValue: { note: (0, discipline_validation_1.cleanText)(req.body?.note, 2000) }, ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.json({ success: true });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to close incident');
    }
    finally {
        client.release();
    }
}
async function addPositiveBehaviour(req, res) {
    const client = await db_1.db.getClient();
    try {
        const actor = await (0, discipline_service_1.resolveDisciplineActor)(req);
        const input = (0, discipline_validation_1.parsePositiveMark)(req.body);
        await client.query('BEGIN');
        const student = await client.query('SELECT adm_no FROM students WHERE adm_no=$1', [String(req.params.studentId)]);
        if (!student.rows[0])
            throw new Error('Student not found');
        const result = await client.query(`INSERT INTO discipline_positive_marks (student_id,category,marks,note,awarded_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [String(req.params.studentId), input.category, input.marks, input.note, actor.staffId]);
        await (0, discipline_service_1.audit)(client, { studentId: String(req.params.studentId), actorId: actor.staffId, action: 'positive_behaviour_awarded', newValue: result.rows[0], ipAddress: actor.ipAddress });
        await client.query('COMMIT');
        clearDisciplineCache();
        return res.status(201).json({ success: true, award: result.rows[0] });
    }
    catch (error) {
        await client.query('ROLLBACK');
        return respondError(res, error, 'Failed to add positive behaviour');
    }
    finally {
        client.release();
    }
}
async function getStudentDisciplineProfile(req, res) {
    try {
        const [studentResult, incidentsResult, marksResult, positiveResult, actionsResult] = await Promise.all([
            db_1.db.query(`SELECT s.adm_no,s.name,s.photo_url,s.status,p.standard,p.division FROM students s LEFT JOIN academic_years ay ON ay.is_current=true LEFT JOIN academic_student_placements p ON p.student_id=s.adm_no AND p.academic_year_id=ay.id AND p.status='active' WHERE s.adm_no=$1`, [String(req.params.studentId)]),
            db_1.db.query(`SELECT i.id,i.reference_no,i.status,i.severity,i.discipline_marks,i.reported_at,c.name category_name,o.name offence_name FROM discipline_incidents i JOIN discipline_categories c ON c.id=i.category_id JOIN discipline_offence_types o ON o.id=i.offence_type_id WHERE i.student_id=$1 AND i.deleted_at IS NULL ORDER BY i.reported_at DESC`, [String(req.params.studentId)]),
            db_1.db.query(`SELECT COALESCE(sum(marks),0)::int active_marks FROM discipline_marks WHERE student_id=$1 AND status='active' AND (expires_at IS NULL OR expires_at>=CURRENT_DATE)`, [String(req.params.studentId)]),
            db_1.db.query('SELECT * FROM discipline_positive_marks WHERE student_id=$1 ORDER BY awarded_at DESC', [String(req.params.studentId)]),
            db_1.db.query(`SELECT a.*,i.reference_no FROM discipline_actions a JOIN discipline_incidents i ON i.id=a.incident_id WHERE i.student_id=$1 ORDER BY a.created_at DESC`, [String(req.params.studentId)])
        ]);
        const student = studentResult.rows[0];
        if (!student)
            return res.status(404).json({ success: false, error: 'Student not found' });
        const positiveMarks = positiveResult.rows.reduce((sum, row) => sum + Number(row.marks || 0), 0);
        const activeMarks = Math.max(0, Number(marksResult.rows[0]?.active_marks || 0) - positiveMarks);
        return res.json({ success: true, student, incidents: incidentsResult.rows, actions: actionsResult.rows, positiveMarks: positiveResult.rows, summary: { activeMarks, positiveMarks, riskLevel: await (0, discipline_service_1.calculateRisk)(activeMarks) } });
    }
    catch (error) {
        return respondError(res, error, 'Failed to load student discipline profile');
    }
}
