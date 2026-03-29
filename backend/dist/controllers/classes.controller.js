"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManualClassEvent = exports.updateClassEventStatus = exports.generateDailyEvents = exports.getClassEvents = exports.deleteWeeklySchedule = exports.upsertWeeklySchedule = exports.getWeeklySchedule = exports.deleteEnrollment = exports.enrollStudent = exports.getEnrollments = exports.deleteClass = exports.upsertClass = exports.getClasses = exports.deleteAcademicYear = exports.upsertAcademicYear = exports.getAcademicYears = void 0;
const db_1 = require("../config/db");
// --- ACADEMIC YEARS ---
const getAcademicYears = async (req, res) => {
    try {
        const result = await db_1.db.query('SELECT * FROM academic_years ORDER BY start_date DESC');
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getAcademicYears = getAcademicYears;
const upsertAcademicYear = async (req, res) => {
    try {
        const { id, name, start_date, end_date, is_current, is_locked, promotion_window_open } = req.body;
        if (id) {
            const result = await db_1.db.query(`UPDATE academic_years SET name=$1, start_date=$2, end_date=$3, is_current=$4, is_locked=$5, promotion_window_open=$6 WHERE id=$7 RETURNING *`, [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false, id]);
            return res.json({ success: true, data: result.rows[0] });
        }
        else {
            const result = await db_1.db.query(`INSERT INTO academic_years (name, start_date, end_date, is_current, is_locked, promotion_window_open) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false]);
            return res.json({ success: true, data: result.rows[0] });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertAcademicYear = upsertAcademicYear;
const deleteAcademicYear = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM academic_years WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteAcademicYear = deleteAcademicYear;
// --- CLASSES ---
const getClasses = async (req, res) => {
    try {
        const { academic_year_id } = req.query;
        let query = 'SELECT * FROM classes WHERE 1=1';
        const params = [];
        if (academic_year_id) {
            query += ' AND academic_year_id = $1';
            params.push(academic_year_id);
        }
        query += ' ORDER BY type, name';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getClasses = getClasses;
const upsertClass = async (req, res) => {
    try {
        const { id, academic_year_id, name, type, standard } = req.body;
        if (id) {
            const result = await db_1.db.query(`UPDATE classes SET name=$1, type=$2, standard=$3 WHERE id=$4 RETURNING *`, [name, type, standard, id]);
            return res.json({ success: true, data: result.rows[0] });
        }
        else {
            const result = await db_1.db.query(`INSERT INTO classes (academic_year_id, name, type, standard) VALUES ($1,$2,$3,$4) RETURNING *`, [academic_year_id, name, type, standard]);
            return res.json({ success: true, data: result.rows[0] });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertClass = upsertClass;
const deleteClass = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteClass = deleteClass;
// --- ENROLLMENTS ---
const getEnrollments = async (req, res) => {
    try {
        const { class_id, academic_year_id } = req.query;
        let query = `
            SELECT e.*, s.name as student_name, s.photo_url 
            FROM enrollments e 
            JOIN students s ON e.student_id = s.adm_no 
            WHERE 1=1
        `;
        const params = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND e.class_id = $${params.length}`;
        }
        if (academic_year_id) {
            params.push(academic_year_id);
            query += ` AND e.academic_year_id = $${params.length}`;
        }
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getEnrollments = getEnrollments;
const enrollStudent = async (req, res) => {
    try {
        const { student_id, class_id, academic_year_id } = req.body;
        const result = await db_1.db.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) RETURNING *`, [student_id, class_id, academic_year_id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.enrollStudent = enrollStudent;
const deleteEnrollment = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM enrollments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteEnrollment = deleteEnrollment;
// --- WEEKLY SCHEDULE ---
const getWeeklySchedule = async (req, res) => {
    try {
        const { class_id } = req.query;
        let query = 'SELECT ws.*, c.name as class_name, c.type FROM weekly_schedule ws JOIN classes c ON ws.class_id = c.id WHERE 1=1';
        const params = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND ws.class_id = $${params.length}`;
        }
        query += ' ORDER BY ws.day_of_week, ws.start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getWeeklySchedule = getWeeklySchedule;
const upsertWeeklySchedule = async (req, res) => {
    try {
        const { id, class_id, day_of_week, start_time, end_time, teacher_id } = req.body;
        if (id) {
            const result = await db_1.db.query(`UPDATE weekly_schedule SET day_of_week=$1, start_time=$2, end_time=$3, teacher_id=$4 WHERE id=$5 RETURNING *`, [day_of_week, start_time, end_time, teacher_id || null, id]);
            return res.json({ success: true, data: result.rows[0] });
        }
        else {
            const result = await db_1.db.query(`INSERT INTO weekly_schedule (class_id, day_of_week, start_time, end_time, teacher_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [class_id, day_of_week, start_time, end_time, teacher_id || null]);
            return res.json({ success: true, data: result.rows[0] });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertWeeklySchedule = upsertWeeklySchedule;
const deleteWeeklySchedule = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM weekly_schedule WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteWeeklySchedule = deleteWeeklySchedule;
// --- CLASS EVENTS ---
const getClassEvents = async (req, res) => {
    try {
        const { date, start_date, end_date, class_id } = req.query;
        let query = 'SELECT ce.*, c.name as class_name, c.type FROM class_events ce JOIN classes c ON ce.class_id = c.id WHERE 1=1';
        const params = [];
        if (date) {
            params.push(date);
            query += ` AND ce.date = $${params.length}`;
        }
        else if (start_date && end_date) {
            params.push(start_date, end_date);
            query += ` AND ce.date >= $${params.length - 1} AND ce.date <= $${params.length}`;
        }
        if (class_id) {
            params.push(class_id);
            query += ` AND ce.class_id = $${params.length}`;
        }
        query += ' ORDER BY ce.date, ce.start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getClassEvents = getClassEvents;
const generateDailyEvents = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { date } = req.body; // YYYY-MM-DD
        if (!date)
            return res.status(400).json({ success: false, error: 'Date is required' });
        const dayOfWeek = new Date(date).getDay(); // 0 is Sunday
        await client.query('BEGIN');
        // Find all weekly schedules for this day of week that BELONG to the CURRENT academic year
        const query = `
            SELECT ws.* 
            FROM weekly_schedule ws
            JOIN classes c ON ws.class_id = c.id
            JOIN academic_years ay ON c.academic_year_id = ay.id
            WHERE ws.day_of_week = $1 AND ay.is_current = true
        `;
        const schedules = await client.query(query, [dayOfWeek]);
        let inserted = 0;
        // Insert events for each schedule item, ignoring conflicts
        for (const schedule of schedules.rows) {
            const insertQuery = `
                INSERT INTO class_events (class_id, date, start_time, end_time, teacher_id, source_type, status)
                VALUES ($1, $2, $3, $4, $5, 'weekly', 'scheduled')
                ON CONFLICT (class_id, date, start_time) DO NOTHING
            `;
            const result = await client.query(insertQuery, [
                schedule.class_id,
                date,
                schedule.start_time,
                schedule.end_time,
                schedule.teacher_id
            ]);
            inserted += (result.rowCount || 0);
        }
        await client.query('COMMIT');
        res.json({ success: true, inserted });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error generating daily events:', err);
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.generateDailyEvents = generateDailyEvents;
const updateClassEventStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        const result = await db_1.db.query('UPDATE class_events SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.updateClassEventStatus = updateClassEventStatus;
const createManualClassEvent = async (req, res) => {
    try {
        const { class_id, date, start_time, end_time, teacher_id } = req.body;
        const result = await db_1.db.query(`INSERT INTO class_events (class_id, date, start_time, end_time, teacher_id, source_type, status)
             VALUES ($1, $2, $3, $4, $5, 'manual', 'scheduled') RETURNING *`, [class_id, date, start_time, end_time, teacher_id || null]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.createManualClassEvent = createManualClassEvent;
