"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDisciplinaryRecord = exports.createDisciplinaryRecord = exports.getDisciplinaryRecords = exports.generateCalendarEntries = exports.bulkUpsertCalendarPolicies = exports.deleteCalendarPolicy = exports.upsertCalendarPolicy = exports.getAllCalendarPolicies = exports.deleteSession = exports.updateSession = exports.createSession = exports.upsertAttendance = exports.getAttendance = exports.getStudentsForAttendance = exports.getCalendarRange = exports.getCalendarByDate = exports.getAcademicSessions = void 0;
const db_1 = require("../config/db");
const getAcademicSessions = async (req, res) => {
    try {
        const { department } = req.query;
        let query = 'SELECT * FROM academic_sessions WHERE is_active = true';
        const params = [];
        if (department) {
            query += ' AND type = $1';
            params.push(department);
        }
        query += ' ORDER BY start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, sessions: result.rows });
    }
    catch (err) {
        console.error('Error fetching academic sessions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch academic sessions' });
    }
};
exports.getAcademicSessions = getAcademicSessions;
const getCalendarByDate = async (req, res) => {
    try {
        const { date } = req.params;
        const result = await db_1.db.query('SELECT * FROM academic_calendar WHERE date = $1', [date]);
        if (result.rows.length === 0) {
            return res.json({ success: true, calendar: null });
        }
        res.json({ success: true, calendar: result.rows[0] });
    }
    catch (err) {
        console.error('Error fetching calendar:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getCalendarByDate = getCalendarByDate;
const getCalendarRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date)
            return res.status(400).json({ success: false, error: 'Start and end dates required' });
        const result = await db_1.db.query('SELECT * FROM academic_calendar WHERE date >= $1 AND date <= $2', [start_date, end_date]);
        res.json({ success: true, calendars: result.rows });
    }
    catch (err) {
        console.error('Error fetching calendar range:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getCalendarRange = getCalendarRange;
const getStudentsForAttendance = async (req, res) => {
    let query = '';
    try {
        const { department, standard, allowed_standards } = req.body;
        // The frontend passes department name like 'Hifz' or 'School' or 'Madrassa'
        // standard column is like hifz_standard, school_standard, etc.
        if (!department || typeof department !== 'string') {
            return res.status(400).json({ success: false, error: 'Department is required' });
        }
        const standardColumn = `${department.toLowerCase()}_standard`;
        query = `
            SELECT s.adm_no, s.name, s.${standardColumn} as standard,
            EXISTS (SELECT 1 FROM student_leaves sl WHERE sl.student_id = s.adm_no AND sl.status = 'outside') as is_outside
            FROM students s 
            WHERE s.status = 'active' AND s.${standardColumn} IS NOT NULL
        `;
        const params = [];
        let paramCount = 1;
        if (standard && standard !== 'All') {
            query += ` AND ${standardColumn} = $${paramCount}`;
            params.push(standard);
            paramCount++;
        }
        else if (allowed_standards && Array.isArray(allowed_standards) && allowed_standards.length > 0) {
            const placeholders = allowed_standards.map((_, i) => `$${paramCount + i}`).join(',');
            query += ` AND ${standardColumn} IN (${placeholders})`;
            params.push(...allowed_standards);
        }
        query += ' ORDER BY name';
        console.log('QUERY IS:', query);
        console.log('PARAMS ARE:', params);
        const result = await db_1.db.query(query, params);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching students for attendance:', err);
        // Include `query` here but `query` is out of scope if declared inside `try`! Wait, `query` is declared inside `try` block so it is available in catch.
        res.status(500).json({ success: false, error: err.message, query });
    }
};
exports.getStudentsForAttendance = getStudentsForAttendance;
const getAttendance = async (req, res) => {
    try {
        const { date, start_date, end_date, session_id, class_event_id, department, student_ids } = req.query;
        let query = 'SELECT student_id, session_id, class_event_id, status, date, department FROM attendance WHERE 1=1';
        const params = [];
        let paramCount = 1;
        if (date) {
            query += ` AND date = $${paramCount}`;
            params.push(date);
            paramCount++;
        }
        else if (start_date && end_date) {
            query += ` AND date >= $${paramCount} AND date <= $${paramCount + 1}`;
            params.push(start_date, end_date);
            paramCount += 2;
        }
        else {
            return res.status(400).json({ success: false, error: 'Missing date or date range' });
        }
        if (session_id) {
            query += ` AND session_id = $${paramCount}`;
            params.push(session_id);
            paramCount++;
        }
        if (class_event_id) {
            query += ` AND class_event_id = $${paramCount}`;
            params.push(class_event_id);
            paramCount++;
        }
        if (department) {
            query += ` AND department = $${paramCount}`;
            params.push(department);
            paramCount++;
        }
        if (student_ids && typeof student_ids === 'string') {
            const ids = student_ids.split(',');
            if (ids.length > 0) {
                const placeholders = ids.map((_, i) => `$${paramCount + i}`).join(',');
                query += ` AND student_id IN (${placeholders})`;
                params.push(...ids);
                paramCount += ids.length;
            }
        }
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        console.error('Error fetching attendance:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getAttendance = getAttendance;
const upsertAttendance = async (req, res) => {
    try {
        const { attendanceData } = req.body;
        if (!attendanceData || !Array.isArray(attendanceData)) {
            return res.status(400).json({ success: false, error: 'Invalid attendance data array' });
        }
        if (attendanceData.length === 0) {
            return res.json({ success: true });
        }
        // Ensure the logged in user's ID is used for 'recorded_by' if not provided
        const user = req.user;
        const recorderId = user?.id; // The user.id from the JWT token
        const values = [];
        const placeholders = [];
        let paramCount = 1;
        for (let i = 0; i < attendanceData.length; i++) {
            const row = attendanceData[i];
            const student_id = row.student_id;
            const date = row.date;
            const session_id = row.session_id;
            const class_event_id = row.class_event_id || null;
            const status = row.status;
            const department = row.department;
            const recorded_by = row.recorded_by || recorderId;
            values.push(student_id, date, session_id, class_event_id, status, recorded_by, department);
            placeholders.push(`($${paramCount}, $${paramCount + 1}, $${paramCount + 2}, $${paramCount + 3}, $${paramCount + 4}, $${paramCount + 5}, $${paramCount + 6})`);
            paramCount += 7;
        }
        // Use class_event_id as the primary constraint if provided, else fallback to old method
        // But since we dropped the old constraint, we assume all new writes use class_event_id
        const query = `
            INSERT INTO attendance (student_id, date, session_id, class_event_id, status, recorded_by, department)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (student_id, date, session_id)
            DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, updated_at = NOW()
        `;
        await db_1.db.query(query, values);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error saving attendance:', err);
        res.status(500).json({ success: false, error: 'Failed to save attendance' });
    }
};
exports.upsertAttendance = upsertAttendance;
// ==================== SESSION CRUD ====================
const createSession = async (req, res) => {
    try {
        const { name, type, start_time, end_time, days_of_week, is_active, standards } = req.body;
        const result = await db_1.db.query(`INSERT INTO academic_sessions (name, type, start_time, end_time, days_of_week, is_active, standards)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [name, type, start_time || null, end_time || null, days_of_week || null, is_active !== false, standards || null]);
        res.json({ success: true, session: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating session:', err);
        res.status(500).json({ success: false, error: 'Failed to create session' });
    }
};
exports.createSession = createSession;
const updateSession = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, start_time, end_time, days_of_week, is_active, standards } = req.body;
        const result = await db_1.db.query(`UPDATE academic_sessions SET name=$1, type=$2, start_time=$3, end_time=$4, days_of_week=$5, is_active=$6, standards=$7
             WHERE id=$8 RETURNING *`, [name, type, start_time || null, end_time || null, days_of_week || null, is_active !== false, standards || null, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, session: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating session:', err);
        res.status(500).json({ success: false, error: 'Failed to update session' });
    }
};
exports.updateSession = updateSession;
const deleteSession = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('DELETE FROM academic_sessions WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting session:', err);
        res.status(500).json({ success: false, error: 'Failed to delete session' });
    }
};
exports.deleteSession = deleteSession;
// ==================== CALENDAR CRUD ====================
const getAllCalendarPolicies = async (req, res) => {
    try {
        const result = await db_1.db.query('SELECT * FROM academic_calendar ORDER BY date');
        res.json({ success: true, policies: result.rows });
    }
    catch (err) {
        console.error('Error fetching all calendar policies:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getAllCalendarPolicies = getAllCalendarPolicies;
const upsertCalendarPolicy = async (req, res) => {
    try {
        const p = req.body;
        const result = await db_1.db.query(`INSERT INTO academic_calendar (date, is_holiday, description, day_mode, effective_day_of_week,
             allowed_session_types, allowed_standards, session_overrides, cancelled_sessions, leave_standards,
             cancellation_reason_type, cancellation_reason_text)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (date) DO UPDATE SET
             is_holiday=EXCLUDED.is_holiday, description=EXCLUDED.description, day_mode=EXCLUDED.day_mode,
             effective_day_of_week=EXCLUDED.effective_day_of_week, allowed_session_types=EXCLUDED.allowed_session_types,
             allowed_standards=EXCLUDED.allowed_standards, session_overrides=EXCLUDED.session_overrides,
             cancelled_sessions=EXCLUDED.cancelled_sessions, leave_standards=EXCLUDED.leave_standards,
             cancellation_reason_type=EXCLUDED.cancellation_reason_type, cancellation_reason_text=EXCLUDED.cancellation_reason_text
             RETURNING *`, [p.date, p.is_holiday, p.description || null, p.day_mode || 'Normal', p.effective_day_of_week || null,
            p.allowed_session_types || null, p.allowed_standards || null,
            p.session_overrides ? JSON.stringify(p.session_overrides) : null,
            p.cancelled_sessions ? JSON.stringify(p.cancelled_sessions) : '{}',
            p.leave_standards || '[]',
            p.cancellation_reason_type || null, p.cancellation_reason_text || null]);
        res.json({ success: true, policy: result.rows[0] });
    }
    catch (err) {
        console.error('Error upserting calendar policy:', err);
        res.status(500).json({ success: false, error: 'Failed to save calendar policy' });
    }
};
exports.upsertCalendarPolicy = upsertCalendarPolicy;
const deleteCalendarPolicy = async (req, res) => {
    try {
        const { date } = req.params;
        await db_1.db.query('DELETE FROM academic_calendar WHERE date = $1', [date]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting calendar policy:', err);
        res.status(500).json({ success: false, error: 'Failed to delete calendar policy' });
    }
};
exports.deleteCalendarPolicy = deleteCalendarPolicy;
const bulkUpsertCalendarPolicies = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { entries } = req.body;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ success: false, error: 'entries array is required' });
        }
        await client.query('BEGIN');
        for (let i = 0; i < entries.length; i += 50) {
            const chunk = entries.slice(i, i + 50);
            for (const p of chunk) {
                await client.query(`INSERT INTO academic_calendar (date, is_holiday, description, day_mode, effective_day_of_week,
                     allowed_session_types, allowed_standards, session_overrides, cancelled_sessions, leave_standards,
                     cancellation_reason_type, cancellation_reason_text)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                     ON CONFLICT (date) DO UPDATE SET
                     is_holiday=EXCLUDED.is_holiday, description=EXCLUDED.description, day_mode=EXCLUDED.day_mode,
                     effective_day_of_week=EXCLUDED.effective_day_of_week, allowed_session_types=EXCLUDED.allowed_session_types,
                     allowed_standards=EXCLUDED.allowed_standards, session_overrides=EXCLUDED.session_overrides,
                     cancelled_sessions=EXCLUDED.cancelled_sessions, leave_standards=EXCLUDED.leave_standards,
                     cancellation_reason_type=EXCLUDED.cancellation_reason_type, cancellation_reason_text=EXCLUDED.cancellation_reason_text`, [p.date, p.is_holiday, p.description || null, p.day_mode || 'Normal', p.effective_day_of_week || null,
                    p.allowed_session_types || null, p.allowed_standards || null,
                    p.session_overrides ? JSON.stringify(p.session_overrides) : null,
                    p.cancelled_sessions ? JSON.stringify(p.cancelled_sessions) : '{}',
                    p.leave_standards || '[]',
                    p.cancellation_reason_type || null, p.cancellation_reason_text || null]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, count: entries.length });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error bulk upserting calendar policies:', err);
        res.status(500).json({ success: false, error: 'Failed to bulk upsert calendar policies' });
    }
    finally {
        client.release();
    }
};
exports.bulkUpsertCalendarPolicies = bulkUpsertCalendarPolicies;
const generateCalendarEntries = async (req, res) => {
    // This is the same as bulk upsert but only inserts where there's no existing entry
    const client = await db_1.db.getClient();
    try {
        const { entries } = req.body;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ success: false, error: 'entries array is required' });
        }
        await client.query('BEGIN');
        let inserted = 0;
        for (let i = 0; i < entries.length; i += 50) {
            const chunk = entries.slice(i, i + 50);
            for (const p of chunk) {
                const result = await client.query(`INSERT INTO academic_calendar (date, is_holiday, description, day_mode, effective_day_of_week,
                     allowed_session_types, allowed_standards, session_overrides, cancelled_sessions, leave_standards,
                     cancellation_reason_type, cancellation_reason_text)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                     ON CONFLICT (date) DO NOTHING`, [p.date, p.is_holiday, p.description || null, p.day_mode || 'Normal', p.effective_day_of_week || null,
                    p.allowed_session_types || null, p.allowed_standards || null,
                    p.session_overrides ? JSON.stringify(p.session_overrides) : null,
                    p.cancelled_sessions ? JSON.stringify(p.cancelled_sessions) : '{}',
                    p.leave_standards || '[]',
                    p.cancellation_reason_type || null, p.cancellation_reason_text || null]);
                inserted += (result.rowCount || 0);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, inserted });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error generating calendar entries:', err);
        res.status(500).json({ success: false, error: 'Failed to generate calendar entries' });
    }
    finally {
        client.release();
    }
};
exports.generateCalendarEntries = generateCalendarEntries;
// ==================== DISCIPLINARY RECORDS ====================
const getDisciplinaryRecords = async (req, res) => {
    try {
        const { student_id } = req.query;
        let query = 'SELECT * FROM disciplinary_records WHERE 1=1';
        const params = [];
        if (student_id) {
            query += ' AND student_id = $1';
            params.push(student_id);
        }
        query += ' ORDER BY action_date DESC';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, records: result.rows });
    }
    catch (err) {
        console.error('Error fetching disciplinary records:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getDisciplinaryRecords = getDisciplinaryRecords;
const createDisciplinaryRecord = async (req, res) => {
    try {
        const { student_id, title, description, severity, points, action_date, status } = req.body;
        const user = req.user;
        const result = await db_1.db.query(`INSERT INTO disciplinary_records (student_id, title, description, severity, points, action_date, status, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [student_id, title, description || null, severity || 'Low', points || 0, action_date, status || 'Pending', user?.id || null]);
        res.json({ success: true, record: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating disciplinary record:', err);
        res.status(500).json({ success: false, error: 'Failed to create disciplinary record' });
    }
};
exports.createDisciplinaryRecord = createDisciplinaryRecord;
const deleteDisciplinaryRecord = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('DELETE FROM disciplinary_records WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting disciplinary record:', err);
        res.status(500).json({ success: false, error: 'Failed to delete disciplinary record' });
    }
};
exports.deleteDisciplinaryRecord = deleteDisciplinaryRecord;
