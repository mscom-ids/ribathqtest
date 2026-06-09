import { Request, Response } from 'express';
import { db } from '../config/db';
import crypto from 'crypto';
import { getStaffId } from '../utils/staff.utils';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../utils/server-cache';

const ADMIN_LEAVE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
const MENTOR_ROLES = ['staff', 'usthad', 'mentor'];
let studentCurrentPresenceTableExists: boolean | null = null;

function invalidateLeaveCaches() {
    invalidateCacheByPrefix('leaves:');
    invalidateCacheByPrefix('students:');
    invalidateCacheByPrefix('attendance:');
    invalidateCacheByPrefix('attendance:daily-stats');
    invalidateCacheByPrefix('hifz:monthly');
    invalidateCacheByPrefix('reports:mentors');
    invalidateCacheByPrefix('reports:students');
}

async function hasStudentCurrentPresenceTable() {
    if (studentCurrentPresenceTableExists !== null) return studentCurrentPresenceTableExists;

    const result = await db.query(`SELECT to_regclass('public.student_current_presence') AS table_name`);
    studentCurrentPresenceTableExists = Boolean(result.rows[0]?.table_name);
    return studentCurrentPresenceTableExists;
}

function parseLimitOffset(query: Request['query'], defaultLimit = 100, maxLimit = 500) {
    const rawLimit = Number(query.limit ?? defaultLimit);
    const rawOffset = Number(query.offset ?? 0);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : defaultLimit, 1), maxLimit);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
    return { limit, offset };
}

const APP_TIME_ZONE = 'Asia/Kolkata';
const institutionalCancellationPrefix = 'Institutional Leave:';

function institutionalCancellationReason(id: string) {
    return `${institutionalCancellationPrefix}${id}`;
}

function toDateKey(value: string | Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateKeysBetween(start: string, end: string): string[] {
    const startKey = toDateKey(start);
    const endKey = toDateKey(end);
    const dates: string[] = [];
    const cursor = new Date(`${startKey}T00:00:00.000Z`);
    const last = new Date(`${endKey}T00:00:00.000Z`);

    while (cursor <= last) {
        dates.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
}

function normalizeScheduleStandard(label: string): string {
    const l = label.trim();
    if (l === 'Hifz Only') return 'Hifz';
    if (l === '+1 (Plus One)') return 'Plus One';
    if (l === '+2 (Plus Two)') return 'Plus Two';
    if (l.endsWith(' Standard')) return l.replace(' Standard', '');
    return l;
}

function parseStandardList(value: any): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return value.split(',').map(item => item.trim()).filter(Boolean);
        }
    }
    return [];
}

function normalizeStandardList(values: any[] = []) {
    return Array.from(new Set(values
        .map(value => normalizeScheduleStandard(String(value || '').trim()))
        .filter(Boolean)));
}

function getDayOfWeek(dateKey: string) {
    return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

function scheduleDateTime(dateKey: string, timeValue: string) {
    const cleanTime = String(timeValue || '00:00:00').slice(0, 8);
    return new Date(`${dateKey}T${cleanTime}+05:30`);
}

function doRangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
    return startA < endB && endA > startB;
}

async function applyInstitutionalAttendanceCancellations(client: any, leave: {
    id: string;
    start_datetime: string;
    end_datetime: string;
    target_classes?: any[];
    is_entire_institution: boolean;
    created_by: string;
}) {
    const dateKeys = dateKeysBetween(leave.start_datetime, leave.end_datetime);
    if (dateKeys.length === 0) return 0;

    const targetClasses = normalizeStandardList(parseStandardList(leave.target_classes));
    if (!leave.is_entire_institution && targetClasses.length === 0) return 0;

    const schedulesRes = await client.query(
        `SELECT id, standards, day_of_week, start_time, end_time, effective_from, effective_until
         FROM attendance_schedules
         WHERE (is_deleted = false OR is_deleted IS NULL)
           AND (effective_from IS NULL OR effective_from <= $2::date)
           AND (effective_until IS NULL OR effective_until >= $1::date)`,
        [dateKeys[0], dateKeys[dateKeys.length - 1]]
    );

    const leaveStart = new Date(leave.start_datetime);
    const leaveEnd = new Date(leave.end_datetime);
    const rows: any[] = [];

    for (const dateKey of dateKeys) {
        const dayOfWeek = getDayOfWeek(dateKey);

        for (const schedule of schedulesRes.rows) {
            if (Number(schedule.day_of_week) !== dayOfWeek) continue;

            const scheduleStart = scheduleDateTime(dateKey, schedule.start_time);
            const scheduleEnd = scheduleDateTime(dateKey, schedule.end_time);
            if (!doRangesOverlap(scheduleStart, scheduleEnd, leaveStart, leaveEnd)) continue;

            let cancelledStandards: string[] | null = null;
            if (!leave.is_entire_institution) {
                const scheduleStandards = normalizeStandardList(parseStandardList(schedule.standards));
                const affectedStandards = scheduleStandards.length > 0
                    ? targetClasses.filter(standard => scheduleStandards.includes(standard))
                    : targetClasses;

                if (affectedStandards.length === 0) continue;
                cancelledStandards = scheduleStandards.length > 0 && affectedStandards.length === scheduleStandards.length
                    ? null
                    : affectedStandards;
            }

            rows.push({
                schedule_id: schedule.id,
                date: dateKey,
                reason: institutionalCancellationReason(leave.id),
                cancelled_by: leave.created_by,
                cancelled_standards: cancelledStandards,
            });
        }
    }

    if (rows.length === 0) return 0;

    await client.query(
        `INSERT INTO attendance_cancellations (schedule_id, date, reason, cancelled_by, cancelled_standards)
         SELECT schedule_id, date, reason, cancelled_by, cancelled_standards
         FROM jsonb_to_recordset($1::jsonb) AS x(
             schedule_id uuid,
             date date,
             reason text,
             cancelled_by uuid,
             cancelled_standards jsonb
         )
         ON CONFLICT (schedule_id, date) DO UPDATE SET
             reason = CASE
                 WHEN attendance_cancellations.reason LIKE '${institutionalCancellationPrefix}%'
                     THEN EXCLUDED.reason
                 ELSE attendance_cancellations.reason
             END,
             cancelled_by = EXCLUDED.cancelled_by,
             cancelled_standards = CASE
                 WHEN attendance_cancellations.cancelled_standards IS NULL OR EXCLUDED.cancelled_standards IS NULL
                     THEN NULL
                 ELSE (
                     SELECT jsonb_agg(DISTINCT value)
                     FROM (
                         SELECT jsonb_array_elements_text(attendance_cancellations.cancelled_standards) AS value
                         UNION
                         SELECT jsonb_array_elements_text(EXCLUDED.cancelled_standards) AS value
                     ) merged
                 )
             END`,
        [JSON.stringify(rows)]
    );

    return rows.length;
}

/** =============================
 *  SHARED / HELPERS
 *  ============================= */

// Get eligible students who are currently NOT outside
export const getEligibleStudents = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let query = `
            SELECT s.adm_no, s.name, s.standard, s.school_standard, s.hifz_standard, s.madrassa_standard,
            (SELECT status FROM student_leaves sl WHERE sl.student_id = s.adm_no ORDER BY sl.created_at DESC LIMIT 1) as current_status
            FROM students s 
            WHERE s.status = 'active'
        `;
        const params: any[] = [];
        let paramCount = 1;

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (staffId) {
                query += ` AND (s.hifz_mentor_id = $${paramCount} OR s.school_mentor_id = $${paramCount} OR s.madrasa_mentor_id = $${paramCount})`;
                params.push(staffId);
                paramCount++;
            }
        } else if (user.role === 'parent' || user.role === 'student') {
            const parentRes = await db.query('SELECT parent_id FROM profiles WHERE id = $1', [user.id]);
            if (parentRes.rows.length > 0) {
               query += ` AND s.parent_id = $${paramCount}`;
               params.push(parentRes.rows[0].parent_id);
               paramCount++;
            }
        }

        query += " ORDER BY s.name";

        const result = await db.query(query, params);
        
        const students = result.rows.map(s => ({
            adm_no: s.adm_no,
            name: s.name,
            standard: s.standard || s.school_standard || s.hifz_standard || s.madrassa_standard || "Common",
            is_outside: s.current_status === 'outside'
        }));

        res.json({ success: true, students });
    } catch (err) {
        console.error("Error fetching eligible students:", err);
        res.status(500).json({ success: false, error: "Failed to load students" });
    }
};

/** =============================
 *  INSTITUTIONAL LEAVE
 *  ============================= */

export const createInstitutionalLeave = async (req: Request, res: Response) => {
    try {
        const { name, start_datetime, end_datetime, target_classes, is_entire_institution, exceptions } = req.body;
        const user = (req as any).user;

        if (new Date(end_datetime) <= new Date(start_datetime)) {
            return res.status(400).json({ success: false, error: 'End datetime must be after start datetime' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Create the main record
            const instLeaveRes = await client.query(`
                INSERT INTO institutional_leaves (name, start_datetime, end_datetime, target_classes, is_entire_institution, created_by)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `, [name, start_datetime, end_datetime, JSON.stringify(target_classes), is_entire_institution, user.id]);
            const inst_id = instLeaveRes.rows[0].id;

            // 2. Bulk-insert exceptions in ONE round trip (was N+1)
            if (exceptions && exceptions.length > 0) {
                await client.query(
                    `INSERT INTO leave_exceptions (institutional_leave_id, student_id)
                     SELECT $1, sid FROM unnest($2::text[]) AS t(sid)`,
                    [inst_id, exceptions]
                );
            }

            const cancellationCount = await applyInstitutionalAttendanceCancellations(client, {
                id: inst_id,
                start_datetime,
                end_datetime,
                target_classes,
                is_entire_institution,
                created_by: user.id,
            });

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.status(201).json({
                success: true,
                count: 0,
                cancellation_count: cancellationCount,
                institutional_leave_id: inst_id,
            });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error creating institutional leave:', err);
        res.status(500).json({ success: false, error: 'Failed to create institutional leave' });
    }
};

export const getInstitutionalEligibleStudents = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;

        const leaveRes = await db.query(`SELECT * FROM institutional_leaves WHERE id = $1`, [id]);
        if (leaveRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Institutional leave not found' });
        }

        const leave = leaveRes.rows[0];
        const targetClasses = Array.isArray(leave.target_classes) ? leave.target_classes : [];
        const params: any[] = [id];
        let query = `
            SELECT s.adm_no, s.name,
                   COALESCE(s.standard, s.school_standard, s.hifz_standard, s.madrassa_standard, 'Common') as standard,
                   EXISTS (
                       SELECT 1 FROM student_leaves sl
                       WHERE sl.student_id = s.adm_no AND sl.status = 'outside'
                   ) as is_outside,
                   EXISTS (
                       SELECT 1 FROM student_leaves sl
                       WHERE sl.student_id = s.adm_no AND sl.institutional_leave_id = $1
                   ) as has_institutional_record
            FROM students s
            WHERE s.status = 'active'
              AND NOT EXISTS (
                  SELECT 1 FROM leave_exceptions le
                  WHERE le.institutional_leave_id = $1 AND le.student_id = s.adm_no
              )
        `;

        if (!leave.is_entire_institution) {
            params.push(targetClasses);
            query += ` AND (
                s.standard = ANY($2::text[])
                OR s.school_standard = ANY($2::text[])
                OR s.hifz_standard = ANY($2::text[])
                OR s.madrassa_standard = ANY($2::text[])
            )`;
        }

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            const idx = params.length + 1;
            query += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
            params.push(staffId);
        }

        query += ` ORDER BY s.name`;
        const result = await db.query(query, params);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching institutional eligible students:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};

export const markInstitutionalExit = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { student_id, student_ids, exit_datetime, companion_name, companion_relationship } = req.body;
        const user = (req as any).user;
        const requestedIds = Array.isArray(student_ids) ? student_ids : (student_id ? [student_id] : []);

        if (requestedIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Select at least one student' });
        }
        if (!exit_datetime) {
            return res.status(400).json({ success: false, error: 'Exit time is required' });
        }
        if (!companion_name?.trim() || !companion_relationship?.trim()) {
            return res.status(400).json({ success: false, error: 'Going with and relationship are required' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const leaveRes = await client.query(`SELECT * FROM institutional_leaves WHERE id = $1 FOR UPDATE`, [id]);
            if (leaveRes.rows.length === 0) {
                throw new Error('Institutional leave not found');
            }

            const inst = leaveRes.rows[0];
            const exitTime = new Date(exit_datetime);
            if (exitTime < new Date(inst.start_datetime) || exitTime > new Date(inst.end_datetime)) {
                throw new Error('Exit time must be within the institutional leave window');
            }

            const targetClasses = Array.isArray(inst.target_classes) ? inst.target_classes : [];
            const params: any[] = [requestedIds, id];
            let studentQuery = `
                SELECT s.adm_no
                FROM students s
                WHERE s.status = 'active'
                  AND s.adm_no = ANY($1::text[])
                  AND NOT EXISTS (
                      SELECT 1 FROM leave_exceptions le
                      WHERE le.institutional_leave_id = $2 AND le.student_id = s.adm_no
                  )
            `;

            if (!inst.is_entire_institution) {
                params.push(targetClasses);
                studentQuery += ` AND (
                    s.standard = ANY($3::text[])
                    OR s.school_standard = ANY($3::text[])
                    OR s.hifz_standard = ANY($3::text[])
                    OR s.madrassa_standard = ANY($3::text[])
                )`;
            }

            if (MENTOR_ROLES.includes(user.role)) {
                const staffId = await getStaffId(req);
                if (!staffId) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, error: 'Staff profile not found' });
                }
                const idx = params.length + 1;
                studentQuery += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
                params.push(staffId);
            }

            const studentsRes = await client.query(studentQuery, params);
            const allowedIds = studentsRes.rows.map((r: any) => r.adm_no);
            if (allowedIds.length !== requestedIds.length) {
                throw new Error('One or more selected students are not eligible for this institutional leave');
            }

            const openCheck = await client.query(
                `SELECT student_id FROM student_leaves WHERE student_id = ANY($1::text[]) AND status = 'outside'`,
                [allowedIds]
            );
            if (openCheck.rows.length > 0) {
                throw new Error('One or more selected students are already outside campus');
            }

            const existingCheck = await client.query(
                `SELECT student_id FROM student_leaves WHERE student_id = ANY($1::text[]) AND institutional_leave_id = $2`,
                [allowedIds, id]
            );
            if (existingCheck.rows.length > 0) {
                throw new Error('Exit has already been recorded for one or more selected students');
            }

            const slBulk = await client.query(
                `INSERT INTO student_leaves
                     (student_id, institutional_leave_id, leave_type, start_datetime, end_datetime, reason, reason_category,
                      companion_name, companion_relationship, status, created_by)
                 SELECT sid, $2, 'institutional', $3, $4, $5, 'Institutional Leave', $6, $7, 'outside', $8
                 FROM unnest($1::text[]) AS t(sid)
                 RETURNING id, student_id`,
                [allowedIds, id, exit_datetime, inst.end_datetime, inst.name, companion_name.trim(), companion_relationship.trim(), user.id]
            );

            const movementStudentIds = slBulk.rows.map((r: any) => r.student_id);
            const movementLeaveIds = slBulk.rows.map((r: any) => r.id);

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                 SELECT sid, lid, 'out', $1, $2
                 FROM unnest($3::text[], $4::uuid[]) AS t(sid, lid)`,
                [exit_datetime, user.id, movementStudentIds, movementLeaveIds]
            );

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.status(201).json({ success: true, count: allowedIds.length });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error marking institutional exit:', err);
        res.status(500).json({ success: false, error: 'Failed to mark exit' });
    }
};

export const getInstitutionalLeaves = async (req: Request, res: Response) => {
    try {
        const leaves = await cachedResult('leaves:institutional', 10_000, async () => {
            const query = `
                WITH leave_counts AS (
                    SELECT
                        institutional_leave_id,
                        COUNT(*) as total_students,
                        COUNT(*) FILTER (WHERE status = 'returned') as returned_students
                    FROM student_leaves
                    WHERE institutional_leave_id IS NOT NULL
                    GROUP BY institutional_leave_id
                )
                SELECT
                    il.*,
                    COALESCE(lc.total_students, 0)::text as total_students,
                    COALESCE(lc.returned_students, 0)::text as returned_students
                FROM institutional_leaves il
                LEFT JOIN leave_counts lc ON lc.institutional_leave_id = il.id
                ORDER BY il.created_at DESC
            `;
            const result = await db.query(query);
            return result.rows;
        });

        res.json({ success: true, leaves });
    } catch (err) {
        console.error('Error fetching institutional leaves:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch institutional leaves' });
    }
};

export const getInstitutionalLeaveStudents = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const query = `
            SELECT sl.id as leave_id, sl.student_id, sl.status, sl.return_status, sl.actual_return_datetime,
                   s.name, COALESCE(s.standard, s.school_standard, s.hifz_standard, 'Common') as standard, s.adm_no
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            WHERE sl.institutional_leave_id = $1
            ORDER BY s.name
        `;
        const result = await db.query(query, [id]);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching institutional leave students:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};

export const deleteInstitutionalLeave = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id);

        // Start transaction
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // Delete student_movements associated with the student_leaves of this institutional leave
            await client.query(`
                DELETE FROM student_movements 
                WHERE leave_id IN (SELECT id FROM student_leaves WHERE institutional_leave_id = $1)
            `, [id]);

            // Delete student_leaves
            await client.query('DELETE FROM student_leaves WHERE institutional_leave_id = $1', [id]);

            // Delete exceptions
            await client.query('DELETE FROM leave_exceptions WHERE institutional_leave_id = $1', [id]);

            // Delete attendance cancellations generated directly by this leave.
            await client.query('DELETE FROM attendance_cancellations WHERE reason = $1', [institutionalCancellationReason(id)]);

            // Delete main record
            await client.query('DELETE FROM institutional_leaves WHERE id = $1', [id]);

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.json({ success: true, message: 'Institutional leave deleted successfully' });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error deleting institutional leave:', err);
        res.status(500).json({ success: false, error: 'Failed to delete leave' });
    }
};

export const bulkRecordReturn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { return_datetime, standard, leave_ids } = req.body;
        const user = (req as any).user;

        if (!return_datetime) return res.status(400).json({ success: false, error: "Return time required" });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let studentLeavesQuery = `
                SELECT sl.id, sl.student_id, sl.end_datetime
                FROM student_leaves sl
                JOIN students s ON sl.student_id = s.adm_no
                WHERE sl.institutional_leave_id = $1 AND sl.status = 'outside'
            `;
            const params: any[] = [id];

            if (standard && standard !== "All") {
                const idx = params.length + 1;
                studentLeavesQuery += ` AND s.standard = $${idx}`;
                params.push(standard);
            }

            if (Array.isArray(leave_ids) && leave_ids.length > 0) {
                const idx = params.length + 1;
                studentLeavesQuery += ` AND sl.id = ANY($${idx}::uuid[])`;
                params.push(leave_ids);
            }

            if (MENTOR_ROLES.includes(user.role)) {
                const staffId = await getStaffId(req);
                if (!staffId) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, error: 'Staff profile not found' });
                }
                const idx = params.length + 1;
                studentLeavesQuery += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
                params.push(staffId);
            }

            const pending = await client.query(studentLeavesQuery, params);

            if (pending.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ success: true, message: "No pending students found to return in this group.", count: 0 });
            }

            // Bulk UPDATE + bulk INSERT (was 2N round trips).
            const leaveIds = pending.rows.map((r: any) => r.id);
            const studentIds = pending.rows.map((r: any) => r.student_id);

            await client.query(
                `UPDATE student_leaves
                 SET status = 'returned',
                     actual_return_datetime = $1,
                     return_status = CASE WHEN end_datetime IS NOT NULL AND $1::timestamptz > end_datetime THEN 'late' ELSE 'normal' END,
                     updated_at = NOW()
                 WHERE id = ANY($2::uuid[])`,
                [return_datetime, leaveIds]
            );

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, is_late, recorded_by)
                 SELECT sid, lid, 'in', $1, $1::timestamptz > end_dt, $2
                 FROM unnest($3::text[], $4::uuid[], $5::timestamptz[]) AS t(sid, lid, end_dt)`,
                [return_datetime, user.id, studentIds, leaveIds, pending.rows.map((r: any) => r.end_datetime)]
            );

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.json({ success: true, count: pending.rows.length });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error in bulk return:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getGroupLeaveStudents = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const user = (req as any).user;
        const params: any[] = [id];
        let query = `
            SELECT sl.id as leave_id, sl.student_id, sl.status, sl.return_status, sl.actual_return_datetime,
                   s.name, COALESCE(s.standard, s.school_standard, s.hifz_standard, 'Common') as standard, s.adm_no
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            WHERE sl.group_id = $1
        `;

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            query += ` AND (s.hifz_mentor_id = $2 OR s.school_mentor_id = $2 OR s.madrasa_mentor_id = $2)`;
            params.push(staffId);
        }

        query += ` ORDER BY s.name`;
        const result = await db.query(query, params);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching group leave students:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};

export const bulkRecordGroupReturn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { return_datetime, standard, leave_ids } = req.body;
        const user = (req as any).user;

        if (!return_datetime) return res.status(400).json({ success: false, error: "Return time required" });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let studentLeavesQuery = `
                SELECT sl.id, sl.student_id, sl.end_datetime
                FROM student_leaves sl
                JOIN students s ON sl.student_id = s.adm_no
                WHERE sl.group_id = $1 AND sl.status = 'outside'
            `;
            const params: any[] = [id];

            if (standard && standard !== "All") {
                const idx = params.length + 1;
                studentLeavesQuery += ` AND s.standard = $${idx}`;
                params.push(standard);
            }

            if (Array.isArray(leave_ids) && leave_ids.length > 0) {
                const idx = params.length + 1;
                studentLeavesQuery += ` AND sl.id = ANY($${idx}::uuid[])`;
                params.push(leave_ids);
            }

            if (MENTOR_ROLES.includes(user.role)) {
                const staffId = await getStaffId(req);
                if (!staffId) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, error: 'Staff profile not found' });
                }
                const idx = params.length + 1;
                studentLeavesQuery += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
                params.push(staffId);
            }

            const pending = await client.query(studentLeavesQuery, params);

            if (pending.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ success: true, message: "No pending students found to return in this group.", count: 0 });
            }

            // Bulk UPDATE + bulk INSERT (was 2N round trips).
            const leaveIds = pending.rows.map((r: any) => r.id);
            const studentIds = pending.rows.map((r: any) => r.student_id);

            await client.query(
                `UPDATE student_leaves
                 SET status = 'returned',
                     actual_return_datetime = $1,
                     return_status = CASE WHEN end_datetime IS NOT NULL AND $1::timestamptz > end_datetime THEN 'late' ELSE 'normal' END,
                     updated_at = NOW()
                 WHERE id = ANY($2::uuid[])`,
                [return_datetime, leaveIds]
            );

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, is_late, recorded_by)
                 SELECT sid, lid, 'in', $1, end_dt IS NOT NULL AND $1::timestamptz > end_dt, $2
                 FROM unnest($3::text[], $4::uuid[], $5::timestamptz[]) AS t(sid, lid, end_dt)`,
                [return_datetime, user.id, studentIds, leaveIds, pending.rows.map((r: any) => r.end_datetime)]
            );

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.json({ success: true, count: pending.rows.length });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error in bulk group return:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};


/** =============================
 *  OUT/ON CAMPUS LEAVES
 *  ============================= */

export const createPersonalLeave = async (req: Request, res: Response) => {
    try {
        const { student_id, leave_type, start_datetime, end_datetime, reason, reason_category, remarks, companion_name, companion_relationship } = req.body;
        const user = (req as any).user;

        if (!student_id || !leave_type || !start_datetime) {
            return res.status(400).json({ success: false, error: 'Student, leave type, and start datetime are required' });
        }

        if (leave_type !== 'outdoor' && !end_datetime) {
            return res.status(400).json({ success: false, error: 'Expected return is required' });
        }

        if (end_datetime && new Date(end_datetime) <= new Date(start_datetime)) {
            return res.status(400).json({ success: false, error: 'End datetime must be after start datetime' });
        }

        if (!['out-campus', 'on-campus', 'outdoor'].includes(leave_type)) {
            return res.status(400).json({ success: false, error: 'Invalid leave type' });
        }

        if (leave_type === 'outdoor' && !ADMIN_LEAVE_ROLES.includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Outdoor movements can only be created by admin users' });
        }

        if (['out-campus', 'outdoor'].includes(leave_type) && (!companion_name?.trim() || !companion_relationship?.trim())) {
            return res.status(400).json({ success: false, error: 'Going with and relationship are required' });
        }

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            const assignedRes = await db.query(
                `SELECT 1 FROM students
                 WHERE adm_no = $1
                   AND (hifz_mentor_id = $2 OR school_mentor_id = $2 OR madrasa_mentor_id = $2)
                 LIMIT 1`,
                [student_id, staffId]
            );
            if (assignedRes.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Not authorized for this student' });
            }
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // If the movement takes them outside, they shouldn't already be outside
            if (leave_type === 'out-campus' || leave_type === 'outdoor') {
                const outCheck = await client.query(`SELECT id FROM student_leaves WHERE student_id = $1 AND status = 'outside'`, [student_id]);
                if (outCheck.rows.length > 0) {
                    throw new Error('Student is already outside campus');
                }
            }

            // on-campus leaves are directly authorized (status='approved'); outside movements start 'outside'
            const initialStatus = (leave_type === 'out-campus' || leave_type === 'outdoor') ? 'outside' : 'approved';
            const finalEndDatetime = leave_type === 'outdoor' ? null : end_datetime;
            const finalReason = leave_type === 'outdoor' ? 'Outdoor' : reason;
            const finalReasonCategory = leave_type === 'outdoor' ? 'Outdoor' : reason_category;

            const insRes = await client.query(`
                INSERT INTO student_leaves
                    (student_id, leave_type, start_datetime, end_datetime, reason, reason_category, remarks, companion_name, companion_relationship, status, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING id
            `, [
                student_id,
                leave_type,
                start_datetime,
                finalEndDatetime,
                finalReason,
                finalReasonCategory,
                remarks || null,
                companion_name || null,
                companion_relationship || null,
                initialStatus,
                user.id
            ]);
            
            const leave_id = insRes.rows[0].id;

            if (initialStatus === 'outside') {
                await client.query(`
                    INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                    VALUES ($1, $2, 'out', $3, $4)
                `, [student_id, leave_id, start_datetime, user.id]);
            }

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.status(201).json({ success: true, leave_id });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error creating personal leave:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const createGroupLeave = async (req: Request, res: Response) => {
    try {
        const { group_type, group_value, leave_type, start_datetime, end_datetime, reason_category, remarks, exceptions, companion_name, companion_relationship } = req.body;
        const user = (req as any).user;

        if (new Date(end_datetime) <= new Date(start_datetime)) {
            return res.status(400).json({ success: false, error: 'End datetime must be after start datetime' });
        }

        if (leave_type === 'out-campus' && (!companion_name?.trim() || !companion_relationship?.trim())) {
            return res.status(400).json({ success: false, error: 'Going with and relationship are required' });
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let studentQuery = `SELECT adm_no FROM students WHERE status = 'active'`;
            const params: any[] = [];
            
            if (group_type === 'class') {
                studentQuery += ` AND (standard = $1 OR school_standard = $1 OR hifz_standard = $1 OR madrassa_standard = $1)`;
                params.push(group_value);
            } else if (group_type === 'batch') {
                studentQuery += ` AND batch_year = $1`;
                params.push(group_value);
            }

            const studentsRes = await client.query(studentQuery, params);
            let targetStudents = studentsRes.rows.map(s => s.adm_no);

            // Filter out exceptions
            const exceptionSet = new Set(exceptions || []);
            targetStudents = targetStudents.filter(id => !exceptionSet.has(id));

            if (targetStudents.length === 0) {
                throw new Error('No students found for the selected group');
            }

            const group_id = crypto.randomUUID();

            // Bulk insert student_leaves + paired student_movements in 2 round trips
            // (was 2N round trips for groups of any size).
            const slBulk = await client.query(
                `INSERT INTO student_leaves
                     (student_id, leave_type, start_datetime, end_datetime, reason_category, remarks, companion_name, companion_relationship, status, group_id, group_type, group_value, created_by)
                 SELECT sid, $2, $3, $4, $5, $6, $7, $8, 'outside', $9, $10, $11, $12
                 FROM unnest($1::text[]) AS t(sid)
                 RETURNING id, student_id`,
                [targetStudents, leave_type, start_datetime, end_datetime, reason_category, remarks,
                 companion_name || null, companion_relationship || null, group_id, group_type, String(group_value), user.id]
            );

            const movStudentIds = slBulk.rows.map((r: any) => r.student_id);
            const movLeaveIds   = slBulk.rows.map((r: any) => r.id);

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                 SELECT sid, lid, 'out', $1, $2
                 FROM unnest($3::text[], $4::uuid[]) AS t(sid, lid)`,
                [start_datetime, user.id, movStudentIds, movLeaveIds]
            );

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.status(201).json({ success: true, count: targetStudents.length });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error creating group leave:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getLeavesFilter = async (req: Request, res: Response) => {
    try {
        const { type } = req.query; // 'out-campus', 'on-campus'
        const user = (req as any).user;

        if (type === 'outdoor' && !ADMIN_LEAVE_ROLES.includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Outdoor movements are admin-only' });
        }

        let staffId: string | null = null;
        if (MENTOR_ROLES.includes(user.role)) {
            staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
        }

        const cacheKey = makeCacheKey('leaves:filter', {
            type: String(type || ''),
            role: user.role,
            staffId: staffId || 'all',
            limit: String(req.query.limit || ''),
            offset: String(req.query.offset || ''),
        });

        const groupedLeaves = await cachedResult(cacheKey, 10_000, async () => {
            const { limit, offset } = parseLimitOffset(req.query, 250, 500);
            const params: any[] = [type];
            let query = `
                SELECT sl.*, s.name as student_name, COALESCE(s.standard, s.school_standard, s.hifz_standard) as school_standard, s.adm_no as student_adm_no
                FROM student_leaves sl
                JOIN students s ON sl.student_id = s.adm_no
                WHERE sl.leave_type = $1
            `;

            if (staffId) {
                query += ` AND (s.hifz_mentor_id = $2 OR s.school_mentor_id = $2 OR s.madrasa_mentor_id = $2)`;
                params.push(staffId);
            }

            const limitIdx = params.length + 1;
            const offsetIdx = params.length + 2;
            query += ` ORDER BY sl.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
            params.push(limit, offset);
            const result = await db.query(query, params);

            const leavesMap = new Map();
            const grouped: any[] = [];

            for (const row of result.rows) {
                const { student_name, school_standard, student_adm_no, ...rest } = row;

                if (rest.group_id) {
                    if (!leavesMap.has(rest.group_id)) {
                        const groupEntry = {
                            ...rest,
                            is_group: true,
                            count: 1,
                            student: {
                                name: rest.group_type === 'class' ? `Class: ${rest.group_value}` : `Batch: ${rest.group_value}`,
                                standard: rest.group_value || '',
                                adm_no: `GROUP-${rest.group_type?.toUpperCase()}`
                            }
                        };
                        leavesMap.set(rest.group_id, groupEntry);
                        grouped.push(groupEntry);
                    } else {
                        leavesMap.get(rest.group_id).count++;
                    }
                } else {
                    grouped.push({
                        ...rest,
                        is_group: false,
                        student: { name: student_name, standard: school_standard || '', adm_no: student_adm_no }
                    });
                }
            }

            return grouped;
        });
        
        res.json({ success: true, leaves: groupedLeaves });
    } catch (err) {
        console.error('Error fetching leaves:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/** =============================
 *  MOVEMENT & RETURN
 *  ============================= */

export const recordReturn = async (req: Request, res: Response) => {
    try {
        const { leave_id, return_datetime } = req.body;
        const user = (req as any).user;

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const leaveRes = await client.query(`SELECT * FROM student_leaves WHERE id = $1`, [leave_id]);
            if (leaveRes.rows.length === 0) throw new Error('Leave not found');
            const leave = leaveRes.rows[0];

            if (leave.leave_type === 'outdoor' && !ADMIN_LEAVE_ROLES.includes(user.role)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Outdoor movements can only be controlled by admin users' });
            }

            if (MENTOR_ROLES.includes(user.role)) {
                const staffId = await getStaffId(req);
                if (!staffId) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ success: false, error: 'Staff profile not found' });
                }
                const assignedRes = await client.query(
                    `SELECT 1 FROM students
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

            if (leave.status === 'returned' || leave.status === 'completed') throw new Error('Leave has already been closed');

            // on-campus leaves transition approved→completed; out-campus leaves transition outside→returned

            const actualReturn = new Date(return_datetime);
            
            if (actualReturn < new Date(leave.start_datetime)) {
                throw new Error('Return time cannot be earlier than exit time');
            }

            const returnStatus = leave.end_datetime && actualReturn > new Date(leave.end_datetime) ? 'late' : 'normal';
            // on-campus leaves close as 'completed', out-campus close as 'returned'
            const closedStatus = leave.leave_type === 'on-campus' ? 'completed' : 'returned';

            await client.query(`
                INSERT INTO student_movements (student_id, leave_id, direction, timestamp, is_late, recorded_by)
                VALUES ($1, $2, 'in', $3, $4, $5)
            `, [leave.student_id, leave_id, return_datetime, returnStatus === 'late', user.id]);

            await client.query(`
                UPDATE student_leaves 
                SET status = $4, actual_return_datetime = $1, return_status = $2, updated_at = NOW()
                WHERE id = $3
            `, [return_datetime, returnStatus, leave_id, closedStatus]);

            await client.query('COMMIT');
            invalidateLeaveCaches();
            res.json({ success: true });
        } catch (e: any) {
            await client.query('ROLLBACK');
            res.status(400).json({ success: false, error: e.message });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error recording return:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMovementHistory = async (req: Request, res: Response) => {
    try {
        const { limit, offset } = parseLimitOffset(req.query, 100, 500);
        const query = `
            SELECT sm.id, sm.student_id, sm.leave_id, sm.direction, sm.timestamp, sm.is_late,
                   sl.leave_type, sl.reason_category, sl.remarks,
                   s.name as student_name, s.adm_no,
                   COALESCE(st.name, 'System') as recorded_by_name
            FROM student_movements sm
            JOIN student_leaves sl ON sm.leave_id = sl.id
            JOIN students s ON sm.student_id = s.adm_no
            LEFT JOIN staff st ON sm.recorded_by = st.profile_id
            ORDER BY sm.timestamp DESC
            LIMIT $1 OFFSET $2
        `;
        const [result, countRes] = await Promise.all([
            db.query(query, [limit, offset]),
            db.query(`SELECT COUNT(*)::integer as total FROM student_movements`),
        ]);
        res.json({
            success: true,
            movements: result.rows,
            pagination: { limit, offset, total: countRes.rows[0]?.total || 0 },
        });
    } catch (err) {
        console.error('Error fetching movements:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

// Generic get raw active leaves (for attendance checking)
export const getActiveLeaves = async (req: Request, res: Response) => {
    try {
        const { student_ids } = req.query;
        const user = (req as any).user;
        const params: any[] = [];
        let query = `
            SELECT sl.*
            FROM student_current_presence scp
            JOIN student_leaves sl ON scp.active_leave_id = sl.id
            JOIN students s ON scp.student_id = s.adm_no
            WHERE scp.status IN ('outside', 'on-campus')
              AND s.status = 'active'
        `;
        if (student_ids && typeof student_ids === 'string') {
            const ids = student_ids.split(',');
            if (ids.length > 0) {
                const placeholders = ids.map((_, i) => `$${i+1}`).join(',');
                query += ` AND scp.student_id IN (${placeholders})`;
                params.push(...ids);
            }
        }
        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            const idx = params.length + 1;
            query += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
            params.push(staffId);
        }

        let result;
        try {
            result = await db.query(query, params);
        } catch (presenceErr: any) {
            if (presenceErr?.code !== '42P01') throw presenceErr;
            let fallbackQuery = `SELECT sl.* FROM student_leaves sl JOIN students s ON sl.student_id = s.adm_no WHERE sl.status = 'outside' AND s.status = 'active'`;
            const fallbackParams: any[] = [];
            if (student_ids && typeof student_ids === 'string') {
                const ids = student_ids.split(',');
                if (ids.length > 0) {
                    const placeholders = ids.map((_, i) => `$${i+1}`).join(',');
                    fallbackQuery += ` AND sl.student_id IN (${placeholders})`;
                    fallbackParams.push(...ids);
                }
            }
            if (MENTOR_ROLES.includes(user.role)) {
                const staffId = await getStaffId(req);
                const idx = fallbackParams.length + 1;
                fallbackQuery += ` AND (s.hifz_mentor_id = $${idx} OR s.school_mentor_id = $${idx} OR s.madrasa_mentor_id = $${idx})`;
                fallbackParams.push(staffId);
            }
            result = await db.query(fallbackQuery, fallbackParams);
        }
        res.json({ success: true, leaves: result.rows });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

/**
 * GET /leaves/outside
 * Returns all students currently outside campus with their leave details.
 * Any authenticated user can call this (mentors see all, not filtered).
 */
export const getOutsideStudents = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const canViewOutdoor = ADMIN_LEAVE_ROLES.includes(user.role);
        const params: any[] = [canViewOutdoor];
        let assignmentFilter = '';

        if (MENTOR_ROLES.includes(user.role)) {
            const staffId = await getStaffId(req);
            if (!staffId) {
                return res.status(403).json({ success: false, error: 'Staff profile not found' });
            }
            assignmentFilter = ` AND (s.hifz_mentor_id = $2 OR s.school_mentor_id = $2 OR s.madrasa_mentor_id = $2)`;
            params.push(staffId);
        }

        const cacheKey = makeCacheKey('leaves:outside-students', {
            role: user.role,
            staff: MENTOR_ROLES.includes(user.role) ? String(params[1] || '') : 'all',
            outdoor: String(canViewOutdoor),
        });

        const students = await cachedResult(cacheKey, 60_000, async () => {
            // Prefer the current-state helper table when it exists. Older
            // databases do not have it, so avoid throwing/catching 42P01 on
            // every cache miss.
            if (await hasStudentCurrentPresenceTable()) {
                const presenceQuery = `
            SELECT 
                sl.id as leave_id,
                scp.student_id,
                sl.leave_type,
                sl.reason_category,
                sl.remarks,
                sl.companion_name,
                sl.companion_relationship,
                sl.start_datetime,
                sl.end_datetime,
                sl.group_type,
                sl.group_value,
                sl.institutional_leave_id,
                il.name as institutional_leave_name,
                s.name as student_name,
                s.adm_no,
                COALESCE(s.standard, s.school_standard, s.hifz_standard, 'Common') as standard,
                s.photo_url,
                s.batch_year,
                hm.name as hifz_mentor_name,
                sm2.name as school_mentor_name,
                mm.name as madrasa_mentor_name,
                COALESCE(exit_mv.exit_timestamp, sl.start_datetime) as actual_exit_datetime,
                COALESCE(exit_mv.recorder_name, 'System') as exited_recorded_by_name
            FROM student_current_presence scp
            JOIN student_leaves sl ON scp.active_leave_id = sl.id
            JOIN students s ON scp.student_id = s.adm_no
            LEFT JOIN institutional_leaves il ON sl.institutional_leave_id = il.id
            LEFT JOIN staff hm ON s.hifz_mentor_id = hm.id
            LEFT JOIN staff sm2 ON s.school_mentor_id = sm2.id
            LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
            LEFT JOIN LATERAL (
                SELECT mv.timestamp as exit_timestamp, st.name as recorder_name
                FROM student_movements mv
                LEFT JOIN staff st ON mv.recorded_by = st.profile_id
                WHERE mv.leave_id = sl.id AND mv.direction = 'out'
                ORDER BY mv.timestamp DESC
                LIMIT 1
            ) exit_mv ON TRUE
            WHERE scp.status = 'outside'
              AND s.status = 'active'
              AND ($1::boolean OR sl.leave_type <> 'outdoor')
              ${assignmentFilter}
            ORDER BY sl.start_datetime DESC
        `;

                const presenceResult = await db.query(presenceQuery, params);
                return presenceResult.rows;
            }

            const fallbackResult = await db.query(`
                    SELECT 
                        sl.id as leave_id,
                        sl.student_id,
                        sl.leave_type,
                        sl.reason_category,
                        sl.remarks,
                        sl.companion_name,
                        sl.companion_relationship,
                        sl.start_datetime,
                        sl.end_datetime,
                        sl.group_type,
                        sl.group_value,
                        sl.institutional_leave_id,
                        il.name as institutional_leave_name,
                        s.name as student_name,
                        s.adm_no,
                        COALESCE(s.standard, s.school_standard, s.hifz_standard, 'Common') as standard,
                        s.photo_url,
                        s.batch_year,
                        hm.name as hifz_mentor_name,
                        sm2.name as school_mentor_name,
                        mm.name as madrasa_mentor_name,
                        COALESCE(exit_mv.exit_timestamp, sl.start_datetime) as actual_exit_datetime,
                        COALESCE(exit_mv.recorder_name, 'System') as exited_recorded_by_name
                    FROM student_leaves sl
                    JOIN students s ON sl.student_id = s.adm_no
                    LEFT JOIN institutional_leaves il ON sl.institutional_leave_id = il.id
                    LEFT JOIN staff hm ON s.hifz_mentor_id = hm.id
                    LEFT JOIN staff sm2 ON s.school_mentor_id = sm2.id
                    LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
                    LEFT JOIN LATERAL (
                        SELECT mv.timestamp as exit_timestamp, st.name as recorder_name
                        FROM student_movements mv
                        LEFT JOIN staff st ON mv.recorded_by = st.profile_id
                        WHERE mv.leave_id = sl.id AND mv.direction = 'out'
                        ORDER BY mv.timestamp DESC
                        LIMIT 1
                    ) exit_mv ON TRUE
                    WHERE sl.status = 'outside'
                      AND s.status = 'active'
                      AND ($1::boolean OR sl.leave_type <> 'outdoor')
                      ${assignmentFilter}
                    ORDER BY sl.start_datetime DESC
                `, params);
            return fallbackResult.rows;
        });

        res.json({ success: true, students });
    } catch (err) {
        console.error('Error fetching outside students:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

/**
 * GET /leaves
 * Returns all leaves for admin dashboard quick view.
 */
export const getAllLeaves = async (req: Request, res: Response) => {
    try {
        const { limit, offset } = parseLimitOffset(req.query, 100, 500);
        const search = String(req.query.search || '').trim();
        const cacheKey = makeCacheKey('leaves:all', { limit, offset, search });
        const payload = await cachedResult(cacheKey, 15_000, async () => {
            const params: any[] = [];
            let whereClause = '';
            if (search) {
                params.push(`%${search}%`);
                whereClause = `
                    WHERE s.name ILIKE $1
                       OR s.adm_no ILIKE $1
                       OR COALESCE(s.standard, s.school_standard, s.hifz_standard, '') ILIKE $1
                       OR COALESCE(sl.reason_category, '') ILIKE $1
                       OR COALESCE(sl.remarks, '') ILIKE $1
                       OR COALESCE(sl.leave_type, '') ILIKE $1
                       OR COALESCE(sl.status, '') ILIKE $1
                `;
            }
            const limitIdx = params.length + 1;
            const offsetIdx = params.length + 2;

            const [leavesRes, countRes] = await Promise.all([
                db.query(`
                    SELECT sl.*,
                           CASE
                             WHEN sl.status IN ('returned', 'completed')
                              AND sl.actual_return_datetime IS NOT NULL
                              AND sl.end_datetime IS NOT NULL
                               THEN CASE WHEN sl.actual_return_datetime > sl.end_datetime THEN 'late' ELSE 'normal' END
                             ELSE sl.return_status
                           END AS computed_return_status,
                           s.name as student_name,
                           COALESCE(s.standard, s.school_standard, s.hifz_standard) as school_standard,
                           s.adm_no as student_adm_no
                    FROM student_leaves sl
                    JOIN students s ON sl.student_id = s.adm_no
                    ${whereClause}
                    ORDER BY sl.created_at DESC
                    LIMIT $${limitIdx} OFFSET $${offsetIdx}
                `, [...params, limit, offset]),
                db.query(`
                    SELECT COUNT(*)::integer as total
                    FROM student_leaves sl
                    JOIN students s ON sl.student_id = s.adm_no
                    ${whereClause}
                `, params),
            ]);

            return {
                leaves: leavesRes.rows,
                pagination: {
                    limit,
                    offset,
                    total: countRes.rows[0]?.total || 0,
                },
            };
        });

        res.json({ success: true, ...payload });
    } catch (err) {
        console.error('Error fetching all leaves:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
