"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBulkMonthlyReport = exports.calculateMonthlyReportData = exports.getProgressSummary = exports.upsertMonthlyReport = exports.getMonthlyReports = exports.deleteHifzLog = exports.bulkCreateHifzLogs = exports.updateHifzLog = exports.createHifzLog = exports.getMaxJuzForStudent = exports.getHifzLog = exports.getHifzLogsList = exports.getHifzStudents = void 0;
const db_1 = require("../config/db");
const hifz_calculator_1 = require("../utils/hifz-calculator");
const date_fns_1 = require("date-fns");
const getHifzStudents = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT 
                s.adm_no, 
                s.name, 
                s.standard,
                s.hifz_standard, 
                (SELECT surah_name FROM hifz_logs WHERE student_id = s.adm_no AND mode = 'New Verses' ORDER BY entry_date DESC LIMIT 1) as current_surah, 
                (SELECT juz_number FROM hifz_logs WHERE student_id = s.adm_no AND mode = 'Juz Revision' ORDER BY entry_date DESC LIMIT 1) as current_juz,
                st.name as usthad_name,
                st.phone as usthad_phone
             FROM students s
             LEFT JOIN staff st ON s.hifz_mentor_id = st.id
             WHERE s.status = $1 
             ORDER BY s.name`, ['active']);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching hifz students:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getHifzStudents = getHifzStudents;
const getHifzLogsList = async (req, res) => {
    try {
        const { date, session_type, start_date, end_date, student_id, mode, limit } = req.query;
        let query = `
            SELECT hl.*, st.name as recorded_by_name 
            FROM hifz_logs hl
            LEFT JOIN staff st ON hl.usthad_id = st.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;
        if (date) {
            query += ` AND entry_date = $${paramCount}`;
            params.push(date);
            paramCount++;
        }
        else if (start_date && end_date) {
            query += ` AND entry_date >= $${paramCount} AND entry_date <= $${paramCount + 1}`;
            params.push(start_date, end_date);
            paramCount += 2;
        }
        if (session_type && session_type !== 'all') {
            query += ` AND session_type = $${paramCount}`;
            params.push(session_type);
            paramCount++;
        }
        if (student_id) {
            query += ` AND student_id = $${paramCount}`;
            params.push(student_id);
            paramCount++;
        }
        if (mode) {
            query += ` AND mode = $${paramCount}`;
            params.push(mode);
            paramCount++;
        }
        query += ' ORDER BY entry_date DESC';
        if (limit) {
            query += ` LIMIT $${paramCount}`;
            params.push(parseInt(limit));
        }
        const result = await db_1.db.query(query, params);
        res.json({ success: true, logs: result.rows });
    }
    catch (err) {
        console.error('Error fetching hifz logs:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getHifzLogsList = getHifzLogsList;
const getHifzLog = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('SELECT * FROM hifz_logs WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Log not found' });
        res.json({ success: true, log: result.rows[0] });
    }
    catch (err) {
        console.error('Error fetching hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getHifzLog = getHifzLog;
const getMaxJuzForStudent = async (req, res) => {
    try {
        const { student_id } = req.params;
        const result = await db_1.db.query('SELECT juz_number FROM hifz_logs WHERE student_id = $1 ORDER BY juz_number DESC LIMIT 1', [student_id]);
        res.json({ success: true, max_juz: result.rows.length > 0 ? result.rows[0].juz_number : 0 });
    }
    catch (err) {
        console.error('Error fetching max juz:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMaxJuzForStudent = getMaxJuzForStudent;
const createHifzLog = async (req, res) => {
    try {
        const { student_id, usthad_id, entry_date, session_type, mode, surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db_1.db.query(`INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode,
             surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [student_id, usthad_id || null, entry_date, session_type, mode,
            surah_name || null, start_v || null, end_v || null, start_page || null,
            end_page || null, juz_number || null, juz_portion || null]);
        res.json({ success: true, log: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed to create hifz log' });
    }
};
exports.createHifzLog = createHifzLog;
const updateHifzLog = async (req, res) => {
    try {
        const { id } = req.params;
        const { student_id, usthad_id, entry_date, session_type, mode, surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db_1.db.query(`UPDATE hifz_logs SET student_id=$1, usthad_id=$2, entry_date=$3, session_type=$4, mode=$5,
             surah_name=$6, start_v=$7, end_v=$8, start_page=$9, end_page=$10,
             juz_number=$11, juz_portion=$12 WHERE id=$13 RETURNING *`, [student_id, usthad_id || null, entry_date, session_type, mode,
            surah_name || null, start_v || null, end_v || null, start_page || null,
            end_page || null, juz_number || null, juz_portion || null, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, log: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed to update hifz log' });
    }
};
exports.updateHifzLog = updateHifzLog;
const bulkCreateHifzLogs = async (req, res) => {
    try {
        const { logs } = req.body;
        if (!Array.isArray(logs) || logs.length === 0) {
            return res.status(400).json({ success: false, error: 'logs array is required' });
        }
        const inserted = [];
        for (const log of logs) {
            const result = await db_1.db.query(`INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode,
                 surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [log.student_id, log.usthad_id || null, log.entry_date, log.session_type, log.mode,
                log.surah_name || null, log.start_v || null, log.end_v || null, log.start_page || null,
                log.end_page || null, log.juz_number || null, log.juz_portion || null]);
            inserted.push(result.rows[0]);
        }
        res.json({ success: true, logs: inserted });
    }
    catch (err) {
        console.error('Error bulk creating hifz logs:', err);
        res.status(500).json({ success: false, error: 'Failed to bulk create hifz logs' });
    }
};
exports.bulkCreateHifzLogs = bulkCreateHifzLogs;
const deleteHifzLog = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('DELETE FROM hifz_logs WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.deleteHifzLog = deleteHifzLog;
const getMonthlyReports = async (req, res) => {
    try {
        const { report_month } = req.query;
        if (!report_month)
            return res.status(400).json({ success: false, error: 'report_month is required' });
        const result = await db_1.db.query('SELECT * FROM monthly_reports WHERE report_month = $1', [report_month]);
        res.json({ success: true, reports: result.rows });
    }
    catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMonthlyReports = getMonthlyReports;
const upsertMonthlyReport = async (req, res) => {
    try {
        const { student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance } = req.body;
        const query = `
            INSERT INTO monthly_reports (student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (student_id, report_month) 
            DO UPDATE SET 
                hifz_pages = EXCLUDED.hifz_pages,
                recent_pages = EXCLUDED.recent_pages,
                juz_revision = EXCLUDED.juz_revision,
                total_juz = EXCLUDED.total_juz,
                attendance = EXCLUDED.attendance,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        const params = [student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance];
        const result = await db_1.db.query(query, params);
        res.json({ success: true, report: result.rows[0] });
    }
    catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.upsertMonthlyReport = upsertMonthlyReport;
const getProgressSummary = async (req, res) => {
    try {
        const result = await db_1.db.query(`
            SELECT student_id, COUNT(DISTINCT split_part(juz_part, ' ', 2)) as progress 
            FROM hifz_logs 
            WHERE mode = 'Juz Revision' AND juz_part LIKE 'Juz %'
            GROUP BY student_id
        `);
        const progressMap = {};
        result.rows.forEach(row => {
            progressMap[row.student_id] = parseInt(row.progress, 10);
        });
        res.json({ success: true, progressMap });
    }
    catch (err) {
        console.error('Error fetching progress summary:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getProgressSummary = getProgressSummary;
const calculateMonthlyReportData = async (req, res) => {
    try {
        const { student_id, month } = req.query; // Expecting month in YYYY-MM
        if (!student_id || !month) {
            return res.status(400).json({ success: false, error: 'student_id and month are required' });
        }
        const date = new Date(month);
        const start = (0, date_fns_1.startOfMonth)(date).toISOString();
        const end = (0, date_fns_1.endOfMonth)(date).toISOString();
        // 1. Fetch attendance for totalClassDays
        const attendanceResult = await db_1.db.query(`SELECT date, status FROM attendance 
             WHERE student_id = $1 AND date >= $2 AND date <= $3 
             AND department = 'hifz'`, [student_id, start, end]);
        // 2. Fetch hifz logs for month
        const logsResult = await db_1.db.query(`SELECT mode, entry_date, surah_name, start_v, end_v, start_page, end_page, juz_portion 
             FROM hifz_logs 
             WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`, [student_id, start, end]);
        // 3. Run calculator
        const calculations = (0, hifz_calculator_1.calculateHifzReportPoints)(logsResult.rows, attendanceResult.rows);
        res.json({ success: true, ...calculations });
    }
    catch (err) {
        console.error('Error calculating monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.calculateMonthlyReportData = calculateMonthlyReportData;
const calculateBulkMonthlyReport = async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }
        const date = new Date(month);
        const startDate = (0, date_fns_1.format)((0, date_fns_1.startOfMonth)(date), 'yyyy-MM-dd');
        const endDate = (0, date_fns_1.format)((0, date_fns_1.endOfMonth)(date), 'yyyy-MM-dd');
        // 1. Get all active students that belong to Hifz (have hifz_standard or standard indicator)
        const studentsResult = await db_1.db.query(`SELECT s.adm_no, s.name, 
             COALESCE(s.hifz_standard, s.standard, 'Common') as standard,
             st.name as usthad_name, st.phone as usthad_phone
             FROM students s
             LEFT JOIN staff st ON s.hifz_mentor_id = st.id
             WHERE s.status = 'active'
             ORDER BY s.adm_no`);
        // 2. Fetch ALL hifz logs for the month
        const logsResult = await db_1.db.query(`SELECT student_id, mode, entry_date, surah_name, start_v, end_v, 
             start_page, end_page, juz_number, juz_portion
             FROM hifz_logs 
             WHERE entry_date >= $1::date AND entry_date <= $2::date`, [startDate, endDate]);
        // 3. Fetch ALL attendance for the month (Hifz department)
        const attendanceResult = await db_1.db.query(`SELECT student_id, date, status FROM attendance 
             WHERE date >= $1::date AND date <= $2::date AND department = 'Hifz'`, [startDate, endDate]);
        // 4. Check for manual reports
        const reportMonthDate = (0, date_fns_1.format)(date, 'yyyy-MM-01');
        const manualReportsResult = await db_1.db.query(`SELECT * FROM monthly_reports WHERE report_month = $1::date`, [reportMonthDate]);
        // Group data by student
        const logsByStudent = {};
        logsResult.rows.forEach((log) => {
            if (!logsByStudent[log.student_id])
                logsByStudent[log.student_id] = [];
            logsByStudent[log.student_id].push(log);
        });
        const attByStudent = {};
        attendanceResult.rows.forEach((att) => {
            if (!attByStudent[att.student_id])
                attByStudent[att.student_id] = [];
            attByStudent[att.student_id].push(att);
        });
        const manualByStudent = {};
        manualReportsResult.rows.forEach((r) => {
            manualByStudent[r.student_id] = r;
        });
        // 5. Calculate for each student
        const results = studentsResult.rows.map((student) => {
            const manualRecord = manualByStudent[student.adm_no];
            if (manualRecord) {
                return {
                    adm_no: student.adm_no,
                    name: student.name,
                    standard: student.standard,
                    usthad_name: student.usthad_name || 'Unassigned',
                    usthad_phone: student.usthad_phone || '',
                    hifz_pages: Number(manualRecord.hifz_pages),
                    recent_days: Number(manualRecord.recent_pages),
                    juz_revision: Number(manualRecord.juz_revision),
                    total_juz: Number(manualRecord.total_juz) || '-',
                    attendance: manualRecord.attendance || '-',
                    is_manual: true,
                    // Points from manual - not auto-calculated
                    newVersePoints: 0,
                    recentRevisionPoints: 0,
                    juzPoints: 0,
                    totalPoints: 0,
                    percentage: 0,
                    grade: manualRecord.grade || '-',
                    totalClassDays: 0
                };
            }
            const studentLogs = logsByStudent[student.adm_no] || [];
            const studentAtt = attByStudent[student.adm_no] || [];
            // Run the calculator
            const calc = (0, hifz_calculator_1.calculateHifzReportPoints)(studentLogs, studentAtt);
            // Also compute raw metrics for display
            let hifzPages = 0;
            let maxJuz = 0;
            studentLogs.forEach((log) => {
                if (log.mode === 'New Verses') {
                    const pages = (log.end_page && log.start_page) ? (log.end_page - log.start_page + 1) : 0;
                    hifzPages += pages > 0 ? pages : 0;
                    if (log.juz_number > maxJuz)
                        maxJuz = log.juz_number;
                }
            });
            const recentDates = new Set();
            studentLogs.filter((l) => l.mode === 'Recent Revision').forEach((log) => {
                try {
                    const d = new Date(log.entry_date);
                    if (!isNaN(d.getTime())) {
                        recentDates.add(d.toISOString().split('T')[0]);
                    }
                }
                catch (e) { }
            });
            let juzRevTotal = 0;
            studentLogs.filter((l) => l.mode === 'Juz Revision').forEach((log) => {
                const portion = log.juz_portion;
                if (portion === 'Full')
                    juzRevTotal += 1;
                else if (portion?.includes('Half'))
                    juzRevTotal += 0.5;
                else if (portion?.startsWith('Q'))
                    juzRevTotal += 0.25;
                else
                    juzRevTotal += 1;
            });
            const presentDays = studentAtt.filter((a) => a.status.toLowerCase() === 'present').length;
            const totalAttDays = studentAtt.length;
            return {
                adm_no: student.adm_no,
                name: student.name,
                standard: student.standard,
                usthad_name: student.usthad_name || 'Unassigned',
                usthad_phone: student.usthad_phone || '',
                hifz_pages: parseFloat(hifzPages.toFixed(1)),
                recent_days: recentDates.size,
                juz_revision: parseFloat(juzRevTotal.toFixed(2)),
                total_juz: maxJuz > 0 ? maxJuz : '-',
                attendance: totalAttDays > 0 ? `${presentDays}/${totalAttDays}` : '-',
                is_manual: false,
                // Calculated points
                ...calc
            };
        });
        res.json({ success: true, reports: results });
    }
    catch (err) {
        console.error('Error calculating bulk monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.calculateBulkMonthlyReport = calculateBulkMonthlyReport;
