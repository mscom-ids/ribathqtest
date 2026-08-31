import { Request, Response } from 'express';
import { db } from '../config/db';
import { calculateHifzReportPoints } from '../utils/hifz-calculator';
import { countCompletedJuz, getFirstJuzCompletionDate } from '../utils/quran-juz';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../utils/server-cache';
import { calculateCoveredPagesFromLogs } from '../utils/quran-data';
import { getStudentAttendanceSummaries } from '../utils/attendance-report';
import { getMentorAccessDecision, isMentorAccessRole } from '../utils/mentor-access-policy';
import { getAcademicYearContext } from '../utils/academic-year';
import { getHifzStudentMonthRegister, resolveHifzEntryEligibility } from '../services/hifz-monthly-register.service';
import { getDelegationContext, getStaffId } from '../utils/staff.utils';

const HIFZ_SUMMARY_TTL_MS = 5 * 60_000;
const HIFZ_MONTHLY_TTL_MS = 10 * 60_000;
const HIFZ_MONTHLY_POINT_DAY_VERSION = 11;

const normalizeClassDayCount = (value: any) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const resolvePointClassDays = (
    automaticPointClassDays: number,
    effectiveAttendanceClasses: number,
    plannedAttendanceClasses: number,
    fallbackClassDays: number,
    overrideClassDays: any
) => {
    const automatic = normalizeClassDayCount(automaticPointClassDays);
    if (automatic > 0) return automatic;

    const attendanceClasses = normalizeClassDayCount(effectiveAttendanceClasses);
    if (attendanceClasses > 0) return attendanceClasses;

    // If the timetable applied to this student but every slot was cancelled,
    // the correct denominator is zero, not a global/manual fallback.
    if (normalizeClassDayCount(plannedAttendanceClasses) > 0) return 0;

    const manualFallback = overrideClassDays === null ? 0 : normalizeClassDayCount(overrideClassDays);
    if (manualFallback > 0) return manualFallback;

    return normalizeClassDayCount(fallbackClassDays);
};

const enforceHifzRecordingAccess = async (req: Request, entryDate: string) => {
    const role = String((req as any).user?.role || '').toLowerCase();
    if (!isMentorAccessRole(role)) return;

    const access = await getMentorAccessDecision('hifz_recording', entryDate);
    if (!access.allowed) {
        const err: any = new Error(access.reason || 'Hifz recording is locked for this date.');
        err.statusCode = 403;
        err.accessPolicy = access;
        throw err;
    }
};

type HifzStudentAccessRequest = {
    studentId: string;
    entryDate?: string | null;
    sessionId?: string | null;
};

const enforceHifzStudentAccess = async (req: Request, requests: HifzStudentAccessRequest[]) => {
    const user = (req as any).user;
    const role = String(user?.role || '').toLowerCase();
    if (!['staff', 'usthad', 'mentor'].includes(role)) return;

    const normalizedRequests: HifzStudentAccessRequest[] = [];
    const seenRequests = new Set<string>();
    for (const request of requests) {
        const normalized = {
            studentId: String(request.studentId || '').trim(),
            entryDate: request.entryDate ? toDateKey(request.entryDate) : null,
            sessionId: request.sessionId ? String(request.sessionId) : null,
        };
        if (!normalized.studentId) continue;
        const key = `${normalized.studentId}|${normalized.entryDate || ''}|${normalized.sessionId || ''}`;
        if (seenRequests.has(key)) continue;
        seenRequests.add(key);
        normalizedRequests.push(normalized);
    }

    const requestedStudentIds = Array.from(new Set(normalizedRequests.map((request) => request.studentId)));
    const delegation = await getDelegationContext(req);
    if (!delegation?.staffId) {
        const err: any = new Error('Mentor staff profile not found.');
        err.statusCode = 403;
        throw err;
    }
    if (delegation.studentId && requestedStudentIds.some((studentId) => studentId !== delegation.studentId)) {
        const err: any = new Error('This delegation does not allow Hifz entries for the selected student.');
        err.statusCode = 403;
        throw err;
    }
    if (requestedStudentIds.length === 0) return;

    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
    const result = await db.query(
        `WITH requested AS (
             SELECT *
             FROM jsonb_to_recordset($1::jsonb)
                  AS request(student_id text, entry_date date, session_id text)
         )
         SELECT DISTINCT
                request.student_id,
                request.entry_date::text AS entry_date,
                request.session_id
         FROM requested request
         JOIN students s ON s.adm_no = request.student_id
         LEFT JOIN student_year_snapshots sys
           ON sys.student_id = s.adm_no
          AND sys.academic_year_id = $3::uuid
         LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
         WHERE LOWER(COALESCE(s.status, 'active')) = 'active'
           AND (
               COALESCE(sys.hifz_mentor_id, hp.mentor_id, s.hifz_mentor_id) = $2::uuid
               OR (
                   request.entry_date IS NOT NULL
                   AND EXISTS (
                       SELECT 1
                       FROM student_attendance_marks mark
                       JOIN attendance_schedules schedule ON schedule.id = mark.schedule_id
                       WHERE mark.student_id = request.student_id
                         AND mark.date = request.entry_date
                         AND UPPER(mark.status) IN ('PRESENT', 'LATE')
                         AND mark.marked_by = COALESCE(sys.hifz_mentor_id, hp.mentor_id, s.hifz_mentor_id)
                         AND LOWER(schedule.class_type) = 'hifz'
                         AND (request.session_id IS NULL OR mark.schedule_id::text = request.session_id)
                   )
               )
           )`,
        [
            JSON.stringify(normalizedRequests.map((request) => ({
                student_id: request.studentId,
                entry_date: request.entryDate,
                session_id: request.sessionId,
            }))),
            delegation.staffId,
            academicContext.academicYearId,
        ],
    );
    const authorizedRequests = new Set(result.rows.map((row: any) => (
        `${String(row.student_id)}|${row.entry_date || ''}|${row.session_id || ''}`
    )));
    const hasUnauthorizedRequest = normalizedRequests.some((request) => (
        !authorizedRequests.has(`${request.studentId}|${request.entryDate || ''}|${request.sessionId || ''}`)
    ));
    if (hasUnauthorizedRequest) {
        const err: any = new Error(
            "Another mentor can record this student's Hifz progress only after the assigned mentor marks the student PRESENT or LATE.",
        );
        err.statusCode = 403;
        throw err;
    }
    // Scheduled class days still require qualifying PRESENT attendance through
    // resolveHifzEntryEligibility. Genuine no-class days need no attendance mark
    // for the student's assigned mentor.
};
const getDetectedClassDays = async (startDate: string, endDate: string) => {
    const result = await db.query(
        `SELECT COUNT(DISTINCT date) AS class_days
         FROM attendance
         WHERE date >= $1::date
           AND date <= $2::date
           AND department = 'Hifz'
           AND COALESCE(LOWER(status), '') NOT IN ('cancelled', 'leave')`,
        [startDate, endDate]
    );

    return Number(result.rows[0]?.class_days || 0);
};

const getDetectedLogDays = async (startDate: string, endDate: string) => {
    const result = await db.query(
        `SELECT COUNT(DISTINCT entry_date::date) AS log_days
         FROM hifz_logs
         WHERE entry_date >= $1::date
           AND entry_date <= $2::date
           AND deleted_at IS NULL`,
        [startDate, endDate]
    );

    return Number(result.rows[0]?.log_days || 0);
};

const VALID_HIFZ_MODES = new Set(['New Verses', 'Recent Revision', 'Juz Revision', 'Juz Revision (New)', 'Juz Revision (Old)']);
const VALID_JUZ_PORTIONS = new Set(['Full', '1st Half', '2nd Half', 'Q1', 'Q2', 'Q3', 'Q4']);

function toNullableNumber(value: any) {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function hifzValidationError(message: string) {
    const err: any = new Error(message);
    err.statusCode = 400;
    return err;
}

const toDateKey = (value: any): string => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
};

function normalizeHifzLogInput(log: any, index = 0) {
    const label = `Log ${index + 1}`;
    const mode = String(log?.mode || '').trim();
    const studentId = String(log?.student_id || '').trim();
    const entryDate = toDateKey(log?.entry_date);
    const juzNumber = toNullableNumber(log?.juz_number);
    const startVerse = toNullableNumber(log?.start_v);
    const endVerse = toNullableNumber(log?.end_v);
    const startPage = toNullableNumber(log?.start_page);
    const endPage = toNullableNumber(log?.end_page);
    const juzPortion = log?.juz_portion ? String(log.juz_portion).trim() : null;

    if (!studentId) throw hifzValidationError(`${label}: student is required`);
    if (!entryDate) throw hifzValidationError(`${label}: entry date is required`);
    if (!VALID_HIFZ_MODES.has(mode)) throw hifzValidationError(`${label}: invalid Hifz mode`);

    if (['New Verses', 'Recent Revision'].includes(mode)) {
        if (!log?.surah_name) throw hifzValidationError(`${label}: Surah is required`);
        if (!startVerse || Number.isNaN(startVerse)) throw hifzValidationError(`${label}: start verse is required`);
        if (!endVerse || Number.isNaN(endVerse)) throw hifzValidationError(`${label}: end verse is required`);
        if (startVerse > endVerse) throw hifzValidationError(`${label}: end verse must be after start verse`);
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
        session_id: log?.session_id || null,
        notes: log?.notes || null,
    };
}

type HifzEligibilityLog = {
    id?: string | null;
    student_id: string;
    entry_date: string;
    mode: string;
    surah_name?: string | null;
    start_v?: number | null;
    end_v?: number | null;
};

const enforceJuzRevisionEligibility = async (
    queryable: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    logs: HifzEligibilityLog[],
) => {
    const candidates = logs.filter(log => String(log.mode || '').startsWith('Juz Revision'));
    if (candidates.length === 0) return;

    const studentIds = [...new Set(candidates.map(log => String(log.student_id)))];
    const existingNewLogs = await queryable.query(
        'SELECT id, student_id, surah_name, start_v, end_v, entry_date '
        + 'FROM hifz_logs '
        + 'WHERE student_id = ANY($1::text[]) '
        + "AND mode = 'New Verses' "
        + 'AND deleted_at IS NULL '
        + 'ORDER BY entry_date ASC, created_at ASC',
        [studentIds],
    );

    // When an existing row is being changed, remove its old value before
    // evaluating eligibility, then include any incoming New Verses replacement.
    const replacedIds = new Set(logs.map(log => String(log.id || '')).filter(Boolean));
    const newLogsByStudent = new Map<string, any[]>();
    for (const log of existingNewLogs.rows) {
        if (replacedIds.has(String(log.id))) continue;
        const key = String(log.student_id);
        newLogsByStudent.set(key, [...(newLogsByStudent.get(key) || []), log]);
    }
    for (const log of logs) {
        if (log.mode !== 'New Verses') continue;
        const key = String(log.student_id);
        newLogsByStudent.set(key, [...(newLogsByStudent.get(key) || []), log]);
    }

    for (const candidate of candidates) {
        const completionDate = getFirstJuzCompletionDate(
            newLogsByStudent.get(String(candidate.student_id)) || [],
        );
        // Revision starts on the next day after the first Juz is completed.
        if (!completionDate || completionDate >= toDateKey(candidate.entry_date)) {
            throw monthlyRegisterError(
                'Juz Revision can be recorded only from the day after the student completes their first Juz.',
                409,
            );
        }
    }
};

function hifzLogErrorMessage(err: any) {
    if (err?.statusCode) return err.message;
    if (err?.code === '23503') {
        if (err.constraint?.includes('student')) return 'Student not found for this Hifz log.';
        if (err.constraint?.includes('usthad')) return 'Selected Hifz mentor/staff was not found.';
        return 'Referenced Hifz log data was not found.';
    }
    if (err?.code === '23514') {
        if (err.constraint === 'hifz_logs_juz_number_check') return 'Juz number must be between 1 and 30.';
        if (err.constraint === 'hifz_logs_juz_portion_check') return 'Invalid Juz portion.';
        if (err.constraint === 'hifz_logs_mode_check') return 'Invalid Hifz log mode.';
    }
    return err?.message || 'Failed to save Hifz log';
}

const getMonthlyClassDaysSetting = async (reportMonth: string) => {
    const result = await db.query(
        `SELECT expected_class_days
         FROM hifz_monthly_report_settings
         WHERE report_month = $1::date
         LIMIT 1`,
        [reportMonth]
    );

    return result.rows[0]?.expected_class_days ?? null;
};

function formatIndiaDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function getMonthlyReportPeriod(month: string) {
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
    } else if (monthKey > todayMonthKey) {
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

export const getHifzStudents = async (req: Request, res: Response) => {
    try {
        // Replaced 2 correlated subqueries (re-running once per student row)
        // with LATERAL JOINs. PG can use the new (student_id, mode, entry_date)
        // index to fetch the latest matching log per student in one pass.
        const students = await cachedResult(
            'hifz:students',
            5 * 60_000,
            async () => {
                const result = await db.query(
                    `SELECT
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
                           AND deleted_at IS NULL
                         ORDER BY entry_date DESC
                         LIMIT 1
                     ) nv ON TRUE
                     LEFT JOIN LATERAL (
                         SELECT juz_number FROM hifz_logs
                         WHERE student_id = s.adm_no AND mode = 'Juz Revision'
                           AND deleted_at IS NULL
                         ORDER BY entry_date DESC
                         LIMIT 1
                     ) jr ON TRUE
                     WHERE s.status = $1
                     ORDER BY s.name`,
                    ['active']
                );
                return result.rows;
            }
        );
        res.json({ success: true, students });
    } catch (err: any) {
        console.error('Error fetching hifz students:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getHifzLogsList = async (req: Request, res: Response) => {
    try {
        const { date, start_date, end_date, student_id, mode, limit } = req.query;

        let query = `
            SELECT hl.*, st.name as recorded_by_name
            FROM hifz_logs hl
            LEFT JOIN staff st ON hl.usthad_id = st.id
            WHERE hl.deleted_at IS NULL
        `;
        const params: any[] = [];
        let paramCount = 1;

        if (date) {
            query += ` AND entry_date = $${paramCount}`;
            params.push(date);
            paramCount++;
        } else if (start_date && end_date) {
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
            params.push(parseInt(limit as string));
        }

        const result = await db.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (err) {
        console.error('Error fetching hifz logs:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM hifz_logs WHERE id = $1 AND deleted_at IS NULL', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Log not found' });
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error fetching hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMaxJuzForStudent = async (req: Request, res: Response) => {
    try {
        const { student_id } = req.params;
        const result = await db.query('SELECT juz_number FROM hifz_logs WHERE student_id = $1 AND deleted_at IS NULL ORDER BY juz_number DESC LIMIT 1', [student_id]);
        res.json({ success: true, max_juz: result.rows.length > 0 ? result.rows[0].juz_number : 0 });
    } catch (err) {
        console.error('Error fetching max juz:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const createHifzLog = async (req: Request, res: Response) => {
    try {
        const log = normalizeHifzLogInput(req.body);
        await enforceHifzRecordingAccess(req, log.entry_date);
        await enforceHifzStudentAccess(req, [{ studentId: log.student_id, entryDate: log.entry_date, sessionId: log.session_id }]);
        await enforceJuzRevisionEligibility(db, [log]);
        const result = await db.query(
            `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, mode,
             surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
                log.student_id, log.usthad_id, log.entry_date, log.mode,
                log.surah_name, log.start_v, log.end_v, log.start_page,
                log.end_page, log.juz_number, log.juz_portion,
            ]
        );
        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error creating hifz log:', err);
        res.status((err as any).statusCode || 500).json({
            success: false,
            error: hifzLogErrorMessage(err),
            access_policy: (err as any).accessPolicy,
        });
    }
};

export const updateHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { student_id, usthad_id, entry_date, mode,
                surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        if (entry_date) {
            await enforceHifzRecordingAccess(req, entry_date);
        }
        await enforceHifzStudentAccess(req, [{
            studentId: String(student_id || ''),
            entryDate: entry_date || null,
            sessionId: req.body.session_id || null,
        }]);
        await enforceJuzRevisionEligibility(db, [{
            id: String(id),
            student_id: String(student_id || ''),
            entry_date: toDateKey(entry_date),
            mode: String(mode || ''),
            surah_name: surah_name || null,
            start_v: start_v || null,
            end_v: end_v || null,
        }]);
        const result = await db.query(
            `UPDATE hifz_logs SET student_id=$1, usthad_id=$2, entry_date=$3, mode=$4,
             surah_name=$5, start_v=$6, end_v=$7, start_page=$8, end_page=$9,
             juz_number=$10, juz_portion=$11 WHERE id=$12 RETURNING *`,
            [student_id, usthad_id || null, entry_date, mode,
             surah_name || null, start_v || null, end_v || null, start_page || null,
             end_page || null, juz_number || null, juz_portion || null, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error updating hifz log:', err);
        res.status((err as any).statusCode || 500).json({
            success: false,
            error: (err as any).statusCode ? (err as any).message : 'Failed to update hifz log',
            access_policy: (err as any).accessPolicy,
        });
    }
};

export const bulkCreateHifzLogs = async (req: Request, res: Response) => {
    try {
        const { logs: rawLogs } = req.body;
        if (!Array.isArray(rawLogs) || rawLogs.length === 0) {
            return res.status(400).json({ success: false, error: 'logs array is required' });
        }
        const logs = rawLogs.map((log: any, index: number) => normalizeHifzLogInput(log, index));

        const uniqueEntryDates = [
            ...new Set(logs.map((log: any) => log.entry_date).filter(Boolean)),
        ];
        for (const entryDate of uniqueEntryDates) {
            await enforceHifzRecordingAccess(req, entryDate);
        }
        await enforceHifzStudentAccess(
            req,
            logs.map((log: any) => ({
                studentId: String(log.student_id),
                entryDate: log.entry_date,
                sessionId: log.session_id,
            })),
        );
        await enforceJuzRevisionEligibility(db, logs);

        // ── Step 1: bulk-fetch existing verse-range rows that could collide
        // with any candidate, in a SINGLE query. Replaces the per-row SELECT
        // dedup that ran inside the original loop.
        const dedupCandidates = logs.filter(
            (l: any) => ['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v
        );

        const dupKey = (l: any) =>
            `${l.student_id}|${toDateKey(l.entry_date)}|${l.mode}|${l.surah_name}|${l.start_v}|${l.end_v}`;

        const existingKeys = new Set<string>();
        if (dedupCandidates.length > 0) {
            const studentIds = [...new Set(dedupCandidates.map((l: any) => l.student_id))];
            const dates      = [...new Set(dedupCandidates.map((l: any) => toDateKey(l.entry_date)))];

            const existing = await db.query(
                `SELECT student_id,
                        to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                        mode, surah_name, start_v, end_v
                 FROM hifz_logs
                 WHERE mode = ANY($3::text[])
                   AND student_id = ANY($1::text[])
                   AND entry_date = ANY($2::date[])
                   AND deleted_at IS NULL`,
                [studentIds, dates, ['New Verses', 'Recent Revision']]
            );
            existing.rows.forEach((r: any) => existingKeys.add(dupKey(r)));
        }

        // Filter out duplicates (only applies to qualifying verse-range rows)
        const toInsert = logs.filter((l: any) => {
            if (['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v) {
                return !existingKeys.has(dupKey(l));
            }
            return true;
        });

        if (toInsert.length === 0) {
            return res.json({ success: true, logs: [] });
        }

        // ── Step 2: ONE multi-row INSERT for the survivors.
        const placeholders: string[] = [];
        const values: any[] = [];
        let i = 1;
        for (const log of toInsert) {
            placeholders.push(
                `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
            );
            values.push(
                log.student_id, log.usthad_id || null, log.entry_date, log.mode,
                log.surah_name || null, log.start_v || null, log.end_v || null,
                log.start_page || null, log.end_page || null,
                log.juz_number || null, log.juz_portion || null
            );
        }

        const result = await db.query(
            `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, mode,
                                    surah_name, start_v, end_v, start_page, end_page,
                                    juz_number, juz_portion)
             VALUES ${placeholders.join(',')}
             RETURNING *`,
            values
        );

        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true, logs: result.rows });
    } catch (err) {
        console.error('Error bulk creating hifz logs:', err);
        res.status((err as any).statusCode || 500).json({
            success: false,
            error: hifzLogErrorMessage(err),
            access_policy: (err as any).accessPolicy,
        });
    }
};

export const deleteHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const existing = await db.query(
            'SELECT student_id, entry_date, mode FROM hifz_logs WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
        if (existing.rows[0]) {
            const { student_id, entry_date, mode } = existing.rows[0];
            await enforceHifzRecordingAccess(req, entry_date);
            await enforceHifzStudentAccess(req, [{ studentId: student_id }]);
            await db.query(
                `DELETE FROM hifz_logs
                 WHERE student_id = $1
                   AND entry_date = $2
                   AND mode = $3`,
                [student_id, entry_date, mode]
            );
        }
        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting hifz log:', err);
        res.status((err as any).statusCode || 500).json({
            success: false,
            error: (err as any).statusCode ? (err as any).message : 'Failed',
            access_policy: (err as any).accessPolicy,
        });
    }
};

export const getMonthlyReports = async (req: Request, res: Response) => {
    try {
        const { report_month } = req.query;
        if (!report_month) return res.status(400).json({ success: false, error: 'report_month is required' });

        const reports = await cachedResult(
            makeCacheKey('hifz:monthly-reports', { report_month }),
            HIFZ_MONTHLY_TTL_MS,
            async () => {
                const result = await db.query('SELECT * FROM monthly_reports WHERE report_month = $1', [report_month]);
                return result.rows;
            }
        );
        res.json({ success: true, reports });
    } catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const upsertMonthlyReport = async (req: Request, res: Response) => {
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
        const result = await db.query(query, params);
        
        invalidateCacheByPrefix('hifz:monthly');
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMonthlyReportSettings = async (req: Request, res: Response) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }

        const { startDate, endDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month as string);

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
    } catch (err: any) {
        console.error('Error fetching monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertMonthlyReportSettings = async (req: Request, res: Response) => {
    try {
        const { report_month, expected_class_days } = req.body;
        if (!report_month) {
            return res.status(400).json({ success: false, error: 'report_month is required' });
        }

        const normalizedExpectedClassDays =
            expected_class_days === null || expected_class_days === undefined || expected_class_days === ''
                ? null
                : Number(expected_class_days);

        if (normalizedExpectedClassDays !== null && (!Number.isFinite(normalizedExpectedClassDays) || normalizedExpectedClassDays < 0)) {
            return res.status(400).json({ success: false, error: 'expected_class_days must be 0 or more' });
        }

        const result = await db.query(
            `INSERT INTO hifz_monthly_report_settings (report_month, expected_class_days, updated_at)
             VALUES ($1::date, $2, NOW())
             ON CONFLICT (report_month)
             DO UPDATE SET
                expected_class_days = EXCLUDED.expected_class_days,
                updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [report_month, normalizedExpectedClassDays]
        );

        invalidateCacheByPrefix('hifz:monthly');
        res.json({ success: true, settings: result.rows[0] });
    } catch (err: any) {
        console.error('Error upserting monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getProgressSummary = async (req: Request, res: Response) => {
    try {
        // Optional ?student_id= scope. Without it we still scan all logs
        // (kept for the admin dashboard); WITH it we only read that one
        // student — used by the daily-entry form so it doesn't pay for
        // the institution-wide scan on every open.
        const { student_id } = req.query;

        const progressMap = await cachedResult(
            makeCacheKey('hifz:progress-summary', { student_id: student_id || 'all' }),
            HIFZ_SUMMARY_TTL_MS,
            async () => {
                const params: any[] = [];
                let where = `WHERE hl.mode = 'New Verses'
                               AND hl.surah_name IS NOT NULL
                               AND hl.start_v IS NOT NULL
                               AND hl.end_v IS NOT NULL`;
                if (student_id) {
                    params.push(student_id);
                    where += ` AND hl.student_id = $1`;
                } else {
                    where += ` AND s.status = 'active'`;
                }

                const result = await db.query(
                    `SELECT hl.student_id, hl.surah_name, hl.start_v, hl.end_v
                     FROM hifz_logs hl
                     JOIN students s ON hl.student_id = s.adm_no
                     ${where}
                       AND hl.deleted_at IS NULL`,
                    params
                );

                const byStudent: Record<string, { surah_name: string | null; start_v: number | null; end_v: number | null }[]> = {};
                for (const row of result.rows) {
                    if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
                    byStudent[row.student_id].push(row);
                }

                const nextProgressMap: Record<string, number> = {};
                for (const [studentId, logs] of Object.entries(byStudent)) {
                    nextProgressMap[studentId] = countCompletedJuz(logs);
                }

                return nextProgressMap;
            }
        );

        res.json({ success: true, progressMap });
    } catch (err: any) {
        console.error('Error fetching progress summary:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
export const calculateMonthlyReportData = async (req: Request, res: Response) => {
    try {
        const { student_id, month } = req.query; // Expecting month in YYYY-MM
        if (!student_id || !month) {
            return res.status(400).json({ success: false, error: 'student_id and month are required' });
        }

        const { startDate, endDate, fullMonthEndDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month as string);

        const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
        const [studentResult, logsResult, lifetimeNewLogsResult] = await Promise.all([
            db.query(
                `SELECT s.adm_no,
                        COALESCE(sys.school_standard, s.standard) AS attendance_standard,
                        COALESCE(sys.school_standard, s.hifz_standard, s.standard, 'Common') AS standard,
                        COALESCE(hp.hifz_stage,
                            CASE WHEN COALESCE(hp.completed_hifz, false) THEN 'HAFIZ_REVISION' ELSE 'MEMORIZING' END
                        ) AS hifz_stage
                 FROM students s
                 LEFT JOIN student_year_snapshots sys
                   ON sys.student_id = s.adm_no
                  AND sys.academic_year_id = $2
                 LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
                 WHERE s.adm_no = $1`,
                [student_id, academicContext.academicYearId]
            ),
            db.query(
                `SELECT mode, entry_date, surah_name, start_v, end_v, start_page, end_page, juz_portion
                 FROM hifz_logs
                 WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3
                   AND deleted_at IS NULL`,
                [student_id, startDate, endDate]
            ),
            db.query(
                `SELECT surah_name, start_v, end_v, entry_date
                 FROM hifz_logs
                 WHERE student_id = $1
                   AND mode = 'New Verses'
                   AND deleted_at IS NULL
                 ORDER BY entry_date ASC, created_at ASC`,
                [student_id]
            ),
        ]);

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        // Two summaries: elapsed (for actual attended counts) and full-month
        // (for the point-days denominator so scoring targets the whole month).
        const [attendanceSummaries, monthTargetSummaries, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
            getStudentAttendanceSummaries(db, studentResult.rows, startDate, endDate, 'hifz', academicContext.academicYearId),
            endDate === fullMonthEndDate
                ? Promise.resolve(null as Awaited<ReturnType<typeof getStudentAttendanceSummaries>> | null)
                : getStudentAttendanceSummaries(db, studentResult.rows, startDate, fullMonthEndDate, 'hifz', academicContext.academicYearId),
            getDetectedClassDays(startDate, endDate),
            getDetectedLogDays(startDate, endDate),
            getMonthlyClassDaysSetting(reportMonth),
        ]);

        const attendanceSummary = attendanceSummaries.get(student_id as string);
        const targetSummary = (monthTargetSummaries || attendanceSummaries).get(student_id as string);
        const scheduledClassDays = targetSummary?.plannedClasses || 0;
        const cancelledClassDays = targetSummary?.cancelledClasses || 0;
        const countedClassDays = targetSummary?.effectiveClasses || 0;
        const automaticPointClassDays = targetSummary?.pointClassDays || 0;
        const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
        const effectiveClassDays = resolvePointClassDays(
            automaticPointClassDays,
            countedClassDays,
            scheduledClassDays,
            fallbackClassDays,
            overrideClassDays
        );

        const priorNewLogs = lifetimeNewLogsResult.rows.filter(
            (log: any) => toDateKey(log.entry_date) < startDate,
        );
        const isHafiz = countCompletedJuz(priorNewLogs) >= 30;
        const firstJuzCompletionDate = getFirstJuzCompletionDate(lifetimeNewLogsResult.rows);
        const calculations = calculateHifzReportPoints(logsResult.rows, [], {
            expectedClassDaysOverride: effectiveClassDays,
            attendedClasses: attendanceSummary?.weightedAttendedClasses ?? attendanceSummary?.attendedClasses ?? 0,
            countedClasses: targetSummary?.effectiveClasses || 0,
            isHafiz,
            firstJuzCompletionDate,
            periodStartDate: startDate,
            periodEndDate: fullMonthEndDate,
            pointDayWeights: targetSummary?.pointDayWeights || {},
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
    } catch (err: any) {
        console.error('Error calculating monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const calculateBulkMonthlyReport = async (req: Request, res: Response) => {
    try {
        const { month, mentor_id } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }

        const period = getMonthlyReportPeriod(month as string);
        const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);

        const results = await cachedResult(
            makeCacheKey('hifz:monthly-calculate', { month, mentor_id: mentor_id || 'all', academic_year_id: academicContext.academicYearId || 'legacy', report_end_date: period.endDate, point_day_version: HIFZ_MONTHLY_POINT_DAY_VERSION }),
            HIFZ_MONTHLY_TTL_MS,
            async () => {
                const { startDate, endDate, fullMonthEndDate, reportMonth, isCurrentMonth } = period;
                const mentorFilterClause = mentor_id
                    ? ` AND COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id) = $2`
                    : '';
                const studentQueryParams = mentor_id
                    ? [academicContext.academicYearId, mentor_id]
                    : [academicContext.academicYearId];

                // When a mentor is in scope, restrict the (otherwise institution-wide)
                // hifz_logs reads to that mentor's active roster. The per-student
                // grouping below only ever reads logs for students in studentsResult,
                // so this yields identical output while turning full-table scans into
                // ~10-student lookups. Uses the SAME mentor resolution as the roster
                // query above so the two never disagree. When no mentor_id (admin
                // "all" view) the clause is empty and behaviour is unchanged.
                const mentorLogScope = (ayParamIdx: number, mentorParamIdx: number) => (
                    mentor_id
                        ? ` AND hifz_logs.student_id IN (
                                SELECT s.adm_no FROM students s
                                LEFT JOIN student_year_snapshots sys
                                  ON sys.student_id = s.adm_no
                                 AND sys.academic_year_id = $${ayParamIdx}
                                WHERE s.status = 'active'
                                  AND COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id) = $${mentorParamIdx}
                           )`
                        : ''
                );

                const [studentsResult, logsResult, lifetimeNewLogsResult, manualReportsResult, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
                    db.query(
                        `SELECT s.adm_no, s.name,
                         COALESCE(sys.school_standard, s.standard) AS attendance_standard,
                         COALESCE(sys.school_standard, s.hifz_standard, s.standard, 'Common') AS standard,
                         st.name as usthad_name, st.phone as usthad_phone,
                         COALESCE(hp.hifz_stage,
                             CASE WHEN COALESCE(hp.completed_hifz, false) THEN 'HAFIZ_REVISION' ELSE 'MEMORIZING' END
                         ) AS hifz_stage
                         FROM students s
                         LEFT JOIN student_year_snapshots sys
                           ON sys.student_id = s.adm_no
                          AND sys.academic_year_id = $1
                         LEFT JOIN staff st ON st.id = COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id)
                         LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
                         WHERE s.status = 'active'
                         ${mentorFilterClause}
                         ORDER BY s.adm_no`,
                        studentQueryParams
                    ),
                    db.query(
                        `SELECT student_id, mode, entry_date, surah_name, start_v, end_v,
                         start_page, end_page, juz_number, juz_portion
                         FROM hifz_logs
                         WHERE entry_date >= $1::date AND entry_date <= $2::date
                           AND deleted_at IS NULL
                           ${mentorLogScope(3, 4)}`,
                        mentor_id
                            ? [startDate, endDate, academicContext.academicYearId, mentor_id]
                            : [startDate, endDate]
                    ),
                    // Lifetime New Verses logs support the first-Juz milestone and
                    // the existing start-of-month Hafiz-stage calculation.
                    db.query(
                        `SELECT student_id, surah_name, start_v, end_v, entry_date
                         FROM hifz_logs
                         WHERE mode = 'New Verses'
                           AND deleted_at IS NULL
                           ${mentorLogScope(1, 2)}
                         ORDER BY entry_date ASC, created_at ASC`,
                        mentor_id
                            ? [academicContext.academicYearId, mentor_id]
                            : []
                    ),
                    db.query(
                        `SELECT * FROM monthly_reports WHERE report_month = $1::date`,
                        [reportMonth]
                    ),
                    getDetectedClassDays(startDate, endDate),
                    getDetectedLogDays(startDate, endDate),
                    getMonthlyClassDaysSetting(reportMonth),
                ]);

                const lifetimeNewLogsByStudent: Record<string, any[]> = {};
                for (const log of lifetimeNewLogsResult.rows) {
                    const key = String(log.student_id);
                    if (!lifetimeNewLogsByStudent[key]) lifetimeNewLogsByStudent[key] = [];
                    lifetimeNewLogsByStudent[key].push(log);
                }
                const wasHafizAtStartByStudent: Record<string, boolean> = {};
                const firstJuzCompletionByStudent: Record<string, string | null> = {};
                for (const student of studentsResult.rows) {
                    const lifetimeLogs = lifetimeNewLogsByStudent[student.adm_no] || [];
                    const priorLogs = lifetimeLogs.filter(
                        (log: any) => toDateKey(log.entry_date) < startDate,
                    );
                    wasHafizAtStartByStudent[student.adm_no] = countCompletedJuz(priorLogs) >= 30;
                    firstJuzCompletionByStudent[student.adm_no] = getFirstJuzCompletionDate(lifetimeLogs);
                }

                // Two summaries: one over the elapsed range for actual attended/effective
                // counts, one over the full month for the point-days denominator so
                // scoring is based on the whole month's target, not just days elapsed.
                const [attendanceSummaries, monthTargetSummaries] = await Promise.all([
                    getStudentAttendanceSummaries(
                        db,
                        studentsResult.rows,
                        startDate,
                        endDate,
                        'hifz',
                        academicContext.academicYearId
                    ),
                    endDate === fullMonthEndDate
                        ? Promise.resolve(null as Awaited<ReturnType<typeof getStudentAttendanceSummaries>> | null)
                        : getStudentAttendanceSummaries(
                            db,
                            studentsResult.rows,
                            startDate,
                            fullMonthEndDate,
                            'hifz',
                            academicContext.academicYearId
                        ),
                ]);
                const targetSummaries = monthTargetSummaries || attendanceSummaries;

                const logsByStudent: Record<string, any[]> = {};
                logsResult.rows.forEach((log: any) => {
                    if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
                    logsByStudent[log.student_id].push(log);
                });

                const manualByStudent: Record<string, any> = {};
                manualReportsResult.rows.forEach((r: any) => {
                    manualByStudent[r.student_id] = r;
                });

                const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
                const scheduledClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = targetSummaries.get(student.adm_no);
                    return Math.max(max, summary?.plannedClasses || 0);
                }, 0);
                const fallbackAllowedForStudent = (plannedClasses: number) => (
                    plannedClasses === 0 && scheduledClassDays === 0
                );
                const reportClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = targetSummaries.get(student.adm_no);
                    const plannedClasses = summary?.plannedClasses || 0;
                    const value = resolvePointClassDays(
                        summary?.pointClassDays || 0,
                        summary?.effectiveClasses || 0,
                        plannedClasses,
                        fallbackAllowedForStudent(plannedClasses) ? fallbackClassDays : 0,
                        fallbackAllowedForStudent(plannedClasses) ? overrideClassDays : null
                    );
                    return Math.max(max, value);
                }, 0);
                const cancelledClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = targetSummaries.get(student.adm_no);
                    return Math.max(max, summary?.cancelledClasses || 0);
                }, 0);
                const automaticPointClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = targetSummaries.get(student.adm_no);
                    return Math.max(max, summary?.pointClassDays || 0);
                }, 0);

                const reports = studentsResult.rows.map((student: any) => {
                    const manualRecord = manualByStudent[student.adm_no];
                    const attendanceSummary = attendanceSummaries.get(student.adm_no);
                    const targetSummary = targetSummaries.get(student.adm_no);
                    // Denominator = full month's planned − cancelled (target),
                    // so scores climb toward a fixed monthly ceiling. Elapsed
                    // attendance counts still come from attendanceSummary.
                    const automaticPointClassDays = targetSummary?.pointClassDays || 0;
                    const plannedClasses = targetSummary?.plannedClasses || 0;
                    const allowFallback = fallbackAllowedForStudent(plannedClasses);
                    const effectiveClassDays = resolvePointClassDays(
                        automaticPointClassDays,
                        targetSummary?.effectiveClasses || 0,
                        plannedClasses,
                        allowFallback ? fallbackClassDays : 0,
                        allowFallback ? overrideClassDays : null
                    );

                    // Manual monthly figures remain the report display values. Live
                    // Hifz logs still determine performance points, including range entry.
                    // countedClasses uses the full month target so attendance points climb
                    // toward the month's total instead of showing 100% off a single day.
                    const studentLogs = logsByStudent[student.adm_no] || [];
                    // Stage is evaluated as of the START of the month: a student who
                    // completes their 30th Juz this month keeps the MEMORIZING layout
                    // until next month. This matches the register / progress modal.
                    const isHafiz = wasHafizAtStartByStudent[student.adm_no] === true;
                    const effectiveStage: 'MEMORIZING' | 'HAFIZ_REVISION' =
                        isHafiz ? 'HAFIZ_REVISION' : 'MEMORIZING';
                    const calculatedPoints = calculateHifzReportPoints(studentLogs, [], {
                        expectedClassDaysOverride: effectiveClassDays,
                        attendedClasses: attendanceSummary?.weightedAttendedClasses ?? attendanceSummary?.attendedClasses ?? 0,
                        countedClasses: targetSummary?.effectiveClasses || 0,
                        isHafiz,
                        firstJuzCompletionDate: firstJuzCompletionByStudent[student.adm_no],
                        periodStartDate: startDate,
                        periodEndDate: fullMonthEndDate,
                        pointDayWeights: targetSummary?.pointDayWeights || {},
                    });

                    // Per-student Juz Revision breakdowns from this month's logs.
                    const portionValue = (portion: any) => {
                        if (portion === 'Full') return 1;
                        if (typeof portion === 'string' && portion.includes('Half')) return 0.5;
                        if (typeof portion === 'string' && portion.startsWith('Q')) return 0.25;
                        return portion ? 1 : 0;
                    };
                    let plainJuzTotal = 0;
                    let newJuzTotal = 0;
                    let oldJuzTotal = 0;
                    studentLogs.forEach((log: any) => {
                        if (log.mode === 'Juz Revision') plainJuzTotal += portionValue(log.juz_portion);
                        else if (log.mode === 'Juz Revision (New)') newJuzTotal += portionValue(log.juz_portion);
                        else if (log.mode === 'Juz Revision (Old)') oldJuzTotal += portionValue(log.juz_portion);
                    });

                    if (manualRecord) {
                        return {
                            adm_no: student.adm_no,
                            name: student.name,
                            standard: student.standard,
                            usthad_name: student.usthad_name || 'Unassigned',
                            usthad_phone: student.usthad_phone || '',
                            hifz_stage: effectiveStage,
                            hifz_pages: Number(manualRecord.hifz_pages),
                            recent_days: Number(manualRecord.recent_pages),
                            juz_revision: Number(manualRecord.juz_revision),
                            new_juz_revision: parseFloat(newJuzTotal.toFixed(2)),
                            old_juz_revision: parseFloat(oldJuzTotal.toFixed(2)),
                            total_juz: Number(manualRecord.total_juz) || '-',
                            attendance: manualRecord.attendance || '-',
                            is_manual: true,
                            ...calculatedPoints,
                            grade: manualRecord.grade || '-',
                            totalClassDays: effectiveClassDays,
                            detectedClassDays,
                            scheduledClassDays: targetSummary?.plannedClasses || scheduledClassDays,
                            pointClassDays: automaticPointClassDays,
                            cancelledClasses: targetSummary?.cancelledClasses || 0,
                            attendedClasses: attendanceSummary?.attendedClasses || 0,
                            notAttendedClasses: attendanceSummary?.notAttendedClasses || 0,
                        };
                    }

                    const hifzPages = calculateCoveredPagesFromLogs(
                        studentLogs.filter((log: any) => log.mode === 'New Verses')
                    );
                    let maxJuz = 0;
                    studentLogs.forEach((log: any) => {
                        if (log.mode === 'New Verses') {
                            if (log.juz_number > maxJuz) maxJuz = log.juz_number;
                        }
                    });

                    const recentDates = new Set<string>();
                    studentLogs.filter((l: any) => l.mode === 'Recent Revision').forEach((log: any) => {
                        try {
                            const d = new Date(log.entry_date);
                            if (!isNaN(d.getTime())) {
                                recentDates.add(d.toISOString().split('T')[0]);
                            }
                        } catch (e) {}
                    });

                    // For MEMORIZING students the Juz Rev column folds all variants
                    // (including any transition-month Hafiz-mode logs). Hafiz students
                    // use new_juz_revision / old_juz_revision instead.
                    const combinedJuzTotal = plainJuzTotal + newJuzTotal + oldJuzTotal;

                    return {
                        adm_no: student.adm_no,
                        name: student.name,
                        standard: student.standard,
                        usthad_name: student.usthad_name || 'Unassigned',
                        usthad_phone: student.usthad_phone || '',
                        hifz_stage: effectiveStage,
                        hifz_pages: parseFloat(hifzPages.toFixed(1)),
                        recent_days: recentDates.size,
                        juz_revision: parseFloat(combinedJuzTotal.toFixed(2)),
                        new_juz_revision: parseFloat(newJuzTotal.toFixed(2)),
                        old_juz_revision: parseFloat(oldJuzTotal.toFixed(2)),
                        total_juz: maxJuz > 0 ? maxJuz : '-',
                        attendance: attendanceSummary?.attendanceLabel || '-',
                        scheduledClassDays: targetSummary?.plannedClasses || 0,
                        pointClassDays: automaticPointClassDays,
                        cancelledClasses: targetSummary?.cancelledClasses || 0,
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
                        reports: reports.map((report: any) => ({
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
            }
        );

        res.json({ success: true, ...results });
    } catch (err: any) {
        console.error('Error calculating bulk monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

const monthlyRegisterError = (message: string, statusCode = 400, code?: string) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    if (code) error.code = code;
    return error;
};

const getMonthlyRegister = async (req: Request, studentId: string, month: string) => {
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
    return getHifzStudentMonthRegister({
        db,
        studentId,
        month,
        academicYearId: academicContext.academicYearId,
    });
};

const getRegisterMonth = (entryDate: any) => toDateKey(entryDate).slice(0, 7);

export const getHifzStudentMonth = async (req: Request, res: Response) => {
    try {
        const studentId = String(req.params.studentId || '').trim();
        const month = String(req.query.month || '').trim();
        if (!studentId || !/^\d{4}-\d{2}$/.test(month)) {
            throw monthlyRegisterError('studentId and month (YYYY-MM) are required.');
        }
        // Mentor assignment controls normal rosters. Entry eligibility requires a
        // matching PRESENT mark on class days and permits genuine no-class days.
        const register = await getMonthlyRegister(req, studentId, month);
        res.json({ success: true, ...register });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to load Hifz month.' });
    }
};

const saveMonthlyHifzEntry = async (req: Request, res: Response, existingId?: string) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const existingResult = existingId
            ? await client.query('SELECT * FROM hifz_logs WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [existingId])
            : { rows: [] as any[] };
        const existing = existingResult.rows[0] || null;
        if (existingId && !existing) throw monthlyRegisterError('Hifz entry not found.', 404);

        const log = normalizeHifzLogInput({ ...req.body, student_id: req.body.student_id || existing?.student_id });
        if (existing && existing.student_id !== log.student_id) {
            throw monthlyRegisterError('A Hifz entry cannot be moved to another student.');
        }
        await enforceHifzRecordingAccess(req, log.entry_date);
        await enforceHifzStudentAccess(req, [{ studentId: log.student_id, entryDate: log.entry_date, sessionId: log.session_id }]);
        await enforceJuzRevisionEligibility(client, [{ ...log, id: existingId || null }]);

        const staffId = await getStaffId(req);
        const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
        const eligibility = await resolveHifzEntryEligibility({
            db: client,
            studentId: log.student_id,
            entryDate: log.entry_date,
            academicYearId: academicContext.academicYearId,
            requestedSessionId: log.session_id || null,
            existingRecordId: existingId || null,
        });
        if (!eligibility.allowed) {
            throw monthlyRegisterError(eligibility.reason || 'This Hifz entry is not eligible.', 409);
        }

        const result = existing
            ? await client.query(
                `UPDATE hifz_logs
                 SET entry_date = $1, mode = $2, surah_name = $3, start_v = $4, end_v = $5,
                     start_page = $6, end_page = $7, juz_number = $8, juz_portion = $9,
                     session_id = $10, attendance_record_id = (
                         SELECT id FROM student_attendance_marks
                         WHERE student_id = $11 AND schedule_id = $10 AND date = $1::date LIMIT 1
                     ), notes = $12, updated_at = NOW()
                 WHERE id = $13
                 RETURNING *`,
                [
                    log.entry_date, log.mode, log.surah_name, log.start_v, log.end_v,
                    log.start_page, log.end_page, log.juz_number, log.juz_portion,
                    eligibility.sessionId, log.student_id, log.notes, existingId,
                ],
            )
            : await client.query(
                `INSERT INTO hifz_logs (
                    student_id, usthad_id, entry_date, mode, surah_name, start_v, end_v,
                    start_page, end_page, juz_number, juz_portion, session_id,
                    attendance_record_id, created_by, notes
                 ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
                    (SELECT id FROM student_attendance_marks WHERE student_id = $1 AND schedule_id = $12 AND date = $3::date LIMIT 1),
                    $13,$14
                 ) RETURNING *`,
                [
                    log.student_id, staffId || log.usthad_id || null, log.entry_date, log.mode,
                    log.surah_name, log.start_v, log.end_v, log.start_page, log.end_page,
                    log.juz_number, log.juz_portion, eligibility.sessionId, staffId || null, log.notes,
                ],
            );
        await client.query('COMMIT');

        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        const month = getRegisterMonth(log.entry_date);
        const monthRegister = await getMonthlyRegister(req, log.student_id, month);
        res.json({
            success: true,
            entry: result.rows[0],
            day: monthRegister.days.find((day: any) => day.date === toDateKey(log.entry_date)) || null,
            summary: monthRegister.summary,
            monthRegister,
        });
    } catch (error: any) {
        await client.query('ROLLBACK').catch(() => undefined);
        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to save Hifz entry.' });
    } finally {
        client.release();
    }
};

const MONTHLY_HIFZ_BATCH_LIMIT = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Apply one monthly-register cell edit atomically.
 *
 * A cross-Surah range still produces one hifz_logs row per Surah, but all rows
 * share one authorization/eligibility check and one transaction. Existing rows
 * are touched only when the client explicitly includes them in `updates`.
 */
export const batchSaveMonthlyHifzEntries = async (req: Request, res: Response) => {
    let client: Awaited<ReturnType<typeof db.getClient>> | null = null;
    let transactionOpen = false;

    try {
        const studentId = String(req.body?.student_id || '').trim();
        const entryDate = toDateKey(req.body?.entry_date);
        const mode = String(req.body?.mode || '').trim();
        const requestedSessionId = req.body?.session_id ? String(req.body.session_id).trim() : null;
        const rawCreates = req.body?.creates;
        const rawUpdates = req.body?.updates;
        const rawDeleteIds = req.body?.delete_ids;
        const rawMutationId = req.body?.mutation_id;
        const mutationId = rawMutationId ? String(rawMutationId).trim() : null;
        const rawExpectedVersions = req.body?.expected_versions;

        if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || !VALID_HIFZ_MODES.has(mode)) {
            throw monthlyRegisterError('student_id, entry_date, and a valid mode are required.');
        }
        if (requestedSessionId && !UUID_PATTERN.test(requestedSessionId)) {
            throw monthlyRegisterError('Invalid Hifz session.');
        }
        if (mutationId && !UUID_PATTERN.test(mutationId)) {
            throw monthlyRegisterError('Invalid Hifz mutation id.');
        }
        if (rawExpectedVersions !== undefined
            && (!rawExpectedVersions || typeof rawExpectedVersions !== 'object' || Array.isArray(rawExpectedVersions))) {
            throw monthlyRegisterError('expected_versions must be an object.');
        }
        const expectedVersions = new Map<string, number>();
        for (const [id, rawVersion] of Object.entries(rawExpectedVersions || {})) {
            const version = Number(rawVersion);
            if (!UUID_PATTERN.test(id) || !Number.isSafeInteger(version) || version < 1) {
                throw monthlyRegisterError('Invalid expected Hifz entry version.');
            }
            expectedVersions.set(id, version);
        }
        if ((rawCreates !== undefined && !Array.isArray(rawCreates))
            || (rawUpdates !== undefined && !Array.isArray(rawUpdates))
            || (rawDeleteIds !== undefined && !Array.isArray(rawDeleteIds))) {
            throw monthlyRegisterError('creates, updates, and delete_ids must be arrays.');
        }

        const creates = (rawCreates || []).map((item: any, index: number) =>
            normalizeHifzLogInput({
                ...(item && typeof item === 'object' ? item : {}),
                student_id: studentId,
                entry_date: entryDate,
                mode,
                session_id: requestedSessionId,
            }, index)
        );
        const updates = (rawUpdates || []).map((item: any, index: number) => {
            const id = String(item?.id || '').trim();
            if (!UUID_PATTERN.test(id)) throw monthlyRegisterError(`Update ${index + 1}: invalid entry id.`);
            return {
                id,
                log: normalizeHifzLogInput({
                    ...(item && typeof item === 'object' ? item : {}),
                    student_id: studentId,
                    entry_date: entryDate,
                    mode,
                    session_id: requestedSessionId,
                }, creates.length + index),
            };
        });
        const deleteIds = (rawDeleteIds || []).map((value: unknown, index: number) => {
            const id = String(value || '').trim();
            if (!UUID_PATTERN.test(id)) throw monthlyRegisterError(`Delete ${index + 1}: invalid entry id.`);
            return id;
        });

        const operationCount = creates.length + updates.length + deleteIds.length;
        if (operationCount === 0) throw monthlyRegisterError('At least one Hifz entry change is required.');
        if (operationCount > MONTHLY_HIFZ_BATCH_LIMIT) {
            throw monthlyRegisterError(`A single Hifz save cannot exceed ${MONTHLY_HIFZ_BATCH_LIMIT} changes.`);
        }

        const referencedIds = [...updates.map((item: any) => item.id), ...deleteIds];
        if (new Set(referencedIds).size !== referencedIds.length) {
            throw monthlyRegisterError('The same Hifz entry cannot be updated or deleted more than once.');
        }

        const hasWrites = creates.length > 0 || updates.length > 0;
        if (hasWrites) await enforceHifzRecordingAccess(req, entryDate);
        await enforceHifzStudentAccess(req, [{ studentId, entryDate, sessionId: requestedSessionId }]);
        const [staffId, academicContext] = await Promise.all([
            getStaffId(req),
            getAcademicYearContext(db, req.query.academic_year_id),
        ]);
        const deviceId = (req as any).user?.device_id ? String((req as any).user.device_id) : null;
        if (mutationId && (!staffId || !deviceId || !UUID_PATTERN.test(deviceId))) {
            throw monthlyRegisterError('A registered mobile session is required for this mutation.', 403, 'MOBILE_DEVICE_REQUIRED');
        }

        client = await db.getClient();
        await client.query('BEGIN');
        transactionOpen = true;
        if (mutationId) {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${staffId}:${mutationId}`]);
            const receipt = await client.query(
                `SELECT status, response
                 FROM mobile_mutation_receipts
                 WHERE staff_id = $1 AND mutation_id = $2
                 LIMIT 1`,
                [staffId, mutationId],
            );
            if (receipt.rows[0]) {
                await client.query('COMMIT');
                transactionOpen = false;
                client.release();
                client = null;
                const monthRegister = await getMonthlyRegister(req, studentId, entryDate.slice(0, 7));
                return res.json({
                    ...(receipt.rows[0].response || {}),
                    replayed: true,
                    day: monthRegister.days.find((day: any) => day.date === entryDate) || null,
                    summary: monthRegister.summary,
                    monthRegister,
                });
            }
        }

        const existingRows = referencedIds.length > 0
            ? (await client.query(
                `SELECT *, (extract(epoch from updated_at) * 1000)::bigint AS entity_version
                 FROM hifz_logs
                 WHERE id = ANY($1::uuid[])
                   AND deleted_at IS NULL
                 FOR UPDATE`,
                [referencedIds],
            )).rows
            : [];
        if (existingRows.length !== referencedIds.length) {
            throw monthlyRegisterError('One or more Hifz entries no longer exist.', 409, 'HIFZ_ENTRY_CHANGED');
        }
        if (mutationId && referencedIds.some(id => !expectedVersions.has(id))) {
            throw monthlyRegisterError('The saved entry version is required before editing or deleting offline.', 409, 'HIFZ_ENTRY_CHANGED');
        }
        for (const existing of existingRows) {
            if (String(existing.student_id) !== studentId
                || toDateKey(existing.entry_date) !== entryDate
                || String(existing.mode) !== mode) {
                throw monthlyRegisterError('A Hifz entry cannot be moved to another student, date, or activity.');
            }
            const expected = expectedVersions.get(String(existing.id));
            if (expected !== undefined && Number(existing.entity_version) !== expected) {
                throw monthlyRegisterError('This Hifz entry changed on another device. Refresh before replacing it.', 409, 'HIFZ_ENTRY_CHANGED');
            }
        }
        if (hasWrites) {
            await enforceJuzRevisionEligibility(client, [
                ...creates,
                ...updates.map((item: any) => ({ ...item.log, id: item.id })),
            ]);
        }

        let effectiveSessionId = requestedSessionId;
        if (hasWrites) {
            const fallbackExisting = existingRows.find((row: any) => row.session_id);
            const eligibility = await resolveHifzEntryEligibility({
                db: client,
                studentId,
                entryDate,
                academicYearId: academicContext.academicYearId,
                requestedSessionId: requestedSessionId || fallbackExisting?.session_id || null,
            });
            if (!eligibility.allowed) {
                throw monthlyRegisterError(eligibility.reason || 'This Hifz entry is not eligible.', 409, 'HIFZ_ELIGIBILITY_CHANGED');
            }
            effectiveSessionId = eligibility.sessionId;
        }

        const deletedRows = deleteIds.length > 0
            ? (await client.query(
                `DELETE FROM hifz_logs
                 WHERE id = ANY($1::uuid[])
                 RETURNING id`,
                [deleteIds],
            )).rows
            : [];

        let updatedRows: any[] = [];
        if (updates.length > 0) {
            const values: any[] = [];
            const tuples: string[] = [];
            let parameter = 1;
            for (const item of updates) {
                tuples.push(`($${parameter++}::uuid,$${parameter++}::date,$${parameter++}::text,$${parameter++}::text,$${parameter++}::integer,$${parameter++}::integer,$${parameter++}::integer,$${parameter++}::integer,$${parameter++}::integer,$${parameter++}::text,$${parameter++}::uuid)`);
                values.push(
                    item.id,
                    entryDate,
                    mode,
                    item.log.surah_name,
                    item.log.start_v,
                    item.log.end_v,
                    item.log.start_page,
                    item.log.end_page,
                    item.log.juz_number,
                    item.log.juz_portion,
                    effectiveSessionId,
                );
            }
            const result = await client.query(
                `UPDATE hifz_logs AS target
                 SET entry_date = source.entry_date,
                     mode = source.mode,
                     surah_name = source.surah_name,
                     start_v = source.start_v,
                     end_v = source.end_v,
                     start_page = source.start_page,
                     end_page = source.end_page,
                     juz_number = source.juz_number,
                     juz_portion = source.juz_portion,
                     session_id = source.session_id,
                     attendance_record_id = (
                         SELECT mark.id
                         FROM student_attendance_marks mark
                         WHERE mark.student_id = target.student_id
                           AND mark.schedule_id = source.session_id
                           AND mark.date = source.entry_date
                         LIMIT 1
                     ),
                     updated_at = NOW()
                 FROM (VALUES ${tuples.join(',')}) AS source(
                     id, entry_date, mode, surah_name, start_v, end_v,
                     start_page, end_page, juz_number, juz_portion, session_id
                 )
                 WHERE target.id = source.id
                 RETURNING target.*`,
                values,
            );
            updatedRows = result.rows;
        }

        let createdRows: any[] = [];
        if (creates.length > 0) {
            const values: any[] = [];
            const tuples: string[] = [];
            let parameter = 1;
            for (const log of creates) {
                tuples.push(
                    `($${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},$${parameter++},`
                    + `(SELECT id FROM student_attendance_marks WHERE student_id = $${parameter - 12} AND schedule_id = $${parameter - 1} AND date = $${parameter - 10}::date LIMIT 1),`
                    + `$${parameter++},$${parameter++})`
                );
                values.push(
                    studentId,
                    staffId || log.usthad_id || null,
                    entryDate,
                    mode,
                    log.surah_name,
                    log.start_v,
                    log.end_v,
                    log.start_page,
                    log.end_page,
                    log.juz_number,
                    log.juz_portion,
                    effectiveSessionId,
                    staffId || null,
                    log.notes,
                );
            }
            const result = await client.query(
                `INSERT INTO hifz_logs (
                    student_id, usthad_id, entry_date, mode, surah_name, start_v, end_v,
                    start_page, end_page, juz_number, juz_portion, session_id,
                    attendance_record_id, created_by, notes
                 ) VALUES ${tuples.join(',')}
                 RETURNING *`,
                values,
            );
            createdRows = result.rows;
        }

        const appliedResponse = {
            success: true,
            mutationId,
            status: 'applied',
            replayed: false,
            entries: [...updatedRows, ...createdRows],
            deleted_ids: deletedRows.map((row: any) => String(row.id)),
        };
        if (mutationId && staffId) {
            const syncEvents = [
                ...[...updatedRows, ...createdRows].map((row: any) => ({
                    id: String(row.id),
                    operation: 'upsert',
                    version: Math.max(1, new Date(row.updated_at || Date.now()).getTime()),
                    payload: {
                        id: String(row.id), student_id: studentId, entry_date: entryDate, mode,
                        surah_name: row.surah_name, start_v: row.start_v, end_v: row.end_v,
                        notes: row.notes || null,
                        entity_version: Math.max(1, new Date(row.updated_at || Date.now()).getTime()),
                    },
                })),
                ...deletedRows.map((row: any) => ({
                    id: String(row.id), operation: 'delete', version: Date.now(),
                    payload: { student_id: studentId, entry_date: entryDate, mode },
                })),
            ];
            if (syncEvents.length > 0) {
                const values: any[] = [];
                const tuples = syncEvents.map((event, index) => {
                    const offset = index * 6;
                    values.push(staffId, event.id, event.operation, event.version, JSON.stringify(event.payload), 'hifz_log');
                    return `($${offset + 1}::uuid,$${offset + 6},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5}::jsonb)`;
                });
                await client.query(
                    `INSERT INTO mobile_sync_changes (
                       audience_staff_id, entity_type, entity_id, operation, entity_version, payload
                     ) VALUES ${tuples.join(',')}`,
                    values,
                );
            }
        }
        if (mutationId) {
            await client.query(
                `INSERT INTO mobile_mutation_receipts (staff_id, device_id, mutation_id, status, response)
                 VALUES ($1, $2, $3, 'applied', $4::jsonb)`,
                [staffId, deviceId, mutationId, JSON.stringify(appliedResponse)],
            );
        }
        await client.query('COMMIT');
        transactionOpen = false;
        client.release();
        client = null;

        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');

        let monthRegister: any = null;
        let refreshRequired = false;
        try {
            monthRegister = await getMonthlyRegister(req, studentId, entryDate.slice(0, 7));
        } catch (hydrationError: any) {
            refreshRequired = true;
            console.error('Hifz batch saved but month hydration failed:', hydrationError?.message || hydrationError);
        }

        return res.json({
            ...appliedResponse,
            day: monthRegister?.days?.find((day: any) => day.date === entryDate) || null,
            summary: monthRegister?.summary || null,
            monthRegister,
            refresh_required: refreshRequired,
        });
    } catch (error: any) {
        if (client && transactionOpen) {
            await client.query('ROLLBACK').catch(() => undefined);
            transactionOpen = false;
        }
        if (client) {
            client.release();
            client = null;
        }
        return res.status(error.statusCode || 500).json({
            success: false,
            code: error.code || (error.statusCode === 409 ? 'HIFZ_CONFLICT' : undefined),
            error: error.statusCode ? error.message : hifzLogErrorMessage(error),
        });
    } finally {
        if (client) client.release();
    }
};
export const createMonthlyHifzEntry = async (req: Request, res: Response) => {
    await saveMonthlyHifzEntry(req, res);
};

export const updateMonthlyHifzEntry = async (req: Request, res: Response) => {
    await saveMonthlyHifzEntry(req, res, String(req.params.id || ''));
};

export const deleteMonthlyHifzEntry = async (req: Request, res: Response) => {
    try {
        const id = String(req.params.id || '');
        const existing = await db.query(
            'SELECT id, student_id, entry_date FROM hifz_logs WHERE id = $1 AND deleted_at IS NULL',
            [id],
        );
        const log = existing.rows[0];
        if (!log) throw monthlyRegisterError('Hifz entry not found.', 404);
        await enforceHifzStudentAccess(req, [{ studentId: log.student_id }]);
        await db.query('DELETE FROM hifz_logs WHERE id = $1', [id]);
        invalidateCacheByPrefix('hifz:');
        invalidateCacheByPrefix('reports:students');
        const monthRegister = await getMonthlyRegister(req, log.student_id, getRegisterMonth(log.entry_date));
        res.json({
            success: true,
            day: monthRegister.days.find((day: any) => day.date === toDateKey(log.entry_date)) || null,
            summary: monthRegister.summary,
            monthRegister,
        });
    } catch (error: any) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Failed to delete Hifz entry.' });
    }
};
