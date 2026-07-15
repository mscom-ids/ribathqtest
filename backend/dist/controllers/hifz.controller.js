"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBulkMonthlyReport = exports.calculateMonthlyReportData = exports.getProgressSummary = exports.upsertMonthlyReportSettings = exports.getMonthlyReportSettings = exports.upsertMonthlyReport = exports.getMonthlyReports = exports.deleteHifzLog = exports.bulkCreateHifzLogs = exports.updateHifzLog = exports.createHifzLog = exports.getMaxJuzForStudent = exports.getHifzLog = exports.getHifzLogsList = exports.getHifzStudents = void 0;
const db_1 = require("../config/db");
const hifz_calculator_1 = require("../utils/hifz-calculator");
const quran_juz_1 = require("../utils/quran-juz");
const server_cache_1 = require("../utils/server-cache");
const quran_data_1 = require("../utils/quran-data");
const attendance_report_1 = require("../utils/attendance-report");
const mentor_access_policy_1 = require("../utils/mentor-access-policy");
const academic_year_1 = require("../utils/academic-year");
const HIFZ_SUMMARY_TTL_MS = 5 * 60000;
const HIFZ_MONTHLY_TTL_MS = 10 * 60000;
const HIFZ_MONTHLY_POINT_DAY_VERSION = 3;
const normalizeClassDayCount = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const resolvePointClassDays = (automaticPointClassDays, effectiveAttendanceClasses, plannedAttendanceClasses, fallbackClassDays, overrideClassDays) => {
    const automatic = normalizeClassDayCount(automaticPointClassDays);
    if (automatic > 0)
        return automatic;
    const attendanceClasses = normalizeClassDayCount(effectiveAttendanceClasses);
    if (attendanceClasses > 0)
        return attendanceClasses;
    // If the timetable applied to this student but every slot was cancelled,
    // the correct denominator is zero, not a global/manual fallback.
    if (normalizeClassDayCount(plannedAttendanceClasses) > 0)
        return 0;
    const manualFallback = overrideClassDays === null ? 0 : normalizeClassDayCount(overrideClassDays);
    if (manualFallback > 0)
        return manualFallback;
    return normalizeClassDayCount(fallbackClassDays);
};
const enforceHifzRecordingAccess = async (req, entryDate) => {
    const role = String(req.user?.role || '').toLowerCase();
    if (!(0, mentor_access_policy_1.isMentorAccessRole)(role))
        return;
    const access = await (0, mentor_access_policy_1.getMentorAccessDecision)('hifz_recording', entryDate);
    if (!access.allowed) {
        const err = new Error(access.reason || 'Hifz recording is locked for this date.');
        err.statusCode = 403;
        err.accessPolicy = access;
        throw err;
    }
};
const getDetectedClassDays = async (startDate, endDate) => {
    const result = await db_1.db.query(`SELECT COUNT(DISTINCT date) AS class_days
         FROM attendance
         WHERE date >= $1::date
           AND date <= $2::date
           AND department = 'Hifz'
           AND COALESCE(LOWER(status), '') NOT IN ('cancelled', 'leave')`, [startDate, endDate]);
    return Number(result.rows[0]?.class_days || 0);
};
const getDetectedLogDays = async (startDate, endDate) => {
    const result = await db_1.db.query(`SELECT COUNT(DISTINCT entry_date::date) AS log_days
         FROM hifz_logs
         WHERE entry_date >= $1::date
           AND entry_date <= $2::date`, [startDate, endDate]);
    return Number(result.rows[0]?.log_days || 0);
};
const VALID_HIFZ_MODES = new Set(['New Verses', 'Recent Revision', 'Juz Revision', 'Juz Revision (New)', 'Juz Revision (Old)']);
const VALID_JUZ_PORTIONS = new Set(['Full', '1st Half', '2nd Half', 'Q1', 'Q2', 'Q3', 'Q4']);
function toNullableNumber(value) {
    if (value === '' || value === null || value === undefined)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}
function hifzValidationError(message) {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
}
function normalizeHifzLogInput(log, index = 0) {
    const label = `Log ${index + 1}`;
    const mode = String(log?.mode || '').trim();
    const studentId = String(log?.student_id || '').trim();
    const entryDate = String(log?.entry_date || '').slice(0, 10);
    const juzNumber = toNullableNumber(log?.juz_number);
    const startVerse = toNullableNumber(log?.start_v);
    const endVerse = toNullableNumber(log?.end_v);
    const startPage = toNullableNumber(log?.start_page);
    const endPage = toNullableNumber(log?.end_page);
    const juzPortion = log?.juz_portion ? String(log.juz_portion).trim() : null;
    if (!studentId)
        throw hifzValidationError(`${label}: student is required`);
    if (!entryDate)
        throw hifzValidationError(`${label}: entry date is required`);
    if (!VALID_HIFZ_MODES.has(mode))
        throw hifzValidationError(`${label}: invalid Hifz mode`);
    if (['New Verses', 'Recent Revision'].includes(mode)) {
        if (!log?.surah_name)
            throw hifzValidationError(`${label}: Surah is required`);
        if (!startVerse || Number.isNaN(startVerse))
            throw hifzValidationError(`${label}: start verse is required`);
        if (!endVerse || Number.isNaN(endVerse))
            throw hifzValidationError(`${label}: end verse is required`);
        if (startVerse > endVerse)
            throw hifzValidationError(`${label}: end verse must be after start verse`);
    }
    if (mode.startsWith('Juz Revision')) {
        if (!juzNumber || Number.isNaN(juzNumber) || juzNumber < 1 || juzNumber > 30) {
            throw hifzValidationError(`${label}: Juz number must be between 1 and 30`);
        }
        if (!juzPortion || !VALID_JUZ_PORTIONS.has(juzPortion)) {
            throw hifzValidationError(`${label}: valid Juz portion is required`);
        }
    }
    return {
        student_id: studentId,
        usthad_id: log?.usthad_id || null,
        entry_date: entryDate,
        mode,
        surah_name: log?.surah_name || null,
        start_v: Number.isNaN(startVerse) ? null : startVerse,
        end_v: Number.isNaN(endVerse) ? null : endVerse,
        start_page: Number.isNaN(startPage) ? null : startPage,
        end_page: Number.isNaN(endPage) ? null : endPage,
        juz_number: Number.isNaN(juzNumber) ? null : juzNumber,
        juz_portion: juzPortion,
    };
}
function hifzLogErrorMessage(err) {
    if (err?.statusCode)
        return err.message;
    if (err?.code === '23503') {
        if (err.constraint?.includes('student'))
            return 'Student not found for this Hifz log.';
        if (err.constraint?.includes('usthad'))
            return 'Selected Hifz mentor/staff was not found.';
        return 'Referenced Hifz log data was not found.';
    }
    if (err?.code === '23514') {
        if (err.constraint === 'hifz_logs_juz_number_check')
            return 'Juz number must be between 1 and 30.';
        if (err.constraint === 'hifz_logs_juz_portion_check')
            return 'Invalid Juz portion.';
        if (err.constraint === 'hifz_logs_mode_check')
            return 'Invalid Hifz log mode.';
    }
    return err?.message || 'Failed to save Hifz log';
}
const getMonthlyClassDaysSetting = async (reportMonth) => {
    const result = await db_1.db.query(`SELECT expected_class_days
         FROM hifz_monthly_report_settings
         WHERE report_month = $1::date
         LIMIT 1`, [reportMonth]);
    return result.rows[0]?.expected_class_days ?? null;
};
function formatIndiaDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
function getMonthlyReportPeriod(month) {
    const match = String(month).match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        throw new Error('month must be in YYYY-MM format');
    }
    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
        throw new Error('month must be in YYYY-MM format');
    }
    const monthKey = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const startDate = `${monthKey}-01`;
    const fullMonthEndDate = `${monthKey}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
    const reportMonth = `${monthKey}-01`;
    const todayDate = formatIndiaDate(new Date());
    const todayMonthKey = todayDate.slice(0, 7);
    let endDate = fullMonthEndDate;
    if (monthKey === todayMonthKey) {
        endDate = todayDate < fullMonthEndDate ? todayDate : fullMonthEndDate;
    }
    else if (monthKey > todayMonthKey) {
        endDate = formatIndiaDate(new Date(Date.UTC(year, monthNumber - 1, 0)));
    }
    return {
        startDate,
        endDate,
        fullMonthEndDate,
        reportMonth,
        isCurrentMonth: monthKey === todayMonthKey,
        isFutureMonth: monthKey > todayMonthKey,
    };
}
const getHifzStudents = async (req, res) => {
    try {
        // Replaced 2 correlated subqueries (re-running once per student row)
        // with LATERAL JOINs. PG can use the new (student_id, mode, entry_date)
        // index to fetch the latest matching log per student in one pass.
        const students = await (0, server_cache_1.cachedResult)('hifz:students', 5 * 60000, async () => {
            const result = await db_1.db.query(`SELECT
                        s.adm_no,
                        s.name,
                        s.standard,
                        s.hifz_standard,
                        nv.surah_name AS current_surah,
                        jr.juz_number AS current_juz,
                        st.name      AS usthad_name,
                        st.phone     AS usthad_phone
                     FROM students s
                     LEFT JOIN staff st ON s.hifz_mentor_id = st.id
                     LEFT JOIN LATERAL (
                         SELECT surah_name FROM hifz_logs
                         WHERE student_id = s.adm_no AND mode = 'New Verses'
                         ORDER BY entry_date DESC
                         LIMIT 1
                     ) nv ON TRUE
                     LEFT JOIN LATERAL (
                         SELECT juz_number FROM hifz_logs
                         WHERE student_id = s.adm_no AND mode = 'Juz Revision'
                         ORDER BY entry_date DESC
                         LIMIT 1
                     ) jr ON TRUE
                     WHERE s.status = $1
                     ORDER BY s.name`, ['active']);
            return result.rows;
        });
        res.json({ success: true, students });
    }
    catch (err) {
        console.error('Error fetching hifz students:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getHifzStudents = getHifzStudents;
const getHifzLogsList = async (req, res) => {
    try {
        const { date, start_date, end_date, student_id, mode, limit } = req.query;
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
        const log = normalizeHifzLogInput(req.body);
        await enforceHifzRecordingAccess(req, log.entry_date);
        const result = await db_1.db.query(`INSERT INTO hifz_logs (student_id, usthad_id, entry_date, mode,
             surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [
            log.student_id, log.usthad_id, log.entry_date, log.mode,
            log.surah_name, log.start_v, log.end_v, log.start_page,
            log.end_page, log.juz_number, log.juz_portion,
        ]);
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:students');
        res.json({ success: true, log: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating hifz log:', err);
        res.status(err.statusCode || 500).json({
            success: false,
            error: hifzLogErrorMessage(err),
            access_policy: err.accessPolicy,
        });
    }
};
exports.createHifzLog = createHifzLog;
const updateHifzLog = async (req, res) => {
    try {
        const { id } = req.params;
        const { student_id, usthad_id, entry_date, mode, surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        if (entry_date) {
            await enforceHifzRecordingAccess(req, entry_date);
        }
        const result = await db_1.db.query(`UPDATE hifz_logs SET student_id=$1, usthad_id=$2, entry_date=$3, mode=$4,
             surah_name=$5, start_v=$6, end_v=$7, start_page=$8, end_page=$9,
             juz_number=$10, juz_portion=$11 WHERE id=$12 RETURNING *`, [student_id, usthad_id || null, entry_date, mode,
            surah_name || null, start_v || null, end_v || null, start_page || null,
            end_page || null, juz_number || null, juz_portion || null, id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Not found' });
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:students');
        res.json({ success: true, log: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating hifz log:', err);
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.statusCode ? err.message : 'Failed to update hifz log',
            access_policy: err.accessPolicy,
        });
    }
};
exports.updateHifzLog = updateHifzLog;
const bulkCreateHifzLogs = async (req, res) => {
    try {
        const { logs: rawLogs } = req.body;
        if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
            return res.status(400).json({ success: false, error: 'logs array is required' });
        }
        const logs = rawLogs.map((log, index) => normalizeHifzLogInput(log, index));
        const uniqueEntryDates = [
            ...new Set(logs.map((log) => log.entry_date).filter(Boolean)),
        ];
        for (const entryDate of uniqueEntryDates) {
            await enforceHifzRecordingAccess(req, entryDate);
        }
        // ── Step 1: bulk-fetch existing verse-range rows that could collide
        // with any candidate, in a SINGLE query. Replaces the per-row SELECT
        // dedup that ran inside the original loop.
        const dedupCandidates = logs.filter((l) => ['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v);
        const dupKey = (l) => `${l.student_id}|${String(l.entry_date).slice(0, 10)}|${l.mode}|${l.surah_name}|${l.start_v}|${l.end_v}`;
        const existingKeys = new Set();
        if (dedupCandidates.length > 0) {
            const studentIds = [...new Set(dedupCandidates.map((l) => l.student_id))];
            const dates = [...new Set(dedupCandidates.map((l) => String(l.entry_date).slice(0, 10)))];
            const existing = await db_1.db.query(`SELECT student_id,
                        to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                        mode, surah_name, start_v, end_v
                 FROM hifz_logs
                 WHERE mode = ANY($3::text[])
                   AND student_id = ANY($1::text[])
                   AND entry_date = ANY($2::date[])`, [studentIds, dates, ['New Verses', 'Recent Revision']]);
            existing.rows.forEach((r) => existingKeys.add(dupKey(r)));
        }
        // Filter out duplicates (only applies to qualifying verse-range rows)
        const toInsert = logs.filter((l) => {
            if (['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v) {
                return !existingKeys.has(dupKey(l));
            }
            return true;
        });
        if (toInsert.length === 0) {
            return res.json({ success: true, logs: [] });
        }
        // ── Step 2: ONE multi-row INSERT for the survivors.
        const placeholders = [];
        const values = [];
        let i = 1;
        for (const log of toInsert) {
            placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
            values.push(log.student_id, log.usthad_id || null, log.entry_date, log.mode, log.surah_name || null, log.start_v || null, log.end_v || null, log.start_page || null, log.end_page || null, log.juz_number || null, log.juz_portion || null);
        }
        const result = await db_1.db.query(`INSERT INTO hifz_logs (student_id, usthad_id, entry_date, mode,
                                    surah_name, start_v, end_v, start_page, end_page,
                                    juz_number, juz_portion)
             VALUES ${placeholders.join(',')}
             RETURNING *`, values);
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:students');
        res.json({ success: true, logs: result.rows });
    }
    catch (err) {
        console.error('Error bulk creating hifz logs:', err);
        res.status(err.statusCode || 500).json({
            success: false,
            error: hifzLogErrorMessage(err),
            access_policy: err.accessPolicy,
        });
    }
};
exports.bulkCreateHifzLogs = bulkCreateHifzLogs;
const deleteHifzLog = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await db_1.db.query('SELECT entry_date FROM hifz_logs WHERE id = $1', [id]);
        if (existing.rows[0]?.entry_date) {
            await enforceHifzRecordingAccess(req, existing.rows[0].entry_date);
        }
        await db_1.db.query('DELETE FROM hifz_logs WHERE id = $1', [id]);
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:students');
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting hifz log:', err);
        res.status(err.statusCode || 500).json({
            success: false,
            error: err.statusCode ? err.message : 'Failed',
            access_policy: err.accessPolicy,
        });
    }
};
exports.deleteHifzLog = deleteHifzLog;
const getMonthlyReports = async (req, res) => {
    try {
        const { report_month } = req.query;
        if (!report_month)
            return res.status(400).json({ success: false, error: 'report_month is required' });
        const reports = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('hifz:monthly-reports', { report_month }), HIFZ_MONTHLY_TTL_MS, async () => {
            const result = await db_1.db.query('SELECT * FROM monthly_reports WHERE report_month = $1', [report_month]);
            return result.rows;
        });
        res.json({ success: true, reports });
    }
    catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMonthlyReports = getMonthlyReports;
const upsertMonthlyReport = async (req, res) => {
    try {
        const { student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade } = req.body;
        const query = `
            INSERT INTO monthly_reports (student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (student_id, report_month) 
            DO UPDATE SET 
                hifz_pages = EXCLUDED.hifz_pages,
                recent_pages = EXCLUDED.recent_pages,
                juz_revision = EXCLUDED.juz_revision,
                total_juz = EXCLUDED.total_juz,
                attendance = EXCLUDED.attendance,
                grade = EXCLUDED.grade,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        const params = [student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade || null];
        const result = await db_1.db.query(query, params);
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:monthly');
        res.json({ success: true, report: result.rows[0] });
    }
    catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.upsertMonthlyReport = upsertMonthlyReport;
const getMonthlyReportSettings = async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }
        const { startDate, endDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month);
        const [detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
            getDetectedClassDays(startDate, endDate),
            getDetectedLogDays(startDate, endDate),
            getMonthlyClassDaysSetting(reportMonth),
        ]);
        const effectiveClassDays = overrideClassDays ?? (detectedClassDays > 0 ? detectedClassDays : detectedLogDays);
        res.json({
            success: true,
            class_days: effectiveClassDays,
            detected_class_days: detectedClassDays,
            detected_log_days: detectedLogDays,
            override_class_days: overrideClassDays,
            using_fallback_log_days: overrideClassDays === null && detectedClassDays === 0 && detectedLogDays > 0,
            report_month: reportMonth,
            report_start_date: startDate,
            report_end_date: endDate,
            is_current_month: isCurrentMonth,
        });
    }
    catch (err) {
        console.error('Error fetching monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getMonthlyReportSettings = getMonthlyReportSettings;
const upsertMonthlyReportSettings = async (req, res) => {
    try {
        const { report_month, expected_class_days } = req.body;
        if (!report_month) {
            return res.status(400).json({ success: false, error: 'report_month is required' });
        }
        const normalizedExpectedClassDays = expected_class_days === null || expected_class_days === undefined || expected_class_days === ''
            ? null
            : Number(expected_class_days);
        if (normalizedExpectedClassDays !== null && (!Number.isFinite(normalizedExpectedClassDays) || normalizedExpectedClassDays < 0)) {
            return res.status(400).json({ success: false, error: 'expected_class_days must be 0 or more' });
        }
        const result = await db_1.db.query(`INSERT INTO hifz_monthly_report_settings (report_month, expected_class_days, updated_at)
             VALUES ($1::date, $2, NOW())
             ON CONFLICT (report_month)
             DO UPDATE SET
                expected_class_days = EXCLUDED.expected_class_days,
                updated_at = EXCLUDED.updated_at
             RETURNING *`, [report_month, normalizedExpectedClassDays]);
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:monthly');
        res.json({ success: true, settings: result.rows[0] });
    }
    catch (err) {
        console.error('Error upserting monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertMonthlyReportSettings = upsertMonthlyReportSettings;
const getProgressSummary = async (req, res) => {
    try {
        // Optional ?student_id= scope. Without it we still scan all logs
        // (kept for the admin dashboard); WITH it we only read that one
        // student — used by the daily-entry form so it doesn't pay for
        // the institution-wide scan on every open.
        const { student_id } = req.query;
        const progressMap = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('hifz:progress-summary', { student_id: student_id || 'all' }), HIFZ_SUMMARY_TTL_MS, async () => {
            const params = [];
            let where = `WHERE hl.mode = 'New Verses'
                               AND hl.surah_name IS NOT NULL
                               AND hl.start_v IS NOT NULL
                               AND hl.end_v IS NOT NULL`;
            if (student_id) {
                params.push(student_id);
                where += ` AND hl.student_id = $1`;
            }
            else {
                where += ` AND s.status = 'active'`;
            }
            const result = await db_1.db.query(`SELECT hl.student_id, hl.surah_name, hl.start_v, hl.end_v
                     FROM hifz_logs hl
                     JOIN students s ON hl.student_id = s.adm_no
                     ${where}`, params);
            const byStudent = {};
            for (const row of result.rows) {
                if (!byStudent[row.student_id])
                    byStudent[row.student_id] = [];
                byStudent[row.student_id].push(row);
            }
            const nextProgressMap = {};
            for (const [studentId, logs] of Object.entries(byStudent)) {
                nextProgressMap[studentId] = (0, quran_juz_1.countCompletedJuz)(logs);
            }
            return nextProgressMap;
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
        const { startDate, endDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month);
        const academicContext = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
        const [studentResult, logsResult] = await Promise.all([
            db_1.db.query(`SELECT s.adm_no,
                        COALESCE(sys.school_standard, s.standard) AS attendance_standard,
                        COALESCE(sys.school_standard, s.hifz_standard, s.standard, 'Common') AS standard
                 FROM students s
                 LEFT JOIN student_year_snapshots sys
                   ON sys.student_id = s.adm_no
                  AND sys.academic_year_id = $2
                 WHERE s.adm_no = $1`, [student_id, academicContext.academicYearId]),
            db_1.db.query(`SELECT mode, entry_date, surah_name, start_v, end_v, start_page, end_page, juz_portion 
                 FROM hifz_logs 
                 WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`, [student_id, startDate, endDate]),
        ]);
        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const [attendanceSummaries, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
            (0, attendance_report_1.getStudentAttendanceSummaries)(db_1.db, studentResult.rows, startDate, endDate, 'hifz', academicContext.academicYearId),
            getDetectedClassDays(startDate, endDate),
            getDetectedLogDays(startDate, endDate),
            getMonthlyClassDaysSetting(reportMonth),
        ]);
        const attendanceSummary = attendanceSummaries.get(student_id);
        const scheduledClassDays = attendanceSummary?.plannedClasses || 0;
        const cancelledClassDays = attendanceSummary?.cancelledClasses || 0;
        const countedClassDays = attendanceSummary?.effectiveClasses || 0;
        const automaticPointClassDays = attendanceSummary?.pointClassDays || 0;
        const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
        const effectiveClassDays = resolvePointClassDays(automaticPointClassDays, countedClassDays, scheduledClassDays, fallbackClassDays, overrideClassDays);
        const calculations = (0, hifz_calculator_1.calculateHifzReportPoints)(logsResult.rows, [], {
            expectedClassDaysOverride: effectiveClassDays,
        });
        res.json({
            success: true,
            class_days: effectiveClassDays,
            scheduled_class_days: scheduledClassDays,
            cancelled_class_days: cancelledClassDays,
            point_class_days: automaticPointClassDays,
            attended_classes: attendanceSummary?.attendedClasses || 0,
            not_attended_classes: attendanceSummary?.notAttendedClasses || 0,
            attendance_summary: attendanceSummary?.attendanceLabel || '-',
            detected_class_days: detectedClassDays,
            detected_log_days: detectedLogDays,
            override_class_days: overrideClassDays,
            using_fallback_log_days: automaticPointClassDays === 0 && countedClassDays === 0 && detectedClassDays === 0 && detectedLogDays > 0,
            report_start_date: startDate,
            report_end_date: endDate,
            is_current_month: isCurrentMonth,
            ...calculations
        });
    }
    catch (err) {
        console.error('Error calculating monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.calculateMonthlyReportData = calculateMonthlyReportData;
const calculateBulkMonthlyReport = async (req, res) => {
    try {
        const { month, mentor_id } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }
        const period = getMonthlyReportPeriod(month);
        const academicContext = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
        const results = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('hifz:monthly-calculate', { month, mentor_id: mentor_id || 'all', academic_year_id: academicContext.academicYearId || 'legacy', report_end_date: period.endDate, point_day_version: HIFZ_MONTHLY_POINT_DAY_VERSION }), HIFZ_MONTHLY_TTL_MS, async () => {
            const { startDate, endDate, reportMonth, isCurrentMonth } = period;
            const mentorFilterClause = mentor_id
                ? ` AND COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id) = $2`
                : '';
            const studentQueryParams = mentor_id
                ? [academicContext.academicYearId, mentor_id]
                : [academicContext.academicYearId];
            const [studentsResult, logsResult, manualReportsResult, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
                db_1.db.query(`SELECT s.adm_no, s.name,
                         COALESCE(sys.school_standard, s.standard) AS attendance_standard,
                         COALESCE(sys.school_standard, s.hifz_standard, s.standard, 'Common') AS standard,
                         st.name as usthad_name, st.phone as usthad_phone
                         FROM students s
                         LEFT JOIN student_year_snapshots sys
                           ON sys.student_id = s.adm_no
                          AND sys.academic_year_id = $1
                         LEFT JOIN staff st ON st.id = COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id)
                         WHERE s.status = 'active'
                         ${mentorFilterClause}
                         ORDER BY s.adm_no`, studentQueryParams),
                db_1.db.query(`SELECT student_id, mode, entry_date, surah_name, start_v, end_v,
                         start_page, end_page, juz_number, juz_portion
                         FROM hifz_logs
                         WHERE entry_date >= $1::date AND entry_date <= $2::date`, [startDate, endDate]),
                db_1.db.query(`SELECT * FROM monthly_reports WHERE report_month = $1::date`, [reportMonth]),
                getDetectedClassDays(startDate, endDate),
                getDetectedLogDays(startDate, endDate),
                getMonthlyClassDaysSetting(reportMonth),
            ]);
            const attendanceSummaries = await (0, attendance_report_1.getStudentAttendanceSummaries)(db_1.db, studentsResult.rows, startDate, endDate, 'hifz', academicContext.academicYearId);
            const logsByStudent = {};
            logsResult.rows.forEach((log) => {
                if (!logsByStudent[log.student_id])
                    logsByStudent[log.student_id] = [];
                logsByStudent[log.student_id].push(log);
            });
            const manualByStudent = {};
            manualReportsResult.rows.forEach((r) => {
                manualByStudent[r.student_id] = r;
            });
            const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
            const scheduledClassDays = studentsResult.rows.reduce((max, student) => {
                const summary = attendanceSummaries.get(student.adm_no);
                return Math.max(max, summary?.plannedClasses || 0);
            }, 0);
            const fallbackAllowedForStudent = (plannedClasses) => (plannedClasses === 0 && scheduledClassDays === 0);
            const reportClassDays = studentsResult.rows.reduce((max, student) => {
                const summary = attendanceSummaries.get(student.adm_no);
                const plannedClasses = summary?.plannedClasses || 0;
                const value = resolvePointClassDays(summary?.pointClassDays || 0, summary?.effectiveClasses || 0, plannedClasses, fallbackAllowedForStudent(plannedClasses) ? fallbackClassDays : 0, fallbackAllowedForStudent(plannedClasses) ? overrideClassDays : null);
                return Math.max(max, value);
            }, 0);
            const cancelledClassDays = studentsResult.rows.reduce((max, student) => {
                const summary = attendanceSummaries.get(student.adm_no);
                return Math.max(max, summary?.cancelledClasses || 0);
            }, 0);
            const automaticPointClassDays = studentsResult.rows.reduce((max, student) => {
                const summary = attendanceSummaries.get(student.adm_no);
                return Math.max(max, summary?.pointClassDays || 0);
            }, 0);
            const reports = studentsResult.rows.map((student) => {
                const manualRecord = manualByStudent[student.adm_no];
                const attendanceSummary = attendanceSummaries.get(student.adm_no);
                const automaticPointClassDays = attendanceSummary?.pointClassDays || 0;
                const plannedClasses = attendanceSummary?.plannedClasses || 0;
                const allowFallback = fallbackAllowedForStudent(plannedClasses);
                const effectiveClassDays = resolvePointClassDays(automaticPointClassDays, attendanceSummary?.effectiveClasses || 0, plannedClasses, allowFallback ? fallbackClassDays : 0, allowFallback ? overrideClassDays : null);
                // Manual monthly figures remain the report display values. Live
                // Hifz logs still determine performance points, including range entry.
                const studentLogs = logsByStudent[student.adm_no] || [];
                const calculatedPoints = (0, hifz_calculator_1.calculateHifzReportPoints)(studentLogs, [], {
                    expectedClassDaysOverride: effectiveClassDays,
                });
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
                        ...calculatedPoints,
                        grade: manualRecord.grade || '-',
                        totalClassDays: effectiveClassDays,
                        detectedClassDays,
                        scheduledClassDays: attendanceSummary?.plannedClasses || scheduledClassDays,
                        pointClassDays: automaticPointClassDays,
                        cancelledClasses: attendanceSummary?.cancelledClasses || 0,
                        attendedClasses: attendanceSummary?.attendedClasses || 0,
                        notAttendedClasses: attendanceSummary?.notAttendedClasses || 0,
                    };
                }
                const hifzPages = (0, quran_data_1.calculateCoveredPagesFromLogs)(studentLogs.filter((log) => log.mode === 'New Verses'));
                let maxJuz = 0;
                studentLogs.forEach((log) => {
                    if (log.mode === 'New Verses') {
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
                studentLogs.filter((l) => l.mode?.startsWith('Juz Revision')).forEach((log) => {
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
                    attendance: attendanceSummary?.attendanceLabel || '-',
                    scheduledClassDays: attendanceSummary?.plannedClasses || 0,
                    pointClassDays: automaticPointClassDays,
                    cancelledClasses: attendanceSummary?.cancelledClasses || 0,
                    attendedClasses: attendanceSummary?.attendedClasses || 0,
                    notAttendedClasses: attendanceSummary?.notAttendedClasses || 0,
                    is_manual: false,
                    ...calculatedPoints
                };
            });
            if (process.env.DEBUG_TOP_PERFORMERS === 'true') {
                console.debug('[TOP PERFORMERS]', {
                    mentor_id: mentor_id || null,
                    month,
                    report_start_date: startDate,
                    report_end_date: endDate,
                    reports: reports.map((report) => ({
                        adm_no: report.adm_no,
                        totalPoints: report.totalPoints,
                    })),
                });
            }
            return {
                reports,
                class_days: reportClassDays,
                scheduled_class_days: scheduledClassDays,
                cancelled_class_days: cancelledClassDays,
                automatic_point_class_days: automaticPointClassDays,
                detected_class_days: detectedClassDays,
                detected_log_days: detectedLogDays,
                override_class_days: overrideClassDays,
                using_fallback_log_days: automaticPointClassDays === 0 && scheduledClassDays === 0 && detectedClassDays === 0 && detectedLogDays > 0,
                report_start_date: startDate,
                report_end_date: endDate,
                is_current_month: isCurrentMonth,
            };
        });
        res.json({ success: true, ...results });
    }
    catch (err) {
        console.error('Error calculating bulk monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.calculateBulkMonthlyReport = calculateBulkMonthlyReport;
