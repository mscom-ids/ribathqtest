/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import {
    AttendanceSessionSummary,
    StudentAttendanceSummary,
    getStudentAttendanceSummaries,
} from '../utils/attendance-report';
import { calculateHifzReportPoints } from '../utils/hifz-calculator';
import { calculatePages, getSurahId } from '../utils/quran-data';
import { countCompletedJuz } from '../utils/quran-juz';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
}

const INDIA_TIMEZONE = 'Asia/Kolkata';

type ParentJwtPayload = {
    studentId?: string;
    student_id?: string;
};

function formatIndiaDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function getCurrentMonthRange() {
    const today = formatIndiaDate(new Date());
    const [year, month] = today.split('-');

    return {
        startDate: `${year}-${month}-01`,
        endDate: today,
        monthKey: `${year}-${month}`,
    };
}

function getMonthRange(month?: string) {
    const requested = String(month || '').trim();
    const today = formatIndiaDate(new Date());
    const fallbackKey = today.slice(0, 7);
    const monthKey = /^\d{4}-\d{2}$/.test(requested) ? requested : fallbackKey;
    const [yearText, monthText] = monthKey.split('-');
    const year = Number(yearText);
    const monthNumber = Number(monthText);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

    return {
        startDate: `${monthKey}-01`,
        endDate: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
        monthKey,
    };
}

function toDateKey(value: any): string {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function dateRange(startDate: string, endDate: string) {
    const days: string[] = [];
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    while (current <= end) {
        days.push(toDateKey(current));
        current.setDate(current.getDate() + 1);
    }

    return days;
}

function formatMonthEndForDashboard(month?: string) {
    const selected = getMonthRange(month);
    const current = getCurrentMonthRange();

    if (selected.monthKey === current.monthKey) {
        return { ...selected, endDate: current.endDate };
    }

    return selected;
}

function getParentStudentId(req: Request): string | null {
    const user = (req as Request & { user?: ParentJwtPayload }).user;
    return user?.studentId || user?.student_id || null;
}

function normalizeSessionName(value: string) {
    return String(value || 'Session').trim().replace(/\s+/g, ' ');
}

function formatSessionName(value: string) {
    return normalizeSessionName(value).replace(/^hifz\b/i, 'Hifz');
}

function groupAttendanceSessions(sessions: AttendanceSessionSummary[] = []) {
    const grouped = new Map<string, AttendanceSessionSummary>();

    sessions.forEach((session) => {
        const label = formatSessionName(session.session);
        const key = label.toLowerCase();
        const existing = grouped.get(key);

        if (!existing) {
            grouped.set(key, {
                ...session,
                schedule_id: key,
                session: label,
            });
            return;
        }

        existing.planned += session.planned || 0;
        existing.cancelled += session.cancelled || 0;
        existing.effective_total += session.effective_total || 0;
        existing.attended += session.attended || 0;
        existing.not_attended += session.not_attended || 0;
        existing.present += session.present || 0;
        existing.late += session.late || 0;
        existing.absent += session.absent || 0;
        existing.leave += session.leave || 0;
        existing.total += session.total || 0;
    });

    return Array.from(grouped.values());
}

function withGroupedAttendanceSessions(summary: StudentAttendanceSummary | null | undefined) {
    if (!summary) return null;

    const effectiveClasses = Number(summary.effectiveClasses || 0);
    const attendedClasses = Number(summary.attendedClasses || 0);
    const notAttendedClasses = Number(summary.notAttendedClasses || 0);

    return {
        ...summary,
        totalClasses: effectiveClasses,
        attendanceLabel: effectiveClasses
            ? `${attendedClasses} attended, ${notAttendedClasses} not attended`
            : '-',
        sessions: groupAttendanceSessions(summary.sessions),
    };
}

function getLogPages(log: any) {
    const surahId = getSurahId(log.surah_name || '');
    if (surahId && log.start_v && log.end_v) {
        return calculatePages(surahId, Number(log.start_v), surahId, Number(log.end_v));
    }

    if (log.start_page && log.end_page) {
        return Number(log.start_page) === Number(log.end_page)
            ? 0.5
            : Math.max(Number(log.end_page) - Number(log.start_page) + 1, 0);
    }

    return 0;
}

function getJuzPortionValue(portion?: string | null) {
    if (portion === 'Full') return 1;
    if (portion?.includes('Half')) return 0.5;
    if (portion?.startsWith('Q')) return 0.25;
    return portion ? 1 : 0;
}

function formatHifzEntry(log: any) {
    if (log.mode?.startsWith('Juz Revision')) {
        return `Juz ${log.juz_number || '-'} ${log.juz_portion || log.juz_part || ''}`.trim();
    }

    if (log.surah_name && log.start_v && log.end_v) {
        return `${log.surah_name} ${log.start_v}-${log.end_v}`;
    }

    if (log.start_page && log.end_page) {
        return `Pages ${log.start_page}-${log.end_page}`;
    }

    return 'Recorded';
}

function buildWeeklyHifzReport(logs: any[], startDate: string, endDate: string) {
    const logsByDate = new Map<string, any[]>();
    logs.forEach((log) => {
        const key = toDateKey(log.entry_date);
        logsByDate.set(key, [...(logsByDate.get(key) || []), log]);
    });

    const weeks: any[] = [];
    let weekDays: string[] = [];
    let weekNum = 1;
    const days = dateRange(startDate, endDate);

    days.forEach((dateKey, index) => {
        weekDays.push(dateKey);
        const day = new Date(`${dateKey}T00:00:00`).getDay();
        if (day === 4 || index === days.length - 1) {
            const dayRows = weekDays.map((dayKey) => {
                const dayLogs = logsByDate.get(dayKey) || [];
                const newVerseLogs = dayLogs.filter((log) => log.mode === 'New Verses');
                const recentLogs = dayLogs.filter((log) => log.mode === 'Recent Revision');
                const juzLogs = dayLogs.filter((log) => log.mode === 'Juz Revision');
                const newRevisionLogs = dayLogs.filter((log) => log.mode === 'Juz Revision (New)');
                const oldRevisionLogs = dayLogs.filter((log) => log.mode === 'Juz Revision (Old)');

            return {
                    date: dayKey,
                    day: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${dayKey}T00:00:00`)),
                    new_verses: newVerseLogs.map(formatHifzEntry),
                    recent_revision: recentLogs.map(formatHifzEntry),
                    juz_revision: juzLogs.map(formatHifzEntry),
                    new_revision: newRevisionLogs.map(formatHifzEntry),
                    old_revision: oldRevisionLogs.map(formatHifzEntry),
                    recorded_by: [...new Set(dayLogs.map((l: any) => l.usthad_name).filter(Boolean))],
                };
            });

            const weekLogs = weekDays.flatMap(dayKey => logsByDate.get(dayKey) || []);
            weeks.push({
                week: weekNum,
                days: dayRows,
                summary: summarizeHifzLogs(weekLogs),
            });
            weekNum++;
            weekDays = [];
        }
    });

    return weeks;
}

function summarizeHifzLogs(logs: any[]) {
    const recentDates = new Set<string>();
    let newPages = 0;
    let recentPages = 0;
    let juzRevision = 0;
    let newRevision = 0;
    let oldRevision = 0;

    logs.forEach((log) => {
        if (log.mode === 'New Verses') newPages += getLogPages(log);
        if (log.mode === 'Recent Revision') {
            recentPages += getLogPages(log);
            recentDates.add(toDateKey(log.entry_date));
        }
        if (log.mode === 'Juz Revision') juzRevision += getJuzPortionValue(log.juz_portion || log.juz_part);
        if (log.mode === 'Juz Revision (New)') newRevision += getJuzPortionValue(log.juz_portion || log.juz_part);
        if (log.mode === 'Juz Revision (Old)') oldRevision += getJuzPortionValue(log.juz_portion || log.juz_part);
    });

    return {
        new_pages: Number(newPages.toFixed(2)),
        recent_pages: Number(recentPages.toFixed(2)),
        recent_days: recentDates.size,
        juz_revision: Number(juzRevision.toFixed(2)),
        new_revision: Number(newRevision.toFixed(2)),
        old_revision: Number(oldRevision.toFixed(2)),
    };
}

function gradeFromPercentage(value: number) {
    if (value >= 95) return 'A++';
    if (value >= 90) return 'A+';
    if (value >= 80) return 'A';
    if (value >= 70) return 'B+';
    if (value >= 60) return 'B';
    if (value >= 50) return 'C+';
    if (value >= 40) return 'C';
    if (value >= 35) return 'D+';
    return 'D';
}

function groupExamRows(rows: any[]) {
    const exams = new Map<string, any>();

    rows.forEach((row) => {
        const exam = exams.get(row.exam_id) || {
            id: row.exam_id,
            title: row.exam_title,
            department: row.department,
            type: row.type,
            start_date: row.start_date,
            end_date: row.end_date,
            subjects: [],
            total_obtained: 0,
            total_max: 0,
            percentage: 0,
            grade: '-',
        };

        const marks = Number(row.marks_obtained || 0);
        const maxMarks = Number(row.max_marks || 0);
        exam.subjects.push({
            subject_id: row.subject_id,
            subject: row.subject,
            marks_obtained: marks,
            max_marks: maxMarks,
            min_marks: Number(row.min_marks || 0),
            remarks: row.remarks || '',
            percentage: maxMarks > 0 ? Math.round((marks / maxMarks) * 100) : 0,
        });
        exam.total_obtained += marks;
        exam.total_max += maxMarks;
        exams.set(row.exam_id, exam);
    });

    return Array.from(exams.values()).map((exam) => {
        const percentage = exam.total_max > 0 ? Math.round((exam.total_obtained / exam.total_max) * 1000) / 10 : 0;
        return {
            ...exam,
            percentage,
            grade: exam.total_max > 0 ? gradeFromPercentage(percentage) : '-',
        };
    });
}

export const parentLogin = async (req: Request, res: Response) => {
    try {
        const admissionNo = String(req.body?.admission_no || req.body?.admissionNo || '').trim();
        const rawDob = String(req.body?.dob || '').trim();

        if (!admissionNo || !rawDob) {
            return res.status(400).json({ success: false, error: 'Admission number and date of birth are required' });
        }

        const slashDobMatch = rawDob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const dob = slashDobMatch
            ? `${slashDobMatch[3]}-${slashDobMatch[2]}-${slashDobMatch[1]}`
            : rawDob;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return res.status(400).json({ success: false, error: 'Date of birth must be in DD/MM/YYYY format' });
        }

        const [yearText, monthText, dayText] = dob.split('-');
        const parsedDob = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
        if (
            parsedDob.getFullYear() !== Number(yearText) ||
            parsedDob.getMonth() !== Number(monthText) - 1 ||
            parsedDob.getDate() !== Number(dayText)
        ) {
            return res.status(400).json({ success: false, error: 'Date of birth must be a valid date in DD/MM/YYYY format' });
        }

        const result = await db.query(
            `SELECT adm_no, name, photo_url, batch_year, standard, dob, status
             FROM students
             WHERE LOWER(TRIM(adm_no)) = LOWER(TRIM($1))
               AND dob::date = $2::date
             LIMIT 1`,
            [admissionNo, dob]
        );

        const student = result.rows[0];
        if (!student) {
            return res.status(401).json({ success: false, error: 'Invalid admission number or date of birth' });
        }

        if (String(student.status || '').toLowerCase() !== 'active') {
            return res.status(403).json({ success: false, error: 'This student account is not active. Please contact the administration.' });
        }

        const token = jwt.sign(
            {
                id: `parent:${student.adm_no}`,
                role: 'parent',
                studentId: student.adm_no,
                name: student.name,
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });

        res.json({
            success: true,
            token,
            user: {
                role: 'parent',
                student_id: student.adm_no,
                name: student.name,
            },
        });
    } catch (err) {
        console.error('Parent login error:', err);
        res.status(500).json({ success: false, error: 'Failed to login' });
    }
};

export const getParentDashboard = async (req: Request, res: Response) => {
    try {
        const studentId = getParentStudentId(req);
        if (!studentId) {
            return res.status(401).json({ success: false, error: 'Unauthorized parent session' });
        }

        const { startDate, endDate, monthKey } = formatMonthEndForDashboard(String(req.query.month || ''));
        const fullMonth = getMonthRange(monthKey);

        const [studentResult, logsResult, monthLogsResult, lifetimeNewLogsResult, reportsResult, examRowsResult] = await Promise.all([
            db.query(
                `SELECT
                    s.adm_no,
                    s.name,
                    s.photo_url,
                    s.batch_year,
                    s.standard,
                    s.hifz_standard,
                    s.dob,
                    hm.name AS hifz_mentor,
                    sm.name AS school_mentor,
                    mm.name AS madrasa_mentor
                 FROM students s
                 LEFT JOIN staff hm ON s.hifz_mentor_id = hm.id
                 LEFT JOIN staff sm ON s.school_mentor_id = sm.id
                 LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
                 WHERE s.adm_no = $1 AND s.status = 'active'
                 LIMIT 1`,
                [studentId]
            ),
            db.query(
                `SELECT hl.id, hl.student_id, hl.mode, hl.entry_date,
                        hl.surah_name, hl.start_v, hl.end_v, hl.start_page, hl.end_page,
                        hl.juz_number, hl.juz_portion,
                        st.name AS usthad_name
                 FROM hifz_logs hl
                 LEFT JOIN staff st ON hl.usthad_id = st.id
                 WHERE hl.student_id = $1
                 ORDER BY hl.entry_date DESC, hl.created_at DESC
                 LIMIT 30`,
                [studentId]
            ),
            db.query(
                `SELECT hl.id, hl.student_id, hl.mode, hl.entry_date,
                        hl.surah_name, hl.start_v, hl.end_v, hl.start_page, hl.end_page,
                        hl.juz_number, hl.juz_portion, hl.juz_part,
                        st.name AS usthad_name
                 FROM hifz_logs hl
                 LEFT JOIN staff st ON hl.usthad_id = st.id
                 WHERE hl.student_id = $1
                   AND hl.entry_date >= $2::date
                   AND hl.entry_date <= $3::date
                 ORDER BY hl.entry_date ASC, hl.created_at ASC`,
                [studentId, fullMonth.startDate, fullMonth.endDate]
            ),
            db.query(
                `SELECT surah_name, start_v, end_v, start_page, end_page
                 FROM hifz_logs
                 WHERE student_id = $1 AND mode = 'New Verses'
                 ORDER BY entry_date ASC, created_at ASC`,
                [studentId]
            ),
            db.query(
                `SELECT report_month, hifz_pages, recent_pages, juz_revision,
                        total_juz, attendance, NULL::text AS grade, updated_at
                 FROM monthly_reports
                 WHERE student_id = $1
                 ORDER BY report_month DESC
                 LIMIT 6`,
                [studentId]
            ),
            db.query(
                `SELECT
                    e.id AS exam_id,
                    e.title AS exam_title,
                    e.department::text AS department,
                    e.type,
                    e.start_date,
                    e.end_date,
                    es.id AS subject_id,
                    es.name AS subject,
                    es.max_marks,
                    es.min_marks,
                    er.marks_obtained,
                    er.remarks
                 FROM exam_results er
                 JOIN exam_subjects es ON es.id = er.subject_id
                 JOIN exams e ON e.id = er.exam_id
                 WHERE er.student_id = $1
                 ORDER BY e.start_date DESC NULLS LAST, e.created_at DESC, es.order_index NULLS LAST, es.created_at`,
                [studentId]
            ),
        ]);

        const student = studentResult.rows[0];
        if (!student) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const [attendanceSummaries, hifzAttendanceSummaries] = await Promise.all([
            getStudentAttendanceSummaries(
                db,
                [{
                    adm_no: student.adm_no,
                    standard: student.standard,
                    attendance_standard: student.standard,
                }],
                startDate,
                endDate
            ),
            getStudentAttendanceSummaries(
                db,
                [{
                    adm_no: student.adm_no,
                    standard: student.hifz_standard || student.standard,
                    attendance_standard: student.hifz_standard || student.standard,
                }],
                startDate,
                endDate,
                'hifz'
            ),
        ]);

        const monthLogs = monthLogsResult.rows;
        const monthSummary = summarizeHifzLogs(monthLogs);
        const completedJuz = countCompletedJuz(lifetimeNewLogsResult.rows);
        const hifzAttendance = hifzAttendanceSummaries.get(student.adm_no) || null;
        const hifzPoints = calculateHifzReportPoints(monthLogs, [], {
            expectedClassDaysOverride: hifzAttendance?.pointClassDays || hifzAttendance?.effectiveClasses || null,
        });

        // Detect if this is a Hafiz student:
        // Strategy: check month logs first (most reliable — reflects current mode).
        // If the month is empty, fall back to the last 30 lifetime logs.
        // A student is Hafiz if ANY of their relevant logs use Hafiz modes
        // (Juz Revision (New) / Juz Revision (Old)).
        // We do NOT require the absence of regular modes — a student who was
        // previously a regular Hifz student before becoming Hafiz will still
        // have old regular logs in their history.
        const monthHafizModes = monthLogs.some(
            (log: any) => log.mode === 'Juz Revision (New)' || log.mode === 'Juz Revision (Old)'
        );
        const monthRegularModes = monthLogs.some(
            (log: any) => log.mode === 'New Verses' || log.mode === 'Recent Revision' || log.mode === 'Juz Revision'
        );
        const recentHafizModes = logsResult.rows.some(
            (log: any) => log.mode === 'Juz Revision (New)' || log.mode === 'Juz Revision (Old)'
        );
        // If the month has data: trust month logs exclusively.
        // If month is empty: fall back to recent 30 logs.
        const isHafizByLogs = monthLogs.length > 0
            ? monthHafizModes && !monthRegularModes   // month has Hafiz entries and no regular entries
            : recentHafizModes;                        // no month data — any recent Hafiz log is enough
        const isHafizByStandard = String(student.hifz_standard || '').toLowerCase().includes('hafiz');
        const isHafiz = isHafizByStandard || isHafizByLogs;

        const hifzReport = {
            month: fullMonth.monthKey,
            is_hafiz: isHafiz,
            summary: {
                ...monthSummary,
                total_recited: Number((monthSummary.new_pages + monthSummary.recent_pages + monthSummary.juz_revision + monthSummary.new_revision + monthSummary.old_revision).toFixed(2)),
                completed_juz: completedJuz,
                grade: hifzPoints.grade,
                percentage: hifzPoints.percentage,
                points: hifzPoints,
            },
            weekly: buildWeeklyHifzReport(monthLogs, fullMonth.startDate, fullMonth.endDate),
        };

        res.json({
            success: true,
            period: {
                month: monthKey,
                start_date: startDate,
                end_date: endDate,
            },
            student,
            attendance: withGroupedAttendanceSessions(attendanceSummaries.get(student.adm_no)),
            hifz_attendance: withGroupedAttendanceSessions(hifzAttendance),
            hifz_report: hifzReport,
            hifz_logs: logsResult.rows,
            reports: reportsResult.rows.map((report) => ({
                ...report,
                grade: hifzReport.summary.grade,
            })),
            exams: groupExamRows(examRowsResult.rows),
        });
    } catch (err) {
        console.error('Error fetching parent dashboard:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch parent dashboard' });
    }
};

export const getMyChildren = async (req: Request, res: Response) => {
    try {
        const studentId = getParentStudentId(req);
        if (!studentId) {
            return res.status(401).json({ success: false, error: 'Unauthorized parent session' });
        }

        const result = await db.query(
            `SELECT adm_no, name, photo_url, batch_year, standard, dob
             FROM students
             WHERE adm_no = $1 AND status = 'active'
             LIMIT 1`,
            [studentId]
        );

        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching parent children:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch children' });
    }
};

export const submitLeaveRequest = async (req: Request, res: Response) => {
    try {
        const sessionStudentId = getParentStudentId(req);
        const { student_id, leave_type, start_datetime, end_datetime, reason } = req.body;

        if (!sessionStudentId || student_id !== sessionStudentId) {
            return res.status(403).json({ success: false, error: 'Not authorized to submit leave for this student' });
        }

        if (!student_id || !leave_type || !start_datetime || !end_datetime) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const allowedParentLeaveTypes = ['out-campus', 'on-campus'];
        if (!allowedParentLeaveTypes.includes(leave_type)) {
            return res.status(400).json({ success: false, error: 'Invalid leave type' });
        }

        const result = await db.query(
            `INSERT INTO student_leaves (student_id, leave_type, start_datetime, end_datetime, reason, status)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [student_id, leave_type, start_datetime, end_datetime, reason || null, 'pending']
        );

        res.json({ success: true, leave: result.rows[0] });
    } catch (err) {
        console.error('Error submitting leave request:', err);
        res.status(500).json({ success: false, error: 'Failed to submit leave request' });
    }
};
