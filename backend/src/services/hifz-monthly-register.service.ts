import { calculateCoveredPagesFromLogs } from '../utils/quran-data';
import { countCompletedJuz } from '../utils/quran-juz';

export type HifzStage = 'MEMORIZING' | 'HAFIZ_REVISION';

export type Queryable = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type HifzEntryEligibility = {
    allowed: boolean;
    reason: string | null;
    sessionId: string | null;
    attendanceStatus: string | null;
    sessionStart: string | null;
    sessionEnd: string | null;
};

type RegisterStudent = {
    adm_no: string;
    name: string;
    standard: string | null;
    division: string | null;
    hifz_mentor_id: string | null;
    hifz_stage: HifzStage;
    completed_hifz: boolean;
    group_ids: string[];
};

type Schedule = {
    id: string;
    mentor_id: string | null;
    name: string;
    standards: unknown;
    day_of_week: number;
    start_time: string;
    end_time: string;
    effective_from: string | null;
    effective_until: string | null;
    group_ids: string[];
};

const INDIA_TIMEZONE = 'Asia/Kolkata';
const HIFZ_MODES_BY_STAGE: Record<HifzStage, string[]> = {
    MEMORIZING: ['New Verses', 'Recent Revision', 'Juz Revision'],
    HAFIZ_REVISION: ['Juz Revision (New)', 'Juz Revision (Old)'],
};

function datePartsInIndia(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}`,
    };
}

function dateKey(value: unknown) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const parsed = new Date(String(value || ''));
    return Number.isNaN(parsed.getTime()) ? '' : datePartsInIndia(parsed).date;
}

function weekdayForDate(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function monthRange(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('month must be YYYY-MM');
    const [year, monthNumber] = month.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) throw new Error('month must be YYYY-MM');
    const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const start = `${month}-01`;
    const end = `${month}-${String(totalDays).padStart(2, '0')}`;
    const dates = Array.from({ length: totalDays }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
    return { start, end, dates };
}

function parseList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function normalizeStandard(value: unknown) {
    const standard = String(value || '').trim();
    if (standard.endsWith(' Standard')) return standard.replace(' Standard', '');
    if (standard === 'Hifz Only') return 'Hifz';
    return standard;
}

function normalizedTime(value: unknown) {
    return String(value || '00:00').slice(0, 5);
}

function scheduleAppliesOn(schedule: Schedule, date: string) {
    return Number(schedule.day_of_week) === weekdayForDate(date)
        && (!schedule.effective_from || dateKey(schedule.effective_from) <= date)
        && (!schedule.effective_until || dateKey(schedule.effective_until) >= date);
}

function scheduleAppliesToStudent(schedule: Schedule, student: RegisterStudent) {
    const scheduleGroups = (schedule.group_ids || []).map(String);
    if (scheduleGroups.length > 0) {
        return (student.group_ids || []).some((groupId) => scheduleGroups.includes(String(groupId)));
    }

    const standards = parseList(schedule.standards).map(normalizeStandard);
    return standards.length === 0 || standards.includes(normalizeStandard(student.standard));
}

function isCancellationForStudent(cancellation: any, student: RegisterStudent) {
    if (!cancellation) return false;
    const cancelled = parseList(cancellation.cancelled_standards).map(normalizeStandard);
    return cancelled.length === 0 || cancelled.includes(normalizeStandard(student.standard));
}

function portionValue(portion: string | null | undefined) {
    if (portion === 'Full') return 1;
    if (portion?.includes('Half')) return 0.5;
    if (portion?.startsWith('Q')) return 0.25;
    return 0;
}

function modeKey(mode: string) {
    const keys: Record<string, string> = {
        'New Verses': 'newHifz',
        'Recent Revision': 'recentRevision',
        'Juz Revision': 'juzRevision',
        'Juz Revision (New)': 'newJuzRevision',
        'Juz Revision (Old)': 'oldJuzRevision',
    };
    return keys[mode] || mode;
}

async function loadStudent(
    db: Queryable,
    studentId: string,
    academicYearId: string | null,
): Promise<RegisterStudent | null> {
    const result = await db.query(
        `SELECT s.adm_no,
                s.name,
                COALESCE(p.standard, sys.school_standard, s.standard) AS standard,
                COALESCE(p.division, sys.school_section) AS division,
                COALESCE(sys.hifz_mentor_id, hp.mentor_id, s.hifz_mentor_id) AS hifz_mentor_id,
                COALESCE(hp.hifz_stage,
                    CASE WHEN COALESCE(hp.completed_hifz, false) THEN 'HAFIZ_REVISION' ELSE 'MEMORIZING' END
                ) AS hifz_stage,
                COALESCE(hp.completed_hifz, false) AS completed_hifz,
                COALESCE(student_groups.group_ids, ARRAY[]::uuid[]) AS group_ids
         FROM students s
         LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
         LEFT JOIN student_year_snapshots sys
           ON sys.student_id = s.adm_no
          AND sys.academic_year_id = $2::uuid
         LEFT JOIN academic_student_placements p
           ON p.student_id = s.adm_no
          AND p.academic_year_id = $2::uuid
          AND p.status = 'active'
         LEFT JOIN LATERAL (
             SELECT array_agg(gs.group_id ORDER BY gs.group_id) AS group_ids
             FROM attendance_group_students gs
             JOIN attendance_groups g ON g.id = gs.group_id
             WHERE gs.student_id = s.adm_no
               AND ($2::uuid IS NULL OR g.academic_year_id = $2::uuid)
         ) student_groups ON true
         WHERE s.adm_no = $1
           AND LOWER(COALESCE(s.status, 'active')) = 'active'
         LIMIT 1`,
        [studentId, academicYearId],
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
        ...row,
        hifz_stage: row.hifz_stage === 'HAFIZ_REVISION' ? 'HAFIZ_REVISION' : 'MEMORIZING',
        group_ids: (row.group_ids || []).map((groupId: unknown) => String(groupId)),
    };
}

async function loadSchedules(db: Queryable, startDate: string, endDate: string, academicYearId: string | null) {
    const result = await db.query(
        `SELECT a.id, a.mentor_id, a.name, a.standards, a.day_of_week, a.start_time, a.end_time,
                a.effective_from, a.effective_until,
                COALESCE(array_agg(DISTINCT asg.group_id)
                    FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids
         FROM attendance_schedules a
         LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
         WHERE LOWER(a.class_type) = 'hifz'
           AND a.effective_from <= $2::date
           AND (a.effective_until IS NULL OR a.effective_until >= $1::date)
           AND (a.is_deleted = false OR a.is_deleted IS NULL)
           AND ($3::uuid IS NULL OR a.academic_year_id = $3::uuid)
         GROUP BY a.id
         ORDER BY a.start_time, a.id`,
        [startDate, endDate, academicYearId],
    );
    return result.rows as Schedule[];
}

function selectApplicableSchedule(options: {
    schedules: Schedule[];
    student: RegisterStudent;
    date: string;
    requestedAt: Date;
    requestedSessionId?: string | null;
    preserveSessionId?: string | null;
    presentSessionIds?: Set<string> | null;
}) {
    const { schedules, student, date, requestedAt, requestedSessionId, preserveSessionId, presentSessionIds } = options;
    const candidates = applicableSchedulesForStudent(schedules, student, date);

    const requested = requestedSessionId || preserveSessionId;
    if (requested) return candidates.find((schedule) => schedule.id === requested) || null;

    // Students may have several Hifz sessions per day; prefer one the student is
    // marked PRESENT in so an unmarked later session doesn't block recording.
    const pickPreferringPresent = (pool: Schedule[]) => {
        if (presentSessionIds?.size) {
            const present = pool.filter((schedule) => presentSessionIds.has(schedule.id));
            if (present.length) return present[present.length - 1];
        }
        return pool[pool.length - 1] || null;
    };

    const indiaNow = datePartsInIndia(requestedAt);
    if (date < indiaNow.date) return pickPreferringPresent(candidates);
    if (date > indiaNow.date) return null;
    const filteredCandidates = candidates.filter((schedule) => normalizedTime(schedule.start_time) <= indiaNow.time);
    return pickPreferringPresent(filteredCandidates);
}

function applicableSchedulesForStudent(schedules: Schedule[], student: RegisterStudent, date: string) {
    return schedules
        .filter((schedule) => scheduleAppliesOn(schedule, date))
        .filter((schedule) => !schedule.mentor_id || schedule.mentor_id === student.hifz_mentor_id)
        .filter((schedule) => scheduleAppliesToStudent(schedule, student))
        .sort((a, b) => normalizedTime(a.start_time).localeCompare(normalizedTime(b.start_time)));
}

export async function resolveHifzEntryEligibility(options: {
    db: Queryable;
    studentId: string;
    entryDate: string;
    requestedAt?: Date;
    academicYearId?: string | null;
    requestedSessionId?: string | null;
    existingRecordId?: string | null;
}) : Promise<HifzEntryEligibility> {
    const requestedAt = options.requestedAt || new Date();
    const now = datePartsInIndia(requestedAt);
    const entryDate = String(options.entryDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
        return { allowed: false, reason: 'Entry date is required.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
    }
    if (entryDate > now.date) {
        return { allowed: false, reason: 'Future dates cannot be recorded.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
    }

    const [student, existingRecord] = await Promise.all([
        loadStudent(options.db, options.studentId, options.academicYearId || null),
        options.existingRecordId
            ? options.db.query('SELECT session_id, student_id FROM hifz_logs WHERE id = $1 AND deleted_at IS NULL', [options.existingRecordId])
            : Promise.resolve({ rows: [] as any[] }),
    ]);
    if (!student) {
        return { allowed: false, reason: 'Student is not active for Hifz recording.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
    }
    // Current mentor assignments define roster ownership. Hifz entry is opened
    // by a matching PRESENT attendance mark when a class applies. If neither the
    // mentor nor this student has a class on the date, attendance is not required.
    const schedules = await loadSchedules(options.db, entryDate, entryDate, options.academicYearId || null);
    const preserveSessionId = existingRecord.rows[0]?.session_id || null;
    const dayMarks = await options.db.query(
        `SELECT schedule_id, status, marked_by
         FROM student_attendance_marks
         WHERE student_id = $1 AND date = $2::date`,
        [options.studentId, entryDate],
    );
    const presentSessionIds = new Set<string>(
        dayMarks.rows
            .filter((mark) => String(mark.status).toUpperCase() === 'PRESENT')
            .filter((mark) => !student.hifz_mentor_id || String(mark.marked_by) === String(student.hifz_mentor_id))
            .map((mark) => String(mark.schedule_id)),
    );
    const applicableSchedules = applicableSchedulesForStudent(schedules, student, entryDate);
    const schedule = selectApplicableSchedule({
        schedules,
        student,
        date: entryDate,
        requestedAt,
        requestedSessionId: options.requestedSessionId || null,
        preserveSessionId,
        presentSessionIds,
    });
    if (!schedule) {
        const requestedSpecificSession = options.requestedSessionId || preserveSessionId;
        if (applicableSchedules.length === 0 && !requestedSpecificSession) {
            return { allowed: true, reason: null, sessionId: null, attendanceStatus: 'NOT_REQUIRED', sessionStart: null, sessionEnd: null };
        }
        return { allowed: false, reason: 'No Hifz session is available for this date.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
    }

    const [marks, cancellations] = await Promise.all([
        Promise.resolve({ rows: dayMarks.rows.filter((mark) => String(mark.schedule_id) === String(schedule.id)) }),
        options.db.query(
            `SELECT cancelled_standards
             FROM attendance_cancellations
             WHERE schedule_id = $1 AND date = $2::date
             LIMIT 1`,
            [schedule.id, entryDate],
        ),
    ]);
    if (isCancellationForStudent(cancellations.rows[0], student)) {
        return { allowed: false, reason: 'No Hifz session is available for this date.', sessionId: schedule.id, attendanceStatus: 'CANCELLED', sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
    }

    const attendanceStatus = marks.rows[0]?.status ? String(marks.rows[0].status).toUpperCase() : null;
    if (!attendanceStatus) {
        return { allowed: false, reason: 'Attendance must be marked before recording Hifz.', sessionId: schedule.id, attendanceStatus: null, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
    }
    if (attendanceStatus !== 'PRESENT') {
        return { allowed: false, reason: 'This student was not marked present for the current session.', sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
    }
    if (student.hifz_mentor_id && String(marks.rows[0]?.marked_by) !== String(student.hifz_mentor_id)) {
        return { allowed: false, reason: 'The assigned mentor must mark this student PRESENT before Hifz progress can be recorded.', sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
    }

    return { allowed: true, reason: null, sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
}

function entriesForDay(logs: any[], stage: HifzStage) {
    const entries: Record<string, any[]> = {
        newHifz: [], recentRevision: [], juzRevision: [], newJuzRevision: [], oldJuzRevision: [],
    };
    for (const log of logs) {
        if (stage === 'HAFIZ_REVISION') {
            const key = modeKey(log.mode);
            if (key in entries && HIFZ_MODES_BY_STAGE.HAFIZ_REVISION.includes(log.mode)) {
                entries[key].push(log);
            }
        } else {
            // MEMORIZING view. In the transition month a student may have already
            // logged Juz Revision (New)/(Old); surface those under the Juz Revision
            // column so no work is dropped from the register.
            if (log.mode === 'New Verses') entries.newHifz.push(log);
            else if (log.mode === 'Recent Revision') entries.recentRevision.push(log);
            else if (
                log.mode === 'Juz Revision'
                || log.mode === 'Juz Revision (New)'
                || log.mode === 'Juz Revision (Old)'
            ) {
                entries.juzRevision.push(log);
            }
        }
    }
    return entries;
}

function monthSummary(logs: any[], student: RegisterStudent, completedJuz = 0) {
    const newHifz = logs.filter((log) => log.mode === 'New Verses');
    const recent = logs.filter((log) => log.mode === 'Recent Revision');
    const juz = logs.filter((log) => log.mode === 'Juz Revision');
    const newJuz = logs.filter((log) => log.mode === 'Juz Revision (New)');
    const oldJuz = logs.filter((log) => log.mode === 'Juz Revision (Old)');
    const totalNewJuz = newJuz.reduce((total, log) => total + portionValue(log.juz_portion), 0);
    const totalOldJuz = oldJuz.reduce((total, log) => total + portionValue(log.juz_portion), 0);

    if (student.hifz_stage === 'HAFIZ_REVISION') {
        return {
            newJuzRevisionTotal: totalNewJuz,
            oldJuzRevisionTotal: totalOldJuz,
            revisionDays: new Set([...newJuz, ...oldJuz].map((log) => dateKey(log.entry_date))).size,
            cycleProgress: Math.min(100, Number((((totalNewJuz + totalOldJuz) / 30) * 100).toFixed(2))),
            completedJuz,
        };
    }

    // MEMORIZING view: fold any Hafiz-mode Juz Revision logs from the transition
    // month into the plain juzRevised total so the summary matches the register cells.
    const juzRevisedTotal =
        juz.reduce((total, log) => total + portionValue(log.juz_portion), 0)
        + totalNewJuz
        + totalOldJuz;

    return {
        newHifzPages: calculateCoveredPagesFromLogs(newHifz),
        revisionDays: new Set(recent.map((log) => dateKey(log.entry_date))).size,
        juzRevised: juzRevisedTotal,
        completedJuz,
        completionPercent: student.completed_hifz ? 100 : Math.min(100, Number(((completedJuz / 30) * 100).toFixed(2))),
    };
}

export async function getHifzStudentMonthRegister(options: {
    db: Queryable;
    studentId: string;
    month: string;
    academicYearId?: string | null;
    requestedAt?: Date;
}) {
    const { start, end, dates } = monthRange(options.month);
    const requestedAt = options.requestedAt || new Date();
    const [student, logsResult, schedules, marksResult, cancellationsResult, lifetimeNewLogsResult] = await Promise.all([
        loadStudent(options.db, options.studentId, options.academicYearId || null),
        options.db.query(
            `SELECT hl.*, recorder.name AS recorded_by_name
             FROM hifz_logs hl
             LEFT JOIN staff recorder ON recorder.id = hl.created_by
             WHERE hl.student_id = $1
               AND hl.entry_date BETWEEN $2::date AND $3::date
               AND hl.deleted_at IS NULL
             ORDER BY hl.entry_date, hl.created_at, hl.id`,
            [options.studentId, start, end],
        ),
        loadSchedules(options.db, start, end, options.academicYearId || null),
        options.db.query(
            `SELECT schedule_id, date, status, marked_by
             FROM student_attendance_marks
             WHERE student_id = $1 AND date BETWEEN $2::date AND $3::date`,
            [options.studentId, start, end],
        ),
        options.db.query(
            `SELECT schedule_id, date, cancelled_standards
             FROM attendance_cancellations
             WHERE date BETWEEN $1::date AND $2::date`,
            [start, end],
        ),
        options.db.query(
            `SELECT surah_name, start_v, end_v, entry_date
             FROM hifz_logs
             WHERE student_id = $1 AND mode = 'New Verses' AND deleted_at IS NULL`,
            [options.studentId],
        ),
    ]);
    if (!student) {
        const error: any = new Error('Student not found or inactive.');
        error.statusCode = 404;
        throw error;
    }

    // Stage is evaluated *as of the month being viewed*, not the current lifetime state.
    // A student who completes their 30th Juz on May 15 should still see the MEMORIZING
    // view for May (their transition month) — the Hafiz view only kicks in from June.
    // Past months are unaffected: they were memorizing then, so their record renders as such.
    const priorMonthLogs = lifetimeNewLogsResult.rows.filter(
        (log: any) => dateKey(log.entry_date) < start,
    );
    const throughMonthLogs = lifetimeNewLogsResult.rows.filter(
        (log: any) => dateKey(log.entry_date) <= end,
    );
    const wasHafizAtStart = countCompletedJuz(priorMonthLogs) >= 30;
    const completedJuz = countCompletedJuz(throughMonthLogs);
    if (wasHafizAtStart) {
        student.hifz_stage = 'HAFIZ_REVISION';
        student.completed_hifz = true;
    } else {
        // Force MEMORIZING for months before the student became Hafiz, even when
        // the DB stage flag says HAFIZ_REVISION. This is what makes past-month
        // views stable when a student later transitions.
        student.hifz_stage = 'MEMORIZING';
        student.completed_hifz = false;
    }

    const logsByDate = new Map<string, any[]>();
    for (const log of logsResult.rows) {
        const key = dateKey(log.entry_date);
        logsByDate.set(key, [...(logsByDate.get(key) || []), log]);
    }
    const marks = new Map<string, any>();
    const presentByDate = new Map<string, Set<string>>();
    marksResult.rows.forEach((mark) => {
        const key = dateKey(mark.date);
        marks.set(`${mark.schedule_id}|${key}`, mark);
        if (String(mark.status).toUpperCase() === 'PRESENT'
            && (!student.hifz_mentor_id || String(mark.marked_by) === String(student.hifz_mentor_id))) {
            if (!presentByDate.has(key)) presentByDate.set(key, new Set());
            presentByDate.get(key)!.add(String(mark.schedule_id));
        }
    });
    const cancellations = new Map<string, any>();
    cancellationsResult.rows.forEach((row) => cancellations.set(`${row.schedule_id}|${dateKey(row.date)}`, row));

    const now = datePartsInIndia(requestedAt);
    const days = dates.map((date) => {
        const dayLogs = logsByDate.get(date) || [];
        const existingSessionId = dayLogs.find((log) => log.session_id)?.session_id || null;
        const applicableSchedules = applicableSchedulesForStudent(schedules, student, date);
        const schedule = selectApplicableSchedule({ schedules, student, date, requestedAt, preserveSessionId: existingSessionId, presentSessionIds: presentByDate.get(date) || null });
        const cancellation = schedule ? cancellations.get(`${schedule.id}|${date}`) : null;
        const attendanceMark = schedule ? marks.get(`${schedule.id}|${date}`) : null;
        const rawStatus = attendanceMark?.status;
        const attendanceStatus = isCancellationForStudent(cancellation, student)
            ? 'CANCELLED'
            : rawStatus ? String(rawStatus).toUpperCase() : null;

        let eligibility: HifzEntryEligibility;
        if (date > now.date) {
            eligibility = { allowed: false, reason: 'Future dates cannot be recorded.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
        } else if (!schedule && applicableSchedules.length === 0 && !existingSessionId) {
            eligibility = { allowed: true, reason: null, sessionId: null, attendanceStatus: 'NOT_REQUIRED', sessionStart: null, sessionEnd: null };
        } else if (!schedule || !scheduleAppliesOn(schedule, date)) {
            eligibility = { allowed: false, reason: 'No Hifz session is available for this date.', sessionId: null, attendanceStatus: null, sessionStart: null, sessionEnd: null };
        } else if (attendanceStatus === 'CANCELLED') {
            eligibility = { allowed: false, reason: 'No Hifz session is available for this date.', sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
        } else if (!attendanceStatus) {
            eligibility = { allowed: false, reason: 'Attendance must be marked before recording Hifz.', sessionId: schedule.id, attendanceStatus: null, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
        } else if (attendanceStatus !== 'PRESENT') {
            eligibility = { allowed: false, reason: 'This student was not marked present for the current session.', sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
        } else if (student.hifz_mentor_id && String(attendanceMark?.marked_by) !== String(student.hifz_mentor_id)) {
            eligibility = { allowed: false, reason: 'The assigned mentor must mark this student PRESENT before Hifz progress can be recorded.', sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
        } else {
            eligibility = { allowed: true, reason: null, sessionId: schedule.id, attendanceStatus, sessionStart: schedule.start_time, sessionEnd: schedule.end_time };
        }

        return {
            date,
            attendance: schedule ? {
                status: attendanceStatus || 'NOT_MARKED',
                sessionId: schedule.id,
                sessionName: schedule.name,
                sessionStart: normalizedTime(schedule.start_time),
                sessionEnd: normalizedTime(schedule.end_time),
            } : null,
            eligibility,
            entries: entriesForDay(dayLogs, student.hifz_stage),
        };
    });

    return {
        student: {
            id: student.adm_no,
            name: student.name,
            admNo: student.adm_no,
            class: student.standard,
            division: student.division,
            hifzStage: student.hifz_stage,
            mentorId: student.hifz_mentor_id,
        },
        month: options.month,
        summary: monthSummary(logsResult.rows, student, completedJuz),
        days,
    };
}
