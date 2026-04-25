"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyLeaves = exports.getMyStudentsWithStats = exports.createStaff = exports.updateStaffProfile = exports.getStaffById = exports.getAllStaff = exports.restoreStaff = exports.archiveStaff = exports.createStaffLogin = exports.cancelSession = exports.getMyAssignedStudents = exports.unassignStudentFromMentor = exports.assignStudentsToMentor = exports.getStaffStudents = exports.getMyStaffProfile = void 0;
const db_1 = require("../config/db");
const staff_utils_1 = require("../utils/staff.utils");
const supabase_1 = require("../config/supabase");
const getMyStaffProfile = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const staffId = await (0, staff_utils_1.getStaffId)(req);
        if (!staffId) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        const result = await db_1.db.query('SELECT * FROM staff WHERE id = $1 LIMIT 1', [staffId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        res.json({ success: true, staff: result.rows[0], acting_as: !!req.delegation });
    }
    catch (err) {
        console.error('Error fetching staff profile:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMyStaffProfile = getMyStaffProfile;
const getStaffStudents = async (req, res) => {
    try {
        const { id: staffId } = req.params;
        if (!staffId) {
            return res.status(400).json({ success: false, error: 'id required' });
        }
        const staffResult = await db_1.db.query('SELECT id, name, role FROM staff WHERE id = $1 LIMIT 1', [staffId]);
        if (staffResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff not found' });
        }
        const result = await db_1.db.query(`SELECT adm_no AS id, adm_no, name, photo_url, standard, batch_year,
                    (hifz_mentor_id = $1)    AS is_hifz,
                    (school_mentor_id = $1)  AS is_school,
                    (madrasa_mentor_id = $1) AS is_madrasa
             FROM students
             WHERE (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1)
               AND status = $2
             ORDER BY name`, [staffId, 'active']);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching assigned students:', err);
        res.status(500).json({
            success: false,
            error: err.message || 'Failed to fetch assigned students',
        });
    }
};
exports.getStaffStudents = getStaffStudents;
const assignStudentsToMentor = async (req, res) => {
    try {
        const { id } = req.params; // staff id
        const { student_ids, section } = req.body;
        if (!student_ids?.length || !section) {
            return res.status(400).json({ success: false, error: 'student_ids and section are required' });
        }
        const fieldMap = {
            hifz: 'hifz_mentor_id',
            school: 'school_mentor_id',
            madrasa: 'madrasa_mentor_id',
        };
        const field = fieldMap[section];
        if (!field)
            return res.status(400).json({ success: false, error: 'Invalid section' });
        await db_1.db.query(`UPDATE students SET ${field} = $1 WHERE adm_no = ANY($2::text[])`, [id, student_ids]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('assignStudentsToMentor error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to assign students' });
    }
};
exports.assignStudentsToMentor = assignStudentsToMentor;
const unassignStudentFromMentor = async (req, res) => {
    try {
        const { id } = req.params; // staff id
        const { student_id, section } = req.body;
        const fieldMap = {
            hifz: 'hifz_mentor_id',
            school: 'school_mentor_id',
            madrasa: 'madrasa_mentor_id',
        };
        const field = fieldMap[section];
        if (!field)
            return res.status(400).json({ success: false, error: 'Invalid section' });
        await db_1.db.query(`UPDATE students SET ${field} = NULL WHERE adm_no = $1 AND ${field} = $2`, [student_id, id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('unassignStudentFromMentor error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to unassign student' });
    }
};
exports.unassignStudentFromMentor = unassignStudentFromMentor;
const getMyAssignedStudents = async (req, res) => {
    try {
        const { staff_id } = req.query;
        if (!staff_id)
            return res.status(400).json({ success: false, error: 'staff_id required' });
        const result = await db_1.db.query('SELECT adm_no, name, photo_url, standard FROM students WHERE (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1) AND status = $2 ORDER BY name', [staff_id, 'active']);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching assigned students:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMyAssignedStudents = getMyAssignedStudents;
const cancelSession = async (req, res) => {
    try {
        const { date, session_id } = req.body;
        const existingResult = await db_1.db.query('SELECT cancelled_sessions FROM academic_calendar WHERE date = $1', [date]);
        if (existingResult.rows.length === 0) {
            const cancelled_sessions = { [session_id]: true };
            await db_1.db.query('INSERT INTO academic_calendar (date, is_holiday, cancelled_sessions) VALUES ($1, false, $2)', [date, cancelled_sessions]);
        }
        else {
            const currentCancelled = existingResult.rows[0].cancelled_sessions || {};
            currentCancelled[session_id] = true;
            await db_1.db.query('UPDATE academic_calendar SET cancelled_sessions = $1 WHERE date = $2', [currentCancelled, date]);
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error cancelling session:', err);
        res.status(500).json({ success: false, error: 'Failed to cancel session' });
    }
};
exports.cancelSession = cancelSession;
const createStaffLogin = async (req, res) => {
    try {
        const { id } = req.params; // Staff ID
        const { password } = req.body;
        const bcrypt = require('bcrypt'); // Lazy load
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            // 1. Get staff info
            const staffRes = await client.query('SELECT name, email, role, phone FROM staff WHERE id = $1', [id]);
            if (staffRes.rows.length === 0)
                throw new Error("Staff not found");
            // Update the staff record with the new password
            await client.query('UPDATE staff SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);
            await client.query('COMMIT');
            res.json({ success: true });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Create Login Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.createStaffLogin = createStaffLogin;
const archiveStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            // Unassign students across all specific mentor slots
            await client.query('UPDATE students SET hifz_mentor_id = NULL WHERE hifz_mentor_id = $1', [id]);
            await client.query('UPDATE students SET school_mentor_id = NULL WHERE school_mentor_id = $1', [id]);
            await client.query('UPDATE students SET madrasa_mentor_id = NULL WHERE madrasa_mentor_id = $1', [id]);
            // Archive staff
            await client.query('UPDATE staff SET is_active = false, profile_id = NULL WHERE id = $1', [id]);
            // We should ideally delete the user from `users` but we can leave it or set status=inactive.
            await client.query('COMMIT');
            res.json({ success: true });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.archiveStaff = archiveStaff;
const restoreStaff = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('UPDATE staff SET is_active = true WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.restoreStaff = restoreStaff;
const getAllStaff = async (req, res) => {
    try {
        const result = await db_1.db.query('SELECT * FROM staff ORDER BY name ASC');
        res.json({ success: true, staff: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch staff' });
    }
};
exports.getAllStaff = getAllStaff;
const getStaffById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('SELECT * FROM staff WHERE id = $1 LIMIT 1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff not found' });
        }
        const studentCount = await db_1.db.query(`SELECT COUNT(*) FROM students
             WHERE (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1)
               AND status = 'active'`, [id]);
        res.json({
            success: true,
            staff: result.rows[0],
            student_count: parseInt(studentCount.rows[0].count, 10),
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch staff member' });
    }
};
exports.getStaffById = getStaffById;
const updateStaffProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        delete updateData.id; // Safety
        const allowedFields = ['name', 'role', 'phone', 'email', 'photo_url', 'address', 'place', 'phone_contacts', 'staff_id'];
        const setClauses = [];
        const values = [];
        let paramCount = 1;
        for (const key of Object.keys(updateData)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramCount}`);
                let val = updateData[key];
                // pg driver needs JSON arrays to be stringified for JSONB columns
                if (key === 'phone_contacts' && Array.isArray(val)) {
                    val = JSON.stringify(val);
                }
                values.push(val);
                paramCount++;
            }
        }
        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }
        values.push(id);
        const result = await db_1.db.query(`UPDATE staff SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`, values);
        res.json({ success: true, staff: result.rows[0] });
    }
    catch (err) {
        console.error('Update Staff Error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to update' });
    }
};
exports.updateStaffProfile = updateStaffProfile;
const createStaff = async (req, res) => {
    try {
        const { name, email, role, phone, password, photo_url, address, place, phone_contacts, join_year, join_month, staff_id } = req.body;
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }
        const selectedRole = role || 'usthad';
        const finalEmail = email || `dummy-${Date.now()}@example.com`;
        let authUserId = null;
        // Create Supabase Auth user if password is provided
        if (password) {
            const { data: authData, error: authError } = await supabase_1.supabaseAdmin.auth.admin.createUser({
                email: finalEmail,
                password: password,
                email_confirm: true,
            });
            if (authError || !authData.user) {
                console.error("Supabase Auth Error:", authError);
                return res.status(400).json({ success: false, error: authError?.message || 'Failed to create auth user' });
            }
            authUserId = authData.user.id;
        }
        let finalStaffId = staff_id || null;
        if (selectedRole === 'usthad' || selectedRole === 'vice_principal') {
            const currentYear = new Date().getFullYear().toString();
            const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            const yearStr = join_year || currentYear;
            const monthStr = String(join_month || currentMonth).padStart(2, '0');
            // Count total mentors/VPs to get sequence number
            const countRes = await db_1.db.query("SELECT COUNT(*) FROM staff WHERE role IN ('usthad', 'vice_principal')");
            const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(2, '0');
            finalStaffId = `SR${seq}-${yearStr}-${monthStr}`;
        }
        // Optional: Wrap in a transaction
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            // 1. Insert into profiles if authUserId exists
            if (authUserId) {
                await client.query(`INSERT INTO profiles (id, role, full_name, updated_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT(id) DO NOTHING`, [authUserId, selectedRole, name.trim()]);
            }
            const columns = ['name', 'role', 'staff_id'];
            const values = [name.trim(), selectedRole, finalStaffId];
            let paramCount = 4;
            const optionalFields = {
                email: finalEmail,
                phone: phone || null,
                profile_id: authUserId, // Set profile_id instead of password_hash
                photo_url: photo_url || null,
                address: address || null,
                place: place || null,
                phone_contacts: phone_contacts || [],
            };
            for (const [col, val] of Object.entries(optionalFields)) {
                if (val !== null && val !== undefined) {
                    columns.push(col);
                    let insertVal = val;
                    // Stringify JSON array for pg driver
                    if (col === 'phone_contacts' && Array.isArray(insertVal)) {
                        insertVal = JSON.stringify(insertVal);
                    }
                    values.push(insertVal);
                    paramCount++;
                }
            }
            const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
            const staffInsert = await client.query(`INSERT INTO staff (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`, values);
            await client.query('COMMIT');
            res.json({ success: true, staffId: staffInsert.rows[0].id, staff: staffInsert.rows[0] });
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error("Failed to create staff:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.createStaff = createStaff;
const getMyStudentsWithStats = async (req, res) => {
    try {
        const user = req.user;
        // Get my staff record
        const ctx = await (0, staff_utils_1.getDelegationContext)(req);
        if (!ctx) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        const staffId = ctx.staffId;
        const actingStudentId = ctx.studentId;
        // Fetch assigned students
        let query = `
            SELECT adm_no, name, photo_url, batch_year, standard, dob,
            (SELECT name FROM staff WHERE id = hifz_mentor_id) as hifz_mentor_name,
            (SELECT name FROM staff WHERE id = school_mentor_id) as school_mentor_name,
            (SELECT name FROM staff WHERE id = madrasa_mentor_id) as madrasa_mentor_name
            FROM students 
            WHERE (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1) 
              AND status = 'active'
        `;
        const params = [staffId];
        if (actingStudentId) {
            query += ` AND adm_no = $2`;
            params.push(actingStudentId);
        }
        query += ` ORDER BY name`;
        const studentsResult = await db_1.db.query(query, params);
        const students = studentsResult.rows;
        if (students.length === 0) {
            return res.json({ success: true, students: [] });
        }
        const { date } = req.query;
        const todayDate = date || new Date().toISOString().split('T')[0];
        const studentIds = students.map((s) => s.adm_no);
        // Fire all 5 dependent queries in parallel — none depend on each other,
        // they only depend on studentIds + staffId + todayDate. Previously each
        // awaited the next, costing ~5 sequential round-trips per request.
        const [activeLeaveResult, logsResult, attResult, outgoingDelegationsRes, lastHifzResult] = await Promise.all([
            db_1.db.query(`SELECT student_id, leave_type, reason_category, remarks, end_datetime
                 FROM student_leaves
                 WHERE student_id = ANY($1) AND status = 'outside'
                   AND leave_type <> 'outdoor'
                 ORDER BY created_at DESC`, [studentIds]),
            db_1.db.query(`SELECT student_id, mode, start_page, end_page, juz_portion, entry_date
                 FROM hifz_logs WHERE student_id = ANY($1) AND entry_date = $2`, [studentIds, todayDate]),
            db_1.db.query(`SELECT student_id, schedule_id, status FROM student_attendance_marks WHERE student_id = ANY($1) AND date = $2`, [studentIds, todayDate]),
            db_1.db.query(`SELECT d.student_id, s.name as receiver_name
                 FROM mentor_delegations d
                 JOIN staff s ON d.to_staff_id = s.id
                 WHERE d.from_staff_id = $1 AND d.status = 'approved'`, [staffId]),
            db_1.db.query(`SELECT DISTINCT ON (student_id) student_id, surah_name, start_v, end_v, start_page, end_page, entry_date
                 FROM hifz_logs
                 WHERE student_id = ANY($1) AND mode = 'New Verses'
                 ORDER BY student_id, entry_date DESC, created_at DESC`, [studentIds]),
        ]);
        // Build a map: student_id -> leave info
        const activeLeaveMap = {};
        activeLeaveResult.rows.forEach((l) => {
            if (!activeLeaveMap[l.student_id]) {
                activeLeaveMap[l.student_id] = l;
            }
        });
        const logs = logsResult.rows;
        const attendance = attResult.rows;
        const outgoingDelegations = outgoingDelegationsRes.rows;
        const lastHifzMap = {};
        lastHifzResult.rows.forEach(r => {
            lastHifzMap[r.student_id] = r;
        });
        // Enrich students with today's stats
        const enriched = students.map((student) => {
            const delegation = outgoingDelegations.find(d => d.student_id === student.adm_no || d.student_id === null);
            const sLogs = logs.filter((l) => l.student_id === student.adm_no);
            const sAtts = attendance.filter((a) => a.student_id === student.adm_no);
            let globalAttStatus = 'Pending';
            if (sAtts.length > 0) {
                // If present in ANY session today, mark them as Present globally on dashboard
                if (sAtts.some((a) => a.status === 'Present')) {
                    globalAttStatus = 'Present';
                }
                else if (sAtts.every((a) => a.status === 'Absent')) {
                    globalAttStatus = 'Absent';
                }
                else {
                    globalAttStatus = sAtts[0].status; // Leave, Late, etc
                }
            }
            let hifzLines = 0, revLines = 0, juzCount = 0;
            sLogs.forEach((log) => {
                // Helper: count lines/verses from a log entry
                const verseCount = (log.start_v && log.end_v) ? (log.end_v - log.start_v + 1) : 0;
                const pageCount = (log.start_page && log.end_page) ? (log.end_page - log.start_page + 1) : 0;
                // Use page count if available, otherwise fall back to verse count
                const lineScore = pageCount > 0 ? pageCount : verseCount;
                if (log.mode === 'New Verses') {
                    hifzLines += lineScore || 0.5; // 0.5 only if no page/verse data at all
                }
                else if (log.mode === 'Recent Revision') {
                    revLines += lineScore;
                }
                else if (log.mode === 'Juz Revision' || log.mode === 'Juz Revision (Old)') {
                    if (log.juz_portion === 'Full')
                        juzCount += 1;
                    else if (log.juz_portion === '1st Half' || log.juz_portion === '2nd Half')
                        juzCount += 0.5;
                    else if (log.juz_portion?.startsWith('Q'))
                        juzCount += 0.25;
                    else
                        juzCount += 1;
                }
            });
            const hifzPages = hifzLines;
            const revPages = revLines;
            const activeLeaveMeta = activeLeaveMap[student.adm_no];
            return {
                ...student,
                assigned_usthad: student.hifz_mentor_name ? { name: student.hifz_mentor_name } : null,
                hifz_mentor: student.hifz_mentor_name ? { name: student.hifz_mentor_name } : null,
                school_mentor: student.school_mentor_name ? { name: student.school_mentor_name } : null,
                madrasa_mentor: student.madrasa_mentor_name ? { name: student.madrasa_mentor_name } : null,
                is_outside: !!activeLeaveMeta,
                is_delegated: !!delegation,
                delegated_to: delegation ? delegation.receiver_name : null,
                last_hifz: lastHifzMap[student.adm_no] || null,
                active_leave: activeLeaveMeta ? {
                    leave_type: activeLeaveMeta.leave_type,
                    reason: activeLeaveMeta.reason_category || activeLeaveMeta.remarks || 'On Leave',
                    end_datetime: activeLeaveMeta.end_datetime,
                } : null,
                today_stats: sLogs.length > 0 || sAtts.length > 0 ? {
                    hifz: parseFloat(hifzPages.toFixed(1)),
                    revision: revPages,
                    juz: parseFloat(juzCount.toFixed(1)),
                    attendance: globalAttStatus,
                    session_marks: sAtts.map((a) => ({ schedule_id: a.schedule_id, status: a.status }))
                } : undefined
            };
        });
        res.json({ success: true, students: enriched });
    }
    catch (err) {
        console.error('Error fetching my students with stats:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMyStudentsWithStats = getMyStudentsWithStats;
const getMyLeaves = async (req, res) => {
    try {
        const user = req.user;
        const staffResult = await db_1.db.query('SELECT id FROM staff WHERE email = $1 OR profile_id = $2 OR id = $2 LIMIT 1', [user.email, user.id]);
        if (staffResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        const staffId = staffResult.rows[0].id;
        // Run both queries in parallel:
        // 1. Out-campus/personal leaves only for this mentor's assigned students
        // 2. ALL on-campus/internal leaves (campus-wide visibility for mentors)
        const [assignedLeavesRes, oncampusLeavesRes] = await Promise.all([
            db_1.db.query(`SELECT sl.*, s.name as student_name, s.standard, s.adm_no
                 FROM student_leaves sl
                 JOIN students s ON sl.student_id = s.adm_no
                 WHERE (s.hifz_mentor_id = $1 OR s.school_mentor_id = $1 OR s.madrasa_mentor_id = $1)
                   AND sl.leave_type NOT IN ('on-campus', 'internal', 'outdoor')
                 ORDER BY sl.created_at DESC`, [staffId]),
            db_1.db.query(`SELECT sl.*, s.name as student_name, s.standard, s.adm_no
                 FROM student_leaves sl
                 JOIN students s ON sl.student_id = s.adm_no
                 WHERE sl.leave_type IN ('on-campus', 'internal')
                 ORDER BY sl.created_at DESC`, []),
        ]);
        const allRows = [...assignedLeavesRes.rows, ...oncampusLeavesRes.rows]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const leaves = allRows.map((row) => ({
            ...row,
            student: { name: row.student_name, standard: row.standard, adm_no: row.adm_no }
        }));
        res.json({ success: true, leaves });
    }
    catch (err) {
        console.error('Error fetching my leaves:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMyLeaves = getMyLeaves;
