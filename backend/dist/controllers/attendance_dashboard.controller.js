"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyAttendanceStats = exports.updateBreak = exports.getBreaks = exports.cancelSession = exports.markAttendance = exports.getStudentsForSchedule = exports.getMentorSchedules = exports.getDashboardData = exports.deleteSchedule = exports.createSchedule = exports.getSchedulesForDate = exports.getSchedules = void 0;
const db_1 = require("../config/db");
const staff_utils_1 = require("../utils/staff.utils");
const ROLE_LIMITS = {
    staff: 3, // 3 days for mentors
    usthad: 3, // same window for usthad role
    mentor: 3, // same window for mentor role
    admin: 30,
    principal: 30,
    vice_principal: 30,
    controller: 30
};
// All roles treated as a mentor (filtered access)
const MENTOR_ROLES = ['staff', 'usthad', 'mentor'];
// Helper: calculate next occurrence of a day_of_week from a given date
function getNextOccurrence(dayOfWeek, fromDate = new Date()) {
    const current = fromDate.getDay(); // 0=Sun, but our system: 1=Mon..6=Sat
    // Our system uses 1=Mon, 2=Tue...6=Sat, 0=Sun
    const todayDow = current; // JS getDay: 0=Sun,1=Mon...6=Sat
    let daysUntil = dayOfWeek - todayDow;
    if (daysUntil <= 0)
        daysUntil += 7; // Next week if today or past
    const next = new Date(fromDate);
    next.setDate(next.getDate() + daysUntil);
    return next.toISOString().split('T')[0];
}
function normalizeScheduleStandard(label) {
    const l = label.trim();
    if (l === 'Hifz Only')
        return 'Hifz';
    if (l === '+1 (Plus One)')
        return 'Plus One';
    if (l === '+2 (Plus Two)')
        return 'Plus Two';
    if (l.endsWith(' Standard'))
        return l.replace(' Standard', '');
    return l;
}
const getSchedules = async (req, res) => {
    try {
        const { academic_year_id, show_inactive } = req.query;
        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id`;
        const conditions = [];
        const params = [];
        let paramCount = 1;
        if (academic_year_id) {
            conditions.push(`(a.academic_year_id = $${paramCount} OR a.academic_year_id IS NULL)`);
            params.push(academic_year_id);
            paramCount++;
        }
        // By default only show active (non-deleted) schedules
        if (show_inactive !== 'true') {
            conditions.push(`(a.is_deleted = false OR a.is_deleted IS NULL)`);
        }
        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }
        query += ` ORDER BY day_of_week, start_time`;
        const result = await db_1.db.query(query, params);
        const schedules = result.rows;
        const user = req.user;
        if (user?.role === 'staff' || user?.role === 'usthad' || user?.role === 'mentor') {
            const mentorId = await (0, staff_utils_1.getStaffId)(req);
            if (!mentorId) {
                return res.json({ success: true, data: [] });
            }
            const mentorColMap = {
                hifz: 'hifz_mentor_id',
                school: 'school_mentor_id',
                madrasa: 'madrasa_mentor_id',
                madrassa: 'madrasa_mentor_id',
            };
            const filteredSchedules = [];
            for (const schedule of schedules) {
                const classType = (schedule.class_type || '').toLowerCase();
                const mentorCol = mentorColMap[classType];
                if (!mentorCol)
                    continue;
                const rawStandards = typeof schedule.standards === 'string'
                    ? JSON.parse(schedule.standards || '[]')
                    : (schedule.standards || []);
                const dbStandards = rawStandards.map(normalizeScheduleStandard);
                const countRes = await db_1.db.query(`SELECT COUNT(*) AS cnt
                     FROM students
                     WHERE status = 'active'
                       AND standard = ANY($1)
                       AND ${mentorCol} = $2`, [dbStandards, mentorId]);
                const studentCount = parseInt(countRes.rows[0]?.cnt || '0', 10);
                if (studentCount > 0) {
                    filteredSchedules.push({
                        ...schedule,
                        student_count: studentCount,
                    });
                }
            }
            return res.json({ success: true, data: filteredSchedules });
        }
        res.json({ success: true, data: schedules });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getSchedules = getSchedules;
// Returns schedules active on a specific date (used by mentor attendance page)
const getSchedulesForDate = async (req, res) => {
    try {
        const { date, academic_year_id } = req.query;
        if (!date)
            return res.status(400).json({ success: false, error: 'date is required (YYYY-MM-DD)' });
        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getDay(); // 0=Sun,1=Mon...6=Sat
        const user = req.user;
        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id
                     WHERE a.day_of_week = $1
                       AND (a.is_deleted = false OR a.is_deleted IS NULL)
                       AND a.effective_from <= $2
                       AND (a.effective_until IS NULL OR a.effective_until >= $2)`;
        const params = [dayOfWeek, date];
        let paramCount = 3;
        if (academic_year_id) {
            query += ` AND a.academic_year_id = $${paramCount}`;
            params.push(academic_year_id);
            paramCount++;
        }
        query += ` ORDER BY a.start_time`;
        const result = await db_1.db.query(query, params);
        // ── For mentor roles: filter to only schedules where they have students ──
        if (MENTOR_ROLES.includes(user?.role)) {
            const mentorId = await (0, staff_utils_1.getStaffId)(req);
            if (!mentorId)
                return res.json({ success: true, data: [] });
            const mentorColMap = {
                hifz: 'hifz_mentor_id',
                school: 'school_mentor_id',
                madrasa: 'madrasa_mentor_id',
                madrassa: 'madrasa_mentor_id',
            };
            const filteredSchedules = [];
            for (const schedule of result.rows) {
                const classType = (schedule.class_type || '').toLowerCase();
                const mentorCol = mentorColMap[classType];
                if (!mentorCol)
                    continue;
                const rawStds = typeof schedule.standards === 'string'
                    ? JSON.parse(schedule.standards || '[]')
                    : (schedule.standards || []);
                const dbStds = rawStds.map(normalizeScheduleStandard);
                const countRes = await db_1.db.query(`SELECT COUNT(*) AS cnt
                     FROM students
                     WHERE status = 'active'
                       AND standard = ANY($1)
                       AND ${mentorCol} = $2`, [dbStds, mentorId]);
                const studentCount = parseInt(countRes.rows[0]?.cnt || '0', 10);
                if (studentCount > 0) {
                    filteredSchedules.push({ ...schedule, student_count: studentCount });
                }
            }
            return res.json({ success: true, data: filteredSchedules });
        }
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getSchedulesForDate = getSchedulesForDate;
const createSchedule = async (req, res) => {
    try {
        const { class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from } = req.body;
        // Auto-calculate effective_from: next occurrence of the selected day
        const startDate = effective_from || getNextOccurrence(day_of_week);
        // Conflict Validator: only check against active (non-deleted) schedules
        const existingSchedules = await db_1.db.query(`SELECT * FROM attendance_schedules 
             WHERE day_of_week = $1 
               AND (is_deleted = false OR is_deleted IS NULL)
               AND (effective_until IS NULL OR effective_until >= $2)`, [day_of_week, startDate]);
        for (const existing of existingSchedules.rows) {
            if (start_time < existing.end_time && end_time > existing.start_time) {
                const extStds = typeof existing.standards === 'string' ? JSON.parse(existing.standards || '[]') : existing.standards;
                const reqStds = Array.isArray(standards) ? standards : [];
                const collision = reqStds.find((s) => extStds.includes(s));
                if (collision) {
                    return res.status(400).json({
                        success: false,
                        error: `Time Conflict: '${collision}' is already assigned to a ${existing.class_type} slot during this time.`
                    });
                }
            }
        }
        const result = await db_1.db.query(`INSERT INTO attendance_schedules (class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [class_type, name || null, JSON.stringify(standards), day_of_week, start_time, end_time, duration_mins, startDate]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.createSchedule = createSchedule;
const deleteSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const today = new Date().toISOString().split('T')[0];
        // Soft-delete: set effective_until to today and mark as deleted
        // This preserves all past attendance data
        await db_1.db.query(`UPDATE attendance_schedules 
             SET effective_until = $1, is_deleted = true 
             WHERE id = $2`, [today, id]);
        res.json({ success: true, message: 'Schedule deactivated. Past attendance data preserved.' });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteSchedule = deleteSchedule;
const getDashboardData = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date)
            return res.status(400).json({ success: false, error: "Dates required" });
        const user = req.user;
        const cancels = await db_1.db.query('SELECT * FROM attendance_cancellations WHERE date >= $1 AND date <= $2', [start_date, end_date]);
        let marksQuery;
        if (MENTOR_ROLES.includes(user?.role)) {
            // Mentors only see their own marks — so "Marked" status is per-mentor
            marksQuery = await db_1.db.query('SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2 AND marked_by = $3', [start_date, end_date, user.id]);
        }
        else {
            // Admin/Principal: see all marks (session shown as completed if anyone marked it)
            marksQuery = await db_1.db.query('SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2', [start_date, end_date]);
        }
        res.json({
            success: true,
            cancellations: cancels.rows,
            marks: marksQuery.rows
        });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getDashboardData = getDashboardData;
// Returns which schedule IDs are relevant for a given mentor
// by checking which standards their assigned students are in
const getMentorSchedules = async (req, res) => {
    try {
        let { mentor_id, academic_year_id } = req.query;
        const user = req.user;
        if (user.role === 'staff') {
            const resolvedId = await (0, staff_utils_1.getStaffId)(req);
            if (resolvedId)
                mentor_id = resolvedId;
        }
        if (!mentor_id)
            return res.status(400).json({ success: false, error: "mentor_id required" });
        // Get all distinct standards this mentor's students are in (across all 3 mentor types)
        const studentStds = await db_1.db.query(`SELECT DISTINCT standard FROM students
             WHERE status = 'active' AND standard IS NOT NULL
               AND (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1)`, [mentor_id]);
        const mentorStudentStds = studentStds.rows.map((r) => r.standard); // e.g. ["Plus One", "Plus Two"]
        if (mentorStudentStds.length === 0) {
            return res.json({ success: true, schedule_ids: [], mentor_standards: [] });
        }
        // Get all active (non-deleted) schedules for this academic year
        let schedQuery = 'SELECT id, standards, class_type FROM attendance_schedules WHERE (is_deleted = false OR is_deleted IS NULL)';
        const params = [];
        if (academic_year_id) {
            schedQuery += ' AND (academic_year_id = $1 OR academic_year_id IS NULL)';
            params.push(academic_year_id);
        }
        const allScheds = await db_1.db.query(schedQuery, params);
        // The normalization map (same as in getStudentsForSchedule)
        // For each schedule, check if any of its normalized standards overlap
        // with the mentor's students' standards AND the class_type matches
        // the mentor column that connects them
        const relevantIds = [];
        for (const sched of allScheds.rows) {
            const rawStds = typeof sched.standards === 'string'
                ? JSON.parse(sched.standards || '[]')
                : (sched.standards || []);
            const normalizedStds = rawStds.map(normalizeScheduleStandard);
            const classType = (sched.class_type || '').toLowerCase();
            // Map class_type to mentor column
            const mentorColMap = {
                hifz: 'hifz_mentor_id',
                school: 'school_mentor_id',
                madrasa: 'madrasa_mentor_id',
                madrassa: 'madrasa_mentor_id',
            };
            const mentorCol = mentorColMap[classType];
            if (!mentorCol)
                continue;
            // Check if this mentor actually has students in these standards for THIS class_type
            const checkRes = await db_1.db.query(`SELECT COUNT(*) as cnt FROM students
                 WHERE status = 'active'
                   AND standard = ANY($1)
                   AND ${mentorCol} = $2`, [normalizedStds, mentor_id]);
            if (parseInt(checkRes.rows[0].cnt) > 0) {
                relevantIds.push(sched.id);
            }
        }
        res.json({ success: true, schedule_ids: relevantIds, mentor_standards: mentorStudentStds });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.getMentorSchedules = getMentorSchedules;
const getStudentsForSchedule = async (req, res) => {
    try {
        let { schedule_id, date, mentor_id } = req.query;
        const user = req.user;
        // Resolve mentor_id for ALL mentor-type roles (not just 'staff')
        if (MENTOR_ROLES.includes(user?.role)) {
            const resolvedId = await (0, staff_utils_1.getStaffId)(req);
            if (resolvedId)
                mentor_id = resolvedId;
        }
        if (!schedule_id)
            return res.status(400).json({ success: false, error: "schedule_id required" });
        const schedRes = await db_1.db.query('SELECT standards, class_type FROM attendance_schedules WHERE id = $1', [schedule_id]);
        if (schedRes.rows.length === 0)
            return res.status(404).json({ success: false, error: "Schedule not found" });
        const rawStds = typeof schedRes.rows[0].standards === 'string'
            ? JSON.parse(schedRes.rows[0].standards || '[]')
            : (schedRes.rows[0].standards || []);
        const classType = (schedRes.rows[0].class_type || '').toLowerCase();
        // Normalize schedule pill-labels → actual student DB values
        const dbStds = rawStds.map(normalizeScheduleStandard);
        // Map class_type to the mentor_id column on the students table
        const mentorColMap = {
            hifz: 'hifz_mentor_id',
            school: 'school_mentor_id',
            madrasa: 'madrasa_mentor_id',
            madrassa: 'madrasa_mentor_id',
        };
        const mentorCol = mentorColMap[classType];
        let permanentStudents = [];
        let delegatedStudents = [];
        if (mentor_id && mentorCol) {
            // Fetch permanently assigned students
            const permRes = await db_1.db.query(`SELECT adm_no, name, standard, photo_url
                 FROM students
                 WHERE status = 'active'
                   AND standard = ANY($1)
                   AND ${mentorCol} = $2
                 ORDER BY standard, name`, [dbStds, mentor_id]);
            permanentStudents = permRes.rows.map((s) => ({ ...s, is_temp: false }));
            // Fetch delegated students (from mentors who delegated TO the current mentor)
            // mentor_delegations is a global mentor-level delegation (not per-student)
            // So: get all students belonging to any mentor who delegated to us
            try {
                const delRes = await db_1.db.query(`SELECT s.adm_no, s.name, s.standard, s.photo_url
                     FROM mentor_delegations d
                     JOIN students s ON s.${mentorCol} = d.from_staff_id
                     WHERE d.to_staff_id = $1
                       AND d.status = 'approved'
                       AND s.status = 'active'
                       AND s.standard = ANY($2)
                     ORDER BY s.name`, [mentor_id, dbStds]);
                // Only include students not already in permanent list
                const permIds = new Set(permanentStudents.map((s) => s.adm_no));
                delegatedStudents = delRes.rows
                    .filter((s) => !permIds.has(s.adm_no))
                    .map((s) => ({ ...s, is_temp: true }));
            }
            catch (delErr) {
                console.warn('Delegation query skipped:', delErr.message);
            }
        }
        else {
            // Admin/principal: return all students unfiltered
            const allRes = await db_1.db.query(`SELECT adm_no, name, standard, photo_url
                 FROM students
                 WHERE status = 'active' AND standard = ANY($1)
                 ORDER BY standard, name`, [dbStds]);
            permanentStudents = allRes.rows.map((s) => ({ ...s, is_temp: false }));
        }
        const students = [...permanentStudents, ...delegatedStudents];
        let studentsWithLeave = students;
        if (students.length > 0 && date) {
            try {
                const studentIds = students.map((s) => s.adm_no);
                // Check if any of these students are on leave for this specific date
                // Leave is active if: status='approved' AND date >= start_datetime AND date <= end_datetime
                const leavesRes = await db_1.db.query(`SELECT DISTINCT student_id FROM student_leaves
                     WHERE student_id = ANY($1)
                       AND (
                         -- Approved (not yet exited): check date range
                         (status = 'approved' AND start_datetime::date <= $2::date AND end_datetime::date >= $2::date)
                         OR
                         -- Outside (already exited, not yet returned): always mark as outside regardless of overdue
                         (status = 'outside')
                       )`, [studentIds, date]);
                const leaveStudentIds = new Set(leavesRes.rows.map((r) => r.student_id));
                studentsWithLeave = students.map((s) => ({
                    ...s,
                    is_on_leave: leaveStudentIds.has(s.adm_no),
                    attendance_status: leaveStudentIds.has(s.adm_no) ? 'outside' : 'pending'
                }));
            }
            catch (leaveErr) {
                console.warn('Leave check failed:', leaveErr.message);
            }
        }
        res.json({ success: true, students: studentsWithLeave });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.getStudentsForSchedule = getStudentsForSchedule;
const markAttendance = async (req, res) => {
    try {
        // Now handles a bulk payload of student_marks
        const { schedule_id, date, student_marks, on_behalf_of } = req.body;
        const userRole = req.user.role;
        const userId = req.user.id;
        // If an admin/principal is marking on behalf of a specific mentor,
        // store the mark under the mentor's ID so their portal shows it as "Marked"
        const ADMIN_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
        const effectiveMarkedBy = ADMIN_ROLES.includes(userRole) && on_behalf_of ? on_behalf_of : userId;
        const schedRes = await db_1.db.query('SELECT * FROM attendance_schedules WHERE id = $1', [schedule_id]);
        if (schedRes.rows.length === 0)
            return res.status(404).json({ success: false, error: "Schedule not found" });
        const schedule = schedRes.rows[0];
        // ── Security Guard: mentor roles may only mark their own students ──
        if (MENTOR_ROLES.includes(userRole) && student_marks?.length > 0) {
            const mentorId = await (0, staff_utils_1.getStaffId)(req);
            if (mentorId) {
                const classType = (schedule.class_type || '').toLowerCase();
                const mentorColMap = {
                    hifz: 'hifz_mentor_id',
                    school: 'school_mentor_id',
                    madrasa: 'madrasa_mentor_id',
                    madrassa: 'madrasa_mentor_id',
                };
                const mentorCol = mentorColMap[classType];
                const submittedIds = student_marks.map((m) => m.student_id);
                if (mentorCol) {
                    // Fetch permanently assigned students
                    const permRes = await db_1.db.query(`SELECT adm_no FROM students WHERE adm_no = ANY($1) AND ${mentorCol} = $2`, [submittedIds, mentorId]);
                    const permIds = new Set(permRes.rows.map((r) => r.adm_no));
                    // Fetch delegated students (from mentors who delegated TO the current mentor)
                    let delegatedIds = new Set();
                    try {
                        const delRes = await db_1.db.query(`SELECT s.adm_no FROM mentor_delegations d
                             JOIN students s ON s.${mentorCol} = d.from_staff_id
                             WHERE d.to_staff_id = $1
                               AND d.status = 'approved'
                               AND s.adm_no = ANY($2)`, [mentorId, submittedIds]);
                        delegatedIds = new Set(delRes.rows.map((r) => r.adm_no));
                    }
                    catch (delErr) {
                        console.warn('Delegation check skipped:', delErr.message);
                    }
                    const unauthorizedIds = submittedIds.filter((id) => !permIds.has(id) && !delegatedIds.has(id));
                    if (unauthorizedIds.length > 0) {
                        return res.status(403).json({
                            success: false,
                            error: `Access denied: Not assigned to student(s): ${unauthorizedIds.join(', ')}`
                        });
                    }
                }
            }
        }
        const cancelCheck = await db_1.db.query('SELECT id FROM attendance_cancellations WHERE schedule_id = $1 AND date = $2', [schedule_id, date]);
        if (cancelCheck.rows.length > 0)
            return res.status(400).json({ success: false, error: "Cannot mark attendance for cancelled sessions" });
        const classDateTimeStr = `${date}T${schedule.start_time}`;
        const classDateObj = new Date(classDateTimeStr);
        const now = new Date();
        if (now < classDateObj)
            return res.status(400).json({ success: false, error: "Cannot mark attendance before the class starts" });
        const diffTime = Math.abs(now.getTime() - classDateObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const maxDays = ROLE_LIMITS[userRole] || 3;
        if (diffDays > maxDays)
            return res.status(403).json({ success: false, error: `Time lock expired. You only have a ${maxDays}-day window.` });
        // Begin transaction for complete student bulk + staff marking + UI mark record
        await db_1.db.query('BEGIN');
        if (student_marks && Array.isArray(student_marks)) {
            for (const item of student_marks) {
                await db_1.db.query(`INSERT INTO student_attendance_marks (schedule_id, student_id, date, status, marked_by)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (schedule_id, student_id, date) DO UPDATE
                     SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`, [schedule_id, item.student_id, date, item.status, effectiveMarkedBy]);
            }
        }
        // Auto shadow-mark Mentor Staff record
        await db_1.db.query(`INSERT INTO staff_attendance (staff_id, date, status) 
             VALUES ($1, $2, 'present')
             ON CONFLICT (staff_id, date) DO UPDATE SET status = 'present'`, [userId, date]);
        // Record the Master Class Completion Marker — scoped per mentor
        const result = await db_1.db.query(`INSERT INTO attendance_marks (schedule_id, date, marked_by, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (schedule_id, date, marked_by) DO UPDATE SET updated_at = NOW() RETURNING *`, [schedule_id, date, effectiveMarkedBy]);
        await db_1.db.query('COMMIT');
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        await db_1.db.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.markAttendance = markAttendance;
const cancelSession = async (req, res) => {
    try {
        const { schedule_id, date, reason } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        if (!['admin', 'principal', 'vice_principal'].includes(userRole)) {
            return res.status(403).json({ success: false, error: "Only Authorities can cancel a class." });
        }
        const result = await db_1.db.query(`INSERT INTO attendance_cancellations (schedule_id, date, reason, cancelled_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (schedule_id, date) DO UPDATE SET reason = EXCLUDED.reason, cancelled_by = EXCLUDED.cancelled_by RETURNING *`, [schedule_id, date, reason, userId]);
        await db_1.db.query('DELETE FROM attendance_marks WHERE schedule_id = $1 AND date = $2', [schedule_id, date]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.cancelSession = cancelSession;
const getBreaks = async (req, res) => {
    try {
        const { academic_year_id } = req.query;
        let query = 'SELECT * FROM academic_breaks';
        const params = [];
        if (academic_year_id) {
            query += ' WHERE academic_year_id = $1';
            params.push(academic_year_id);
        }
        query += ' ORDER BY start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getBreaks = getBreaks;
const updateBreak = async (req, res) => {
    try {
        const { id } = req.params;
        const { start_time, end_time } = req.body;
        const result = await db_1.db.query('UPDATE academic_breaks SET start_time = $1, end_time = $2 WHERE id = $3 RETURNING *', [start_time, end_time, id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.updateBreak = updateBreak;
const getDailyAttendanceStats = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date)
            return res.status(400).json({ success: false, error: "start_date and end_date are required" });
        // Build stats for students
        const studentRes = await db_1.db.query(`SELECT status, count(*) as count 
             FROM student_attendance_marks 
             WHERE date >= $1 AND date <= $2 
             GROUP BY status`, [start_date, end_date]);
        const students = { present: 0, absent: 0, late: 0, total: 0 };
        studentRes.rows.forEach(r => {
            const st = r.status.toLowerCase();
            const cnt = parseInt(r.count, 10);
            if (st === 'present')
                students.present += cnt;
            else if (st === 'absent')
                students.absent += cnt;
            else if (st === 'late')
                students.late += cnt;
        });
        students.total = students.present + students.absent + students.late;
        // Build stats for mentors (staff attendance)
        const mentorRes = await db_1.db.query(`SELECT status, count(*) as count 
             FROM staff_attendance 
             WHERE date >= $1 AND date <= $2 
             GROUP BY status`, [start_date, end_date]);
        const mentors = { present: 0, absent: 0, late: 0, total: 0 };
        mentorRes.rows.forEach(r => {
            const st = r.status.toLowerCase();
            const cnt = parseInt(r.count, 10);
            if (st === 'present')
                mentors.present += cnt;
            else if (st === 'absent')
                mentors.absent += cnt;
            else if (st === 'late')
                mentors.late += cnt;
        });
        mentors.total = mentors.present + mentors.absent + mentors.late;
        res.json({ success: true, students, mentors });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getDailyAttendanceStats = getDailyAttendanceStats;
