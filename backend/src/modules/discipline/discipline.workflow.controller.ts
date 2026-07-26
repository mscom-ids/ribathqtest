import { Request, Response } from 'express';
import { db } from '../../config/db';
import { invalidateCacheByPrefix } from '../../utils/server-cache';
import { audit, changeStatus, resolveDisciplineActor } from './discipline.service';
import { PARENT_STATUSES } from './discipline.types';
import { cleanText, parseIncidentCreate } from './discipline.validation';

function fail(res: Response, error: any, fallback: string) {
    const message = error?.message || fallback;
    const status = /required|invalid|not found|only draft/i.test(message) ? 400 : 500;
    if (status === 500) console.error(`[discipline] ${fallback}:`, error);
    return res.status(status).json({ success: false, error: message });
}

const clearCache = () => invalidateCacheByPrefix('discipline:');

export async function updateDraftIncident(req: Request, res: Response) {
    const client = await db.getClient();
    try {
        const actor = await resolveDisciplineActor(req);
        const input = parseIncidentCreate({ ...req.body, save_as_draft: true });
        await client.query('BEGIN');
        const current = await client.query(
            `SELECT * FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`,
            [String(req.params.id)],
        );
        if (!current.rows[0]) throw new Error('Incident not found');
        if (current.rows[0].status !== 'draft') throw new Error('Only draft incidents can be edited');
        if (!actor.canReview && current.rows[0].reported_by !== actor.staffId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, error: 'You can edit only your own draft reports' });
        }
        const updated = await client.query(
            `UPDATE discipline_incidents SET student_id=$2,category_id=$3,offence_type_id=$4,severity=$5,
             discipline_marks=$6,reported_at=$7,location=$8,hostel=$9,floor=$10,room_number=$11,
             class_name=$12,division=$13,short_description=$14,immediate_action=$15,student_position=$16,
             parent_notification_required=$17,parent_notification_status=CASE WHEN $17 THEN 'pending' ELSE 'not_required' END,
             private_staff_notes=$18,updated_at=now() WHERE id=$1 RETURNING *`,
            [String(req.params.id), input.student_id, input.category_id, input.offence_type_id, input.severity,
             input.discipline_marks, input.reported_at, input.location, input.hostel, input.floor, input.room_number,
             input.class_name, input.division, input.short_description, input.immediate_action, input.student_position,
             input.parent_notification_required, input.private_staff_notes],
        );
        await client.query('DELETE FROM discipline_witnesses WHERE incident_id=$1', [String(req.params.id)]);
        await client.query('DELETE FROM discipline_evidence WHERE incident_id=$1', [String(req.params.id)]);
        for (const witness of input.witnesses || []) {
            await client.query('INSERT INTO discipline_witnesses(incident_id,name,details) VALUES($1,$2,$3)', [String(req.params.id), witness.name, witness.details]);
        }
        for (const evidence of input.evidence || []) {
            await client.query(`INSERT INTO discipline_evidence(incident_id,uploaded_by,file_name,file_url,mime_type,file_size,visibility)
                                VALUES($1,$2,$3,$4,$5,$6,$7)`, [String(req.params.id), actor.staffId, evidence.file_name, evidence.file_url, evidence.mime_type, evidence.file_size, evidence.visibility]);
        }
        await audit(client, { incidentId: String(req.params.id), studentId: input.student_id, actorId: actor.staffId, action: 'draft_updated', oldValue: current.rows[0], newValue: updated.rows[0], ipAddress: actor.ipAddress });
        await client.query('COMMIT'); clearCache();
        return res.json({ success: true, incident: updated.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        return fail(res, error, 'Failed to update draft');
    } finally { client.release(); }
}

export async function submitIncident(req: Request, res: Response) {
    const client = await db.getClient();
    try {
        const actor = await resolveDisciplineActor(req);
        await client.query('BEGIN');
        const current = await client.query('SELECT * FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [String(req.params.id)]);
        if (!current.rows[0]) throw new Error('Incident not found');
        if (current.rows[0].status !== 'draft') throw new Error('Only draft incidents can be submitted');
        if (!actor.canReview && current.rows[0].reported_by !== actor.staffId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, error: 'You can submit only your own drafts' });
        }
        await changeStatus(client, String(req.params.id), 'submitted', actor.staffId, cleanText(req.body?.note, 1000) || 'Draft submitted for review');
        if (['major', 'critical'].includes(current.rows[0].severity) || current.rows[0].repeat_offence) {
            await client.query(`INSERT INTO discipline_notifications(incident_id,recipient_role,notification_type,message)
                                VALUES($1,'principal','incident_review_required',$2)`, [String(req.params.id), `${current.rows[0].reference_no} requires review`]);
        }
        await audit(client, { incidentId: String(req.params.id), studentId: current.rows[0].student_id, actorId: actor.staffId, action: 'incident_submitted', ipAddress: actor.ipAddress });
        await client.query('COMMIT'); clearCache();
        return res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        return fail(res, error, 'Failed to submit incident');
    } finally { client.release(); }
}

export async function recordParentCommunication(req: Request, res: Response) {
    const client = await db.getClient();
    try {
        const actor = await resolveDisciplineActor(req);
        const status = String(req.body?.status || '').toLowerCase();
        if (!PARENT_STATUSES.includes(status as any) || status === 'not_required') throw new Error('Invalid parent communication status');
        await client.query('BEGIN');
        const incident = await client.query('SELECT id,student_id FROM discipline_incidents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [String(req.params.id)]);
        if (!incident.rows[0]) throw new Error('Incident not found');
        const communication = await client.query(
            `INSERT INTO discipline_parent_communications(incident_id,status,method,notes,contacted_by,contacted_at)
             VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now())) RETURNING *`,
            [String(req.params.id), status, cleanText(req.body?.method, 80), cleanText(req.body?.notes, 2000), actor.staffId, cleanText(req.body?.contacted_at, 50)],
        );
        await client.query('UPDATE discipline_incidents SET parent_notification_required=true,parent_notification_status=$2,updated_at=now() WHERE id=$1', [String(req.params.id), status]);
        await audit(client, { incidentId: String(req.params.id), studentId: incident.rows[0].student_id, actorId: actor.staffId, action: 'parent_contacted', newValue: communication.rows[0], ipAddress: actor.ipAddress });
        await client.query('COMMIT'); clearCache();
        return res.status(201).json({ success: true, communication: communication.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        return fail(res, error, 'Failed to record parent communication');
    } finally { client.release(); }
}