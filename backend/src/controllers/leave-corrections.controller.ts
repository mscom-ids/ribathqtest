import { Request, Response } from 'express';
import { db } from '../config/db';
import { getStaffId } from '../utils/staff.utils';
import { invalidateCacheByPrefix } from '../utils/server-cache';

const ADMIN_LEAVE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
const MENTOR_ROLES = ['staff', 'usthad', 'mentor'];

function invalidateLeaveCaches() {
    invalidateCacheByPrefix('leaves:');
    invalidateCacheByPrefix('students:');
    invalidateCacheByPrefix('attendance:');
    invalidateCacheByPrefix('attendance:daily-stats');
    invalidateCacheByPrefix('hifz:monthly');
    invalidateCacheByPrefix('reports:mentors');
    invalidateCacheByPrefix('reports:students');
}

/**
 * Correct a recently entered individual leave.
 *
 * Exit/details are editable for 30 minutes from leave creation. A recorded
 * return time is editable for 6 hours from the time the return was recorded.
 * Both windows are enforced with the database clock inside a transaction so
 * client clock changes or direct API calls cannot bypass them.
 */
export const correctStudentLeave = async (req: Request, res: Response) => {
    const user = (req as any).user;
    const leaveId = String(req.params.id || '');
    const has = (field: string) => Object.prototype.hasOwnProperty.call(req.body || {}, field);
    const exitFields = [
        'start_datetime',
        'reason',
        'reason_category',
        'remarks',
        'companion_name',
        'companion_relationship',
    ];
    const exitChangeRequested = exitFields.some(has);
    const returnChangeRequested = has('actual_return_datetime');

    if (!leaveId || (!exitChangeRequested && !returnChangeRequested)) {
        return res.status(400).json({ success: false, error: 'No editable leave fields were supplied' });
    }

    const parseDate = (value: unknown, label: string) => {
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`${label} is required`);
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error(`${label} is invalid`);
        }
        return parsed;
    };

    const parseText = (value: unknown, label: string, maxLength: number, required = false) => {
        if (value === null || value === undefined) {
            if (required) throw new Error(`${label} is required`);
            return null;
        }
        if (typeof value !== 'string') {
            throw new Error(`${label} must be text`);
        }
        const parsed = value.trim();
        if (required && !parsed) throw new Error(`${label} is required`);
        if (parsed.length > maxLength) throw new Error(`${label} is too long`);
        return parsed || null;
    };

    const client = await db.getClient();
    try {
        await client.query('BEGIN');

        const leaveRes = await client.query(`
            SELECT sl.*,
                   return_edit.id AS return_movement_id,
                   COALESCE(return_edit.created_at,
                            CASE WHEN sl.actual_return_datetime IS NOT NULL THEN sl.updated_at END) AS return_marked_at,
                   NOW() AS database_now,
                   (NOW() <= sl.created_at + interval '30 minutes') AS can_edit_exit_details,
                   (sl.actual_return_datetime IS NOT NULL
                    AND sl.status IN ('returned', 'completed')
                    AND NOW() <= COALESCE(return_edit.created_at, sl.updated_at) + interval '6 hours') AS can_edit_return
            FROM student_leaves sl
            LEFT JOIN LATERAL (
                SELECT sm.id, sm.created_at
                FROM student_movements sm
                WHERE sm.leave_id = sl.id
                  AND sm.direction IN ('in', 'return')
                ORDER BY sm.created_at DESC
                LIMIT 1
            ) return_edit ON true
            WHERE sl.id = $1
            FOR UPDATE OF sl
        `, [leaveId]);

        if (leaveRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Leave not found' });
        }

        const leave = leaveRes.rows[0];

        if (leave.group_id || leave.leave_type === 'institutional') {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, error: 'Group and institutional leave entries cannot be edited individually' });
        }

        if (leave.leave_type === 'outdoor' && !ADMIN_LEAVE_ROLES.includes(user.role)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ success: false, error: 'Outdoor movements can only be corrected by admin users' });
        }

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            const assignedRes = await client.query(
                `SELECT 1
                 FROM students
                 WHERE adm_no = $1
                   AND (hifz_mentor_id = $2 OR school_mentor_id = $2 OR madrasa_mentor_id = $2)
                 LIMIT 1`,
                [leave.student_id, staffId]
            );
            if (assignedRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Not authorized for this student' });
            }
        }

        if (exitChangeRequested && !leave.can_edit_exit_details) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, error: 'Exit time, reason, and going-with details can only be edited within 30 minutes of entry' });
        }
        if (returnChangeRequested && !leave.can_edit_return) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, error: 'Return time can only be edited within 6 hours after the return was marked' });
        }

        const correctedStart = has('start_datetime')
            ? parseDate(req.body.start_datetime, 'Exit time')
            : new Date(leave.start_datetime);
        const correctedReturn = returnChangeRequested
            ? parseDate(req.body.actual_return_datetime, 'Return time')
            : (leave.actual_return_datetime ? new Date(leave.actual_return_datetime) : null);
        const expectedReturn = leave.end_datetime ? new Date(leave.end_datetime) : null;

        if (expectedReturn && correctedStart >= expectedReturn) {
            throw new Error('Exit time must be earlier than the expected return time');
        }
        if (correctedReturn && correctedReturn < correctedStart) {
            throw new Error('Return time cannot be earlier than exit time');
        }
        if (returnChangeRequested && correctedReturn && correctedReturn > new Date(leave.database_now)) {
            throw new Error('Return time cannot be in the future');
        }

        const correctedReasonCategory = has('reason_category')
            ? parseText(req.body.reason_category, 'Reason', 120, true)
            : leave.reason_category;
        const correctedRemarks = has('remarks')
            ? parseText(req.body.remarks, 'Remarks', 1000)
            : leave.remarks;
        const correctedCompanionName = has('companion_name')
            ? parseText(req.body.companion_name, 'Going with', 160)
            : leave.companion_name;
        const correctedCompanionRelationship = has('companion_relationship')
            ? parseText(req.body.companion_relationship, 'Relationship', 120)
            : leave.companion_relationship;

        if (['out-campus', 'outdoor'].includes(leave.leave_type)
            && exitChangeRequested
            && (!correctedCompanionName || !correctedCompanionRelationship)) {
            throw new Error('Going with and relationship are required');
        }
        if (exitChangeRequested && correctedReasonCategory === 'Other' && !correctedRemarks) {
            throw new Error('Remarks are required when the reason is Other');
        }

        const correctedReason = has('reason')
            ? parseText(req.body.reason, 'Reason', 1000)
            : (has('reason_category')
                ? (correctedReasonCategory === 'Other' ? correctedRemarks : correctedReasonCategory)
                : leave.reason);

        const updates: string[] = [];
        const values: any[] = [leaveId];
        const addUpdate = (column: string, value: any) => {
            values.push(value);
            updates.push(`${column} = $${values.length}`);
        };

        if (has('start_datetime')) {
            addUpdate('start_datetime', correctedStart.toISOString());
            if (leave.actual_exit_datetime) {
                addUpdate('actual_exit_datetime', correctedStart.toISOString());
            }
        }
        if (has('reason')) addUpdate('reason', correctedReason);
        if (has('reason_category')) {
            addUpdate('reason_category', correctedReasonCategory);
            if (!has('reason')) addUpdate('reason', correctedReason);
        }
        if (has('remarks')) addUpdate('remarks', correctedRemarks);
        if (has('companion_name')) addUpdate('companion_name', correctedCompanionName);
        if (has('companion_relationship')) addUpdate('companion_relationship', correctedCompanionRelationship);

        let correctedReturnStatus: string | null = leave.return_status;
        if (returnChangeRequested && correctedReturn) {
            correctedReturnStatus = expectedReturn && correctedReturn > expectedReturn ? 'late' : 'normal';
            addUpdate('actual_return_datetime', correctedReturn.toISOString());
            addUpdate('return_status', correctedReturnStatus);
        }

        if (updates.length > 0) {
            await client.query(
                `UPDATE student_leaves
                 SET ${updates.join(', ')}, updated_at = NOW()
                 WHERE id = $1`,
                values
            );
        }

        if (has('start_datetime')) {
            await client.query(`
                UPDATE student_movements
                SET timestamp = $2
                WHERE id = (
                    SELECT id
                    FROM student_movements
                    WHERE leave_id = $1
                      AND direction IN ('out', 'exit')
                    ORDER BY created_at DESC
                    LIMIT 1
                )
            `, [leaveId, correctedStart.toISOString()]);
        }

        if (returnChangeRequested && correctedReturn) {
            if (leave.return_movement_id) {
                await client.query(
                    `UPDATE student_movements
                     SET timestamp = $2, is_late = $3
                     WHERE id = $1`,
                    [leave.return_movement_id, correctedReturn.toISOString(), correctedReturnStatus === 'late']
                );
            } else {
                await client.query(`
                    INSERT INTO student_movements
                        (student_id, leave_id, direction, timestamp, is_late, recorded_by, created_at)
                    VALUES ($1, $2, 'in', $3, $4, $5, $6)
                `, [
                    leave.student_id,
                    leaveId,
                    correctedReturn.toISOString(),
                    correctedReturnStatus === 'late',
                    user.id,
                    leave.return_marked_at,
                ]);
            }
        }

        await client.query('COMMIT');
        invalidateLeaveCaches();
        return res.json({ success: true });
    } catch (error: any) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: error.message || 'Failed to correct leave' });
    } finally {
        client.release();
    }
};