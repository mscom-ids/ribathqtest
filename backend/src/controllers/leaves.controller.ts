import { Request, Response } from 'express';
import { db } from '../config/db';
import crypto from 'crypto';
import { getStaffId } from '../utils/staff.utils';

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

        if (user.role === 'staff') {
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

            // 3. Find target students
            let stuQuery = `SELECT adm_no, standard, school_standard, hifz_standard, madrassa_standard FROM students WHERE status = 'active'`;
            const stuParams: any[] = [];
            
            if (!is_entire_institution && target_classes && target_classes.length > 0) {
                const placeholders = target_classes.map((_: any, i: number) => `$${i + 1}`).join(',');
                // Check if any standard matches
                stuQuery += ` AND (standard IN (${placeholders}) OR school_standard IN (${placeholders}) OR hifz_standard IN (${placeholders}) OR madrassa_standard IN (${placeholders}))`;
                stuParams.push(...target_classes);
            }
            const studentsRes = await client.query(stuQuery, stuParams);
            let targetStudents = studentsRes.rows.map(s => s.adm_no);

            // Filter out exceptions (stay in campus)
            const exceptionSet = new Set(exceptions || []);
            targetStudents = targetStudents.filter(id => !exceptionSet.has(id));

            // 4. Bulk insert student_leaves (one round trip), capture returned ids,
            // then bulk insert student_movements paired with them. Was 2N round trips.
            if (targetStudents.length > 0) {
                const slBulk = await client.query(
                    `INSERT INTO student_leaves
                         (student_id, institutional_leave_id, leave_type, start_datetime, end_datetime, status)
                     SELECT sid, $2, 'institutional', $3, $4, 'outside'
                     FROM unnest($1::text[]) AS t(sid)
                     RETURNING id, student_id`,
                    [targetStudents, inst_id, start_datetime, end_datetime]
                );

                const movementStudentIds = slBulk.rows.map((r: any) => r.student_id);
                const movementLeaveIds   = slBulk.rows.map((r: any) => r.id);

                await client.query(
                    `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                     SELECT sid, lid, 'out', $1, $2
                     FROM unnest($3::text[], $4::uuid[]) AS t(sid, lid)`,
                    [start_datetime, user.id, movementStudentIds, movementLeaveIds]
                );
            }

            // 5. Cancel relevant class schedules for these dates
            // (For simplicity, if it's entire institution, we cancel all sessions on those dates)
            if (is_entire_institution) {
                // Find all schedules
                const schedulesRes = await client.query(`SELECT id, day_of_week FROM attendance_schedules`);
                // Insert into attendance_cancellations for each day between start and end
                // Note: accurate date calculation omitted here for brevity, assuming external chron block or manual via attendance dashboard for granular
            }

            await client.query('COMMIT');
            res.status(201).json({ success: true, count: targetStudents.length, institutional_leave_id: inst_id });
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

export const getInstitutionalLeaves = async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT il.*, 
            (SELECT COUNT(*) FROM student_leaves sl WHERE sl.institutional_leave_id = il.id) as total_students,
            (SELECT COUNT(*) FROM student_leaves sl WHERE sl.institutional_leave_id = il.id AND sl.status = 'returned') as returned_students
            FROM institutional_leaves il
            ORDER BY il.created_at DESC
        `;
        const result = await db.query(query);
        res.json({ success: true, leaves: result.rows });
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
        const { id } = req.params;

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

            // Delete main record
            await client.query('DELETE FROM institutional_leaves WHERE id = $1', [id]);

            await client.query('COMMIT');
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
        const { return_datetime, standard } = req.body;
        const user = (req as any).user;

        if (!return_datetime) return res.status(400).json({ success: false, error: "Return time required" });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let studentLeavesQuery = `
                SELECT sl.id, sl.student_id 
                FROM student_leaves sl
                JOIN students s ON sl.student_id = s.adm_no
                WHERE sl.institutional_leave_id = $1 AND sl.status = 'outside'
            `;
            const params: any[] = [id];

            if (standard && standard !== "All") {
                studentLeavesQuery += ` AND s.standard = $2`;
                params.push(standard);
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
                 SET status = 'returned', actual_return_datetime = $1, return_status = 'normal'
                 WHERE id = ANY($2::uuid[])`,
                [return_datetime, leaveIds]
            );

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                 SELECT sid, lid, 'in', $1, $2
                 FROM unnest($3::text[], $4::uuid[]) AS t(sid, lid)`,
                [return_datetime, user.id, studentIds, leaveIds]
            );

            await client.query('COMMIT');
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
        const query = `
            SELECT sl.id as leave_id, sl.student_id, sl.status, sl.return_status, sl.actual_return_datetime,
                   s.name, COALESCE(s.standard, s.school_standard, s.hifz_standard, 'Common') as standard, s.adm_no
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            WHERE sl.group_id = $1
            ORDER BY s.name
        `;
        const result = await db.query(query, [id]);
        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching group leave students:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};

export const bulkRecordGroupReturn = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { return_datetime, standard } = req.body;
        const user = (req as any).user;

        if (!return_datetime) return res.status(400).json({ success: false, error: "Return time required" });

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            let studentLeavesQuery = `
                SELECT sl.id, sl.student_id 
                FROM student_leaves sl
                JOIN students s ON sl.student_id = s.adm_no
                WHERE sl.group_id = $1 AND sl.status = 'outside'
            `;
            const params: any[] = [id];

            if (standard && standard !== "All") {
                studentLeavesQuery += ` AND s.standard = $2`;
                params.push(standard);
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
                 SET status = 'returned', actual_return_datetime = $1, return_status = 'normal'
                 WHERE id = ANY($2::uuid[])`,
                [return_datetime, leaveIds]
            );

            await client.query(
                `INSERT INTO student_movements (student_id, leave_id, direction, timestamp, recorded_by)
                 SELECT sid, lid, 'in', $1, $2
                 FROM unnest($3::text[], $4::uuid[]) AS t(sid, lid)`,
                [return_datetime, user.id, studentIds, leaveIds]
            );

            await client.query('COMMIT');
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

        if (leave_type === 'outdoor' && !['admin', 'principal', 'vice_principal', 'controller'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Outdoor movements can only be created by admin users' });
        }

        if (['out-campus', 'outdoor'].includes(leave_type) && (!companion_name?.trim() || !companion_relationship?.trim())) {
            return res.status(400).json({ success: false, error: 'Going with and relationship are required' });
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

        if (type === 'outdoor' && !['admin', 'principal', 'vice_principal', 'controller'].includes(user.role)) {
            return res.status(403).json({ success: false, error: 'Outdoor movements are admin-only' });
        }

        const query = `
            SELECT sl.*, s.name as student_name, COALESCE(s.standard, s.school_standard, s.hifz_standard) as school_standard, s.adm_no as student_adm_no
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            WHERE sl.leave_type = $1
            ORDER BY sl.created_at DESC
        `;
        const result = await db.query(query, [type]);
        
        const leavesMap = new Map();
        const groupedLeaves: any[] = [];

        for (const row of result.rows) {
            const { student_name, school_standard, student_adm_no, ...rest } = row;
            
            if (rest.group_id) {
                if (!leavesMap.has(rest.group_id)) {
                    // Create a master group leave entry
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
                    groupedLeaves.push(groupEntry);
                } else {
                    leavesMap.get(rest.group_id).count++;
                }
            } else {
                groupedLeaves.push({
                    ...rest,
                    is_group: false,
                    student: { name: student_name, standard: school_standard || '', adm_no: student_adm_no }
                });
            }
        }
        
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

            if (leave.leave_type === 'outdoor' && !['admin', 'principal', 'vice_principal', 'controller'].includes(user.role)) {
                await client.query('ROLLBACK');
                return res.status(403).json({ success: false, error: 'Outdoor movements can only be controlled by admin users' });
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
            LIMIT 500
        `;
        const result = await db.query(query);
        res.json({ success: true, movements: result.rows });
    } catch (err) {
        console.error('Error fetching movements:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

// Generic get raw active leaves (for attendance checking)
export const getActiveLeaves = async (req: Request, res: Response) => {
    try {
        const { student_ids } = req.query;
        let query = `SELECT * FROM student_leaves WHERE status = 'outside'`;
        const params: any[] = [];
        if (student_ids && typeof student_ids === 'string') {
            const ids = student_ids.split(',');
            if (ids.length > 0) {
                const placeholders = ids.map((_, i) => `$${i+1}`).join(',');
                query += ` AND student_id IN (${placeholders})`;
                params.push(...ids);
            }
        }
        const result = await db.query(query, params);
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
        const canViewOutdoor = ['admin', 'principal', 'vice_principal', 'controller'].includes(user.role);

        // Step 1: get all outside leaves with student + institutional leave info + mentor names
        const leavesRes = await db.query(`
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
                mm.name as madrasa_mentor_name
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            LEFT JOIN institutional_leaves il ON sl.institutional_leave_id = il.id
            LEFT JOIN staff hm ON s.hifz_mentor_id = hm.id
            LEFT JOIN staff sm2 ON s.school_mentor_id = sm2.id
            LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
            WHERE sl.status = 'outside'
              AND ($1::boolean OR sl.leave_type <> 'outdoor')
            ORDER BY sl.start_datetime DESC
        `, [canViewOutdoor]);

        if (leavesRes.rows.length === 0) {
            return res.json({ success: true, students: [] });
        }

        // Step 2: get the exit movements for those leave IDs to find who recorded exit
        const leaveIds = leavesRes.rows.map((r: any) => r.leave_id);
        const movementsRes = await db.query(`
            SELECT mv.leave_id, mv.timestamp as exit_timestamp, st.name as recorder_name
            FROM student_movements mv
            LEFT JOIN staff st ON mv.recorded_by = st.profile_id
            WHERE mv.leave_id = ANY($1) AND mv.direction = 'out'
            ORDER BY mv.timestamp DESC
        `, [leaveIds]);

        // Build a map: leave_id -> first 'out' movement info
        const exitMap: Record<string, { exit_timestamp: string; recorder_name: string }> = {};
        for (const row of movementsRes.rows) {
            if (!exitMap[row.leave_id]) {
                exitMap[row.leave_id] = {
                    exit_timestamp: row.exit_timestamp,
                    recorder_name: row.recorder_name || 'System'
                };
            }
        }

        // Step 3: merge
        const students = leavesRes.rows.map((row: any) => ({
            ...row,
            actual_exit_datetime: exitMap[row.leave_id]?.exit_timestamp || row.start_datetime,
            exited_recorded_by_name: exitMap[row.leave_id]?.recorder_name || 'System',
        }));

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
        const result = await db.query(`
            SELECT sl.*, s.name as student_name, COALESCE(s.standard, s.school_standard, s.hifz_standard) as school_standard, s.adm_no as student_adm_no
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            ORDER BY sl.created_at DESC
            LIMIT 1000
        `);
        res.json({ success: true, leaves: result.rows });
    } catch (err) {
        console.error('Error fetching all leaves:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
