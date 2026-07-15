"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getManagementProgressReport = exports.getManagementAttendanceReport = void 0;
const db_1 = require("../config/db");
const academic_year_1 = require("../utils/academic-year");
const attendance_report_1 = require("../utils/attendance-report");
const server_cache_1 = require("../utils/server-cache");
const MAX_DAYS = 62;
function dateKey(value) {
    if (!value)
        return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
        return value.slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find(item => item.type === type)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
}
function datesBetween(start, end) {
    const dates = [];
    const cursor = new Date(start + 'T00:00:00+05:30');
    const last = new Date(end + 'T00:00:00+05:30');
    while (cursor <= last && dates.length <= MAX_DAYS) {
        dates.push(dateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}
function dayOfWeekFromDateKey(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day)
        return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}
function parseList(value) {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value !== 'string')
        return [];
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    catch {
        return [];
    }
}
function normalizeStandard(value) {
    const label = String(value || '').trim();
    if (label === 'Hifz Only')
        return 'Hifz';
    if (label === '+1 (Plus One)')
        return 'Plus One';
    if (label === '+2 (Plus Two)')
        return 'Plus Two';
    return label.endsWith(' Standard') ? label.replace(' Standard', '') : label;
}
function normalizeDepartment(value) {
    const raw = String(value || 'school').toLowerCase();
    if (raw === 'madrassa')
        return 'madrasa';
    return raw === 'hifz' || raw === 'madrasa' ? raw : 'school';
}
function boundedInt(value, fallback, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}
function scheduleApplies(schedule, day) {
    if (Number(schedule.day_of_week) !== dayOfWeekFromDateKey(day))
        return false;
    const from = dateKey(schedule.effective_from);
    const until = dateKey(schedule.effective_until);
    return (!from || from <= day) && (!until || until >= day);
}
function studentMatchesSchedule(student, schedule) {
    const scheduleGroups = (schedule.group_ids || []).map(String);
    const studentGroups = (student.group_ids || []).map(String);
    if (scheduleGroups.length)
        return studentGroups.some((id) => scheduleGroups.includes(id));
    const standards = parseList(schedule.standards).map(normalizeStandard);
    return !standards.length || standards.includes(normalizeStandard(student.standard));
}
function cancellationApplies(row, studentStandard) {
    if (!row)
        return false;
    const standards = parseList(row.cancelled_standards).map(normalizeStandard);
    return !standards.length || standards.includes(normalizeStandard(studentStandard));
}
function leaveApplies(leave, schedule, day, studentStandard) {
    const start = new Date(day + 'T' + String(schedule.start_time || '00:00:00').slice(0, 8) + '+05:30');
    const end = new Date(day + 'T' + String(schedule.end_time || '00:00:00').slice(0, 8) + '+05:30');
    if (!(start < new Date(leave.end_datetime) && end > new Date(leave.start_datetime)))
        return false;
    return leave.is_entire_institution
        || parseList(leave.target_classes).map(normalizeStandard).includes(normalizeStandard(studentStandard));
}
function statusCode(value) {
    const status = String(value || '').toLowerCase();
    if (status === 'present' || status === 'late')
        return 'P';
    if (status === 'absent' || status === 'outside')
        return 'A';
    if (status === 'leave')
        return 'L';
    return 'N';
}
function dayCode(values) {
    if (!values.length)
        return '-';
    if (values.every(value => value === 'C'))
        return 'C';
    const active = values.filter(value => value !== 'C');
    if (active.includes('N'))
        return 'N';
    if (active.includes('A'))
        return 'A';
    if (active.every(value => value === 'L'))
        return 'L';
    return 'P';
}
function cacheParts(options) {
    return {
        academic_year_id: options.academicYearId,
        start_date: options.startDate,
        end_date: options.endDate,
        department: options.department,
        standard: options.standard,
        division: options.division,
        search: options.search,
        limit: options.limit,
        offset: options.offset,
    };
}
function scheduleStandardsForScope(schedule, groups, fallbackStandards) {
    const scheduleGroupIds = new Set((schedule.group_ids || []).map(String));
    if (scheduleGroupIds.size) {
        return [...new Set(groups
                .filter(group => scheduleGroupIds.has(String(group.group_id)))
                .map(group => normalizeStandard(group.standard))
                .filter(Boolean))];
    }
    const scheduleStandards = parseList(schedule.standards).map(normalizeStandard).filter(Boolean);
    if (!scheduleStandards.length)
        return fallbackStandards.length ? fallbackStandards : [''];
    if (!fallbackStandards.length)
        return scheduleStandards;
    return scheduleStandards.filter(standard => fallbackStandards.includes(standard));
}
async function resolveOptions(req) {
    const context = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
    if (!context.academicYearId)
        throw new Error('No active academic year is configured.');
    const year = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('academic-year:details', { id: context.academicYearId }), 10 * 60000, async () => {
        const result = await db_1.db.query('SELECT id, name, start_date, end_date FROM academic_years WHERE id = $1 LIMIT 1', [context.academicYearId]);
        return result.rows[0] || null;
    });
    if (!year)
        throw new Error('Academic year not found.');
    const today = dateKey(new Date());
    const startDate = String(req.query.start_date || dateKey(year.start_date));
    const endDate = String(req.query.end_date || (today < dateKey(year.end_date) ? today : dateKey(year.end_date)));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
        throw new Error('A valid start_date and end_date are required.');
    }
    if (datesBetween(startDate, endDate).length > MAX_DAYS)
        throw new Error('Report range cannot exceed ' + MAX_DAYS + ' days.');
    return {
        academicYearId: context.academicYearId, year, startDate, endDate,
        department: normalizeDepartment(req.query.department),
        standard: String(req.query.standard || '').trim(),
        division: String(req.query.division || '').trim(),
        search: String(req.query.search || '').trim(),
        limit: boundedInt(req.query.limit, 50, 100),
        offset: boundedInt(req.query.offset, 0, 100000),
    };
}
async function loadFilters(academicYearId) {
    return (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('reports:management-filters', { academic_year_id: academicYearId }), 5 * 60000, async () => {
        const [years, groups] = await Promise.all([
            db_1.db.query('SELECT id, name, start_date, end_date, is_current FROM academic_years ORDER BY start_date DESC'),
            db_1.db.query(`
                    SELECT g.id AS group_id, g.department, g.standard, COALESCE(g.division, '') AS division
                    FROM attendance_groups g
                    WHERE g.academic_year_id = $1
                      AND EXISTS (
                          SELECT 1
                          FROM attendance_schedules a
                          LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
                          WHERE a.academic_year_id = g.academic_year_id
                            AND (a.is_deleted = false OR a.is_deleted IS NULL)
                            AND (CASE WHEN LOWER(a.class_type) = 'madrassa' THEN 'madrasa' ELSE LOWER(a.class_type) END) =
                                (CASE WHEN LOWER(g.department) = 'madrassa' THEN 'madrasa' ELSE LOWER(g.department) END)
                            AND (
                                asg.group_id = g.id
                                OR (
                                    asg.group_id IS NULL
                                    AND (
                                        a.standards IS NULL
                                        OR a.standards::text = '[]'
                                        OR a.standards::text ILIKE '%' || g.standard || '%'
                                    )
                                )
                            )
                      )
                    ORDER BY g.department, g.standard, division
                `, [academicYearId]),
        ]);
        return { academic_years: years.rows, groups: groups.rows };
    });
}
async function loadRoster(options) {
    const sql = `
        WITH selected_groups AS (
            SELECT g.id, g.standard, COALESCE(g.division, '') AS division
            FROM attendance_groups g
            WHERE g.academic_year_id = $1
              AND (CASE WHEN LOWER(g.department) = 'madrassa' THEN 'madrasa' ELSE LOWER(g.department) END) = $2
              AND ($3 = '' OR g.standard = $3)
              AND ($4 = '' OR COALESCE(g.division, '') = $4)
              AND EXISTS (
                  SELECT 1
                  FROM attendance_schedules a
                  LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
                  WHERE a.academic_year_id = g.academic_year_id
                    AND (a.is_deleted = false OR a.is_deleted IS NULL)
                    AND (CASE WHEN LOWER(a.class_type) = 'madrassa' THEN 'madrasa' ELSE LOWER(a.class_type) END) = $2
                    AND (
                        asg.group_id = g.id
                        OR (
                            asg.group_id IS NULL
                            AND (
                                a.standards IS NULL
                                OR a.standards::text = '[]'
                                OR a.standards::text ILIKE '%' || g.standard || '%'
                            )
                        )
                    )
              )
        ),
        grouped AS (
            SELECT s.adm_no, s.name, s.photo_url, p.standard,
                   COALESCE(NULLIF(g.division, ''), p.division, '') AS division,
                   array_agg(DISTINCT g.id) AS group_ids
            FROM selected_groups g
            JOIN attendance_group_students gs ON gs.group_id = g.id
            JOIN students s ON s.adm_no = gs.student_id AND s.status = 'active'
            JOIN academic_student_placements p ON p.student_id = s.adm_no AND p.academic_year_id = $1 AND p.status = 'active'
            GROUP BY s.adm_no, s.name, s.photo_url, p.standard, g.division, p.division
        ),
        fallback AS (
            SELECT s.adm_no, s.name, s.photo_url, p.standard, COALESCE(p.division, '') AS division,
                   ARRAY[]::uuid[] AS group_ids
            FROM academic_student_placements p
            JOIN students s ON s.adm_no = p.student_id AND s.status = 'active'
            WHERE p.academic_year_id = $1
              AND p.status = 'active'
              AND NOT EXISTS (SELECT 1 FROM selected_groups)
              AND ($3 = '' OR p.standard = $3)
              AND ($4 = '' OR COALESCE(p.division, '') = $4)
        ),
        roster AS (SELECT * FROM grouped UNION ALL SELECT * FROM fallback),
        filtered AS (
            SELECT *, COUNT(*) OVER()::int AS total_count
            FROM roster
            WHERE ($5 = '' OR name ILIKE '%' || $5 || '%' OR adm_no ILIKE '%' || $5 || '%')
        )
        SELECT * FROM filtered
        ORDER BY standard, division, name
        LIMIT $6 OFFSET $7
    `;
    return db_1.db.query(sql, [options.academicYearId, options.department, options.standard, options.division, options.search, options.limit, options.offset]);
}
function pageInfo(students, options) {
    const total = Number(students[0]?.total_count || 0);
    return { total, limit: options.limit, offset: options.offset, has_more: options.offset + options.limit < total };
}
const getManagementAttendanceReport = async (req, res) => {
    try {
        const options = await resolveOptions(req);
        const result = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('reports:management-attendance:v3', cacheParts(options)), 120000, async () => {
            const scheduleSql = "SELECT a.id, a.name, a.class_type, a.standards, a.day_of_week, a.start_time, a.end_time, a.effective_from, a.effective_until, COALESCE(array_agg(DISTINCT asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids FROM attendance_schedules a LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id WHERE a.academic_year_id = $1 AND (CASE WHEN LOWER(a.class_type) = 'madrassa' THEN 'madrasa' ELSE LOWER(a.class_type) END) = $2 AND a.effective_from <= $4::date AND (a.effective_until IS NULL OR a.effective_until >= $3::date) AND (a.is_deleted = false OR a.is_deleted IS NULL) GROUP BY a.id";
            const [filters, rosterResult, schedulesResult, cancellationsResult, leavesResult, classMarksResult, studentLeavesResult] = await Promise.all([
                loadFilters(options.academicYearId),
                loadRoster(options),
                db_1.db.query(scheduleSql, [options.academicYearId, options.department, options.startDate, options.endDate]),
                db_1.db.query('SELECT schedule_id, date, cancelled_standards FROM attendance_cancellations WHERE date BETWEEN $1::date AND $2::date', [options.startDate, options.endDate]),
                db_1.db.query('SELECT start_datetime, end_datetime, target_classes, is_entire_institution FROM institutional_leaves WHERE start_datetime < ($2::date + 1) AND end_datetime >= $1::date', [options.startDate, options.endDate]),
                db_1.db.query('SELECT schedule_id, date FROM attendance_marks WHERE date BETWEEN $1::date AND $2::date', [options.startDate, options.endDate]),
                db_1.db.query(`SELECT student_id, start_datetime, COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) as effective_end_datetime 
                          FROM student_leaves 
                          WHERE status = 'outside' AND start_datetime < ($2::date + 1) AND COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) >= $1::date`, [options.startDate, options.endDate]),
            ]);
            const students = rosterResult.rows;
            const marksResult = students.length
                ? await db_1.db.query('SELECT student_id, schedule_id, date, status FROM student_attendance_marks WHERE date BETWEEN $1::date AND $2::date AND student_id = ANY($3::text[])', [options.startDate, options.endDate, students.map((student) => student.adm_no)])
                : { rows: [] };
            const marks = new Map(marksResult.rows.map((row) => [row.student_id + '|' + row.schedule_id + '|' + dateKey(row.date), row]));
            const cancellations = new Map(cancellationsResult.rows.map((row) => [row.schedule_id + '|' + dateKey(row.date), row]));
            const classMarks = new Set(classMarksResult.rows.map((row) => row.schedule_id + '|' + dateKey(row.date)));
            const dates = datesBetween(options.startDate, options.endDate);
            const outsideLeaves = studentLeavesResult.rows;
            function wasOutside(studentId, day) {
                return outsideLeaves.some((l) => l.student_id === studentId && dateKey(l.start_datetime) <= day && dateKey(l.effective_end_datetime) >= day);
            }
            const scopedGroups = filters.groups.filter((group) => normalizeDepartment(group.department) === options.department
                && (!options.standard || normalizeStandard(group.standard) === normalizeStandard(options.standard))
                && (!options.division || String(group.division || '') === options.division));
            const scopedStandards = [...new Set(scopedGroups.map((group) => normalizeStandard(group.standard)).filter(Boolean))];
            if (!scopedStandards.length && options.standard)
                scopedStandards.push(normalizeStandard(options.standard));
            // Group by schedule
            const schedulesData = [];
            for (const schedule of schedulesResult.rows) {
                const applicableStandards = scheduleStandardsForScope(schedule, scopedGroups, scopedStandards);
                if (!applicableStandards.length)
                    continue;
                const summary = { total_classes: 0, completed: 0, pending: 0, cancelled: 0, present: 0, absent: 0, leave: 0 };
                const scheduleDates = dates.filter(day => scheduleApplies(schedule, day));
                if (!scheduleDates.length)
                    continue;
                for (const day of scheduleDates) {
                    summary.total_classes += 1;
                    const cancellation = cancellations.get(schedule.id + '|' + day);
                    const fullyCancelled = applicableStandards.every(standard => cancellationApplies(cancellation, standard)
                        || leavesResult.rows.some((leave) => leaveApplies(leave, schedule, day, standard)));
                    if (fullyCancelled)
                        summary.cancelled += 1;
                    else if (classMarks.has(schedule.id + '|' + day))
                        summary.completed += 1;
                    else
                        summary.pending += 1;
                }
                const rows = students.filter((student) => studentMatchesSchedule(student, schedule)).map((student) => {
                    const totals = { present: 0, absent: 0, leave: 0, pending: 0, cancelled: 0, total: 0 };
                    const cells = {};
                    for (const day of scheduleDates) {
                        const cancelled = cancellationApplies(cancellations.get(schedule.id + '|' + day), student.standard)
                            || leavesResult.rows.some((leave) => leaveApplies(leave, schedule, day, student.standard));
                        if (cancelled) {
                            cells[day] = 'C';
                            totals.cancelled += 1;
                            continue;
                        }
                        let code = statusCode(marks.get(student.adm_no + '|' + schedule.id + '|' + day)?.status);
                        // If no mark was submitted, check if student was OUTSIDE on this day
                        if (code === 'N' && wasOutside(student.adm_no, day)) {
                            code = 'A';
                        }
                        cells[day] = code;
                        totals.total += 1;
                        if (code === 'N')
                            totals.pending += 1;
                        if (code === 'P') {
                            totals.present += 1;
                            summary.present += 1;
                        }
                        if (code === 'A') {
                            totals.absent += 1;
                            summary.absent += 1;
                        }
                        if (code === 'L') {
                            totals.leave += 1;
                            summary.leave += 1;
                        }
                    }
                    const denominator = totals.present + totals.absent;
                    return {
                        adm_no: student.adm_no, name: student.name, photo_url: student.photo_url,
                        standard: student.standard, division: student.division, cells, ...totals,
                        percentage: denominator ? Math.round(totals.present / denominator * 1000) / 10 : 0,
                    };
                });
                schedulesData.push({
                    id: schedule.id,
                    name: schedule.name,
                    summary,
                    data: rows
                });
            }
            return {
                academic_year: options.year,
                period: { start_date: options.startDate, end_date: options.endDate },
                filters, dates, pagination: pageInfo(students, options), schedules: schedulesData,
            };
        });
        return res.json({ success: true, ...result });
    }
    catch (error) {
        const message = error?.message || 'Failed to generate attendance report.';
        return res.status(message.includes('required') || message.includes('exceed') ? 400 : 500).json({ success: false, error: message });
    }
};
exports.getManagementAttendanceReport = getManagementAttendanceReport;
const getManagementProgressReport = async (req, res) => {
    try {
        const options = await resolveOptions(req);
        const result = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('reports:management-progress:v2', cacheParts(options)), 120000, async () => {
            const [filters, rosterResult] = await Promise.all([loadFilters(options.academicYearId), loadRoster(options)]);
            const students = rosterResult.rows.map((student) => ({
                ...student, attendance_standard: student.standard,
                report_start_date: options.startDate, report_end_date: options.endDate,
            }));
            const hifzSql = "SELECT student_id, COUNT(DISTINCT entry_date)::int AS recited_days, COUNT(*) FILTER (WHERE mode = 'New Verses')::int AS new_entries, COUNT(*) FILTER (WHERE mode = 'Recent Revision')::int AS recent_entries, COUNT(*) FILTER (WHERE mode IN ('Juz Revision', 'Juz Revision New', 'Juz Revision Old'))::int AS juz_entries FROM hifz_logs WHERE student_id = ANY($1::text[]) AND entry_date BETWEEN $2::date AND $3::date GROUP BY student_id";
            const [attendance, hifzResult] = await Promise.all([
                (0, attendance_report_1.getStudentAttendanceSummaries)(db_1.db, students, options.startDate, options.endDate, options.department, options.academicYearId),
                students.length ? db_1.db.query(hifzSql, [students.map((student) => student.adm_no), options.startDate, options.endDate]) : Promise.resolve({ rows: [] }),
            ]);
            const hifz = new Map(hifzResult.rows.map((row) => [row.student_id, row]));
            const rows = students.map((student) => {
                const a = attendance.get(student.adm_no);
                const h = hifz.get(student.adm_no) || {};
                const denominator = Number(a?.presentClasses || 0) + Number(a?.absentClasses || 0);
                return {
                    adm_no: student.adm_no, name: student.name, photo_url: student.photo_url,
                    standard: student.standard, division: student.division,
                    present: a?.presentClasses || 0, absent: a?.absentClasses || 0,
                    leave: a?.leaveClasses || 0, cancelled: a?.cancelledClasses || 0,
                    pending: a?.notAttendedClasses || 0,
                    attendance_percentage: denominator ? Math.round(Number(a?.presentClasses || 0) / denominator * 1000) / 10 : 0,
                    recited_days: Number(h.recited_days || 0), new_entries: Number(h.new_entries || 0),
                    recent_entries: Number(h.recent_entries || 0), juz_entries: Number(h.juz_entries || 0),
                };
            });
            return {
                academic_year: options.year, period: { start_date: options.startDate, end_date: options.endDate }, filters,
                summary: {
                    students: Number(students[0]?.total_count || 0),
                    present: rows.reduce((sum, row) => sum + row.present, 0),
                    absent: rows.reduce((sum, row) => sum + row.absent, 0),
                    recited_days: rows.reduce((sum, row) => sum + row.recited_days, 0),
                },
                pagination: pageInfo(students, options), data: rows,
            };
        });
        return res.json({ success: true, ...result });
    }
    catch (error) {
        const message = error?.message || 'Failed to generate progress report.';
        return res.status(message.includes('required') || message.includes('exceed') ? 400 : 500).json({ success: false, error: message });
    }
};
exports.getManagementProgressReport = getManagementProgressReport;
