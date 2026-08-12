import { cachedResult, makeCacheKey } from './server-cache';

type Queryable = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type StudentForAttendanceReport = {
    adm_no: string;
    standard?: string | null;
    attendance_standard?: string | null;
    report_start_date?: string | null;
    report_end_date?: string | null;
    group_ids?: any[] | null;
};

export type AttendanceSessionSummary = {
    schedule_id: string;
    session: string;
    planned: number;
    cancelled: number;
    effective_total: number;
    attended: number;
    not_attended: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
    total: number;
};

export type StudentAttendanceSummary = {
    plannedClasses: number;
    cancelledClasses: number;
    effectiveClasses: number;
    pointClassDays: number;
    pointDayWeights: Record<string, number>;
    attendedClasses: number;
    weightedAttendedClasses: number;
    notAttendedClasses: number;
    presentClasses: number;
    lateClasses: number;
    absentClasses: number;
    leaveClasses: number;
    attendanceLabel: string;
    sessions: AttendanceSessionSummary[];
};

const emptySummary = (): StudentAttendanceSummary => ({
    plannedClasses: 0,
    cancelledClasses: 0,
    effectiveClasses: 0,
    pointClassDays: 0,
    pointDayWeights: {},
    attendedClasses: 0,
    weightedAttendedClasses: 0,
    notAttendedClasses: 0,
    presentClasses: 0,
    lateClasses: 0,
    absentClasses: 0,
    leaveClasses: 0,
    attendanceLabel: '-',
    sessions: [],
});

const INDIA_TIMEZONE = 'Asia/Kolkata';

function formatDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find(part => part.type === type)?.value || '';
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
    };
}

function toDateKey(value: any): string {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

    const { year, month, day } = formatDateParts(date);
    return `${year}-${month}-${day}`;
}

function dateRange(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);

    while (current <= end) {
        days.push(toDateKey(current));
        current.setDate(current.getDate() + 1);
    }

    return days;
}

function dayOfWeekFromDateKey(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    if (!year || !month || !day) return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
    return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

function normalizeScheduleStandard(label: string): string {
    const l = label.trim();
    if (l === 'Hifz Only') return 'Hifz';
    if (l === '+1 (Plus One)') return 'Plus One';
    if (l === '+2 (Plus Two)') return 'Plus Two';
    if (l.endsWith(' Standard')) return l.replace(' Standard', '');
    return l;
}

function parseStandards(value: any): string[] {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }
    return [];
}

function cancellationStandards(row: any): string[] {
    return parseStandards(row?.cancelled_standards)
        .map(normalizeScheduleStandard)
        .filter(Boolean);
}

function cancellationStudents(row: any): string[] {
    return parseStandards(row?.cancelled_students).map(String).filter(Boolean);
}

function isStandardCancelled(row: any, standard: string, studentId?: string) {
    if (!row) return false;
    const standards = cancellationStandards(row);
    const students = cancellationStudents(row);
    if (studentId && students.includes(studentId)) return true;
    if (standards.length === 0) return students.length === 0;
    return standards.includes(normalizeScheduleStandard(standard));
}

function scheduleDateTime(dateKey: string, timeValue: string) {
    return new Date(`${dateKey}T${String(timeValue || '00:00:00').slice(0, 8)}+05:30`);
}

function institutionalLeaveCancellationForStudent(schedule: any, student: StudentForAttendanceReport, dateKey: string, leaves: any[]) {
    const scheduleStart = scheduleDateTime(dateKey, schedule.start_time);
    const scheduleEnd = scheduleDateTime(dateKey, schedule.end_time);
    const scheduleStandards = parseStandards(schedule.standards).map(normalizeScheduleStandard);
    const studentStandard = normalizeScheduleStandard(String(student.attendance_standard || student.standard || '').trim());

    for (const leave of leaves) {
        const leaveStart = new Date(leave.start_datetime);
        const leaveEnd = new Date(leave.end_datetime);
        if (!(scheduleStart < leaveEnd && scheduleEnd > leaveStart)) continue;

        const targetStudents = parseStandards(leave.target_student_ids).map(String);
        if (targetStudents.length > 0 && !targetStudents.includes(student.adm_no)) continue;

        if (leave.is_entire_institution) {
            return {
                schedule_id: schedule.id,
                date: dateKey,
                cancelled_standards: null,
            };
        }

        if (targetStudents.includes(student.adm_no)) {
            return { schedule_id: schedule.id, date: dateKey, cancelled_standards: [], cancelled_students: targetStudents };
        }

        const targetStandards = parseStandards(leave.target_classes).map(normalizeScheduleStandard);
        if (!targetStandards.includes(studentStandard)) continue;

        const cancelledStandards = scheduleStandards.length > 0 && targetStandards.length < scheduleStandards.length
            ? targetStandards.filter(std => scheduleStandards.includes(std))
            : null;

        return {
            schedule_id: schedule.id,
            date: dateKey,
            cancelled_standards: cancelledStandards,
        };
    }

    return null;
}

function scheduleAppliesToDate(schedule: any, dateStr: string) {
    if (Number(schedule.day_of_week) !== dayOfWeekFromDateKey(dateStr)) return false;

    const effectiveFrom = toDateKey(schedule.effective_from);
    const effectiveUntil = toDateKey(schedule.effective_until);

    if (effectiveFrom && effectiveFrom > dateStr) return false;
    if (effectiveUntil && effectiveUntil < dateStr) return false;

    return true;
}

function scheduleAppliesToStudent(schedule: any, student: StudentForAttendanceReport) {
    const studentStandard = normalizeScheduleStandard(String(student.attendance_standard || student.standard || '').trim());
    const scheduleGroupIds = (schedule.group_ids || []).map(String).filter(Boolean);
    const studentGroupIds = (student.group_ids || []).map(String).filter(Boolean);
    if (scheduleGroupIds.length > 0) {
        return studentGroupIds.some((groupId: string) => scheduleGroupIds.includes(groupId));
    }

    const standards = parseStandards(schedule.standards).map(normalizeScheduleStandard);
    return standards.length === 0 || standards.includes(studentStandard);
}

function formatAttendanceLabel(summary: StudentAttendanceSummary) {
    if (summary.plannedClasses === 0) return '-';

    const parts: string[] = [];
    parts.push(`${summary.attendedClasses} attended`);
    parts.push(`${summary.notAttendedClasses} not attended`);
    if (summary.cancelledClasses > 0) parts.push(`${summary.cancelledClasses} cancelled`);
    return parts.join(', ');
}

function attendanceStudentsFingerprint(students: StudentForAttendanceReport[]) {
    const text = students
        .map(student => [
            student.adm_no,
            student.standard || '',
            student.attendance_standard || '',
            student.report_start_date || '',
            student.report_end_date || '',
        ].join(':'))
        .sort()
        .join('|');

    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return `${students.length}:${(hash >>> 0).toString(36)}`;
}

async function computeStudentAttendanceSummaries(
    db: Queryable,
    students: StudentForAttendanceReport[],
    startDate: string,
    endDate: string,
    classType?: string,
    academicYearId?: string | null
) {
    const summaries = new Map<string, StudentAttendanceSummary>();
    students.forEach(student => summaries.set(student.adm_no, emptySummary()));

    if (students.length === 0) return summaries;

    const params: any[] = [startDate, endDate];
    let typeClause = '';
    if (classType) {
        params.push(classType.toLowerCase() === 'madrasa' ? ['madrasa', 'madrassa'] : [classType.toLowerCase()]);
        typeClause = 'AND LOWER(a.class_type) = ANY($' + params.length + '::text[])';
    }
    let academicYearClause = '';
    if (academicYearId) {
        params.push(academicYearId);
        academicYearClause = `AND a.academic_year_id = $${params.length}`;
    }

    const [schedulesRes, studentGroupsRes, cancellationsRes, marksRes, institutionalLeavesRes] = await Promise.all([
        db.query(
            `SELECT a.id, a.class_type, a.name, a.standards, a.day_of_week, a.start_time, a.end_time, a.effective_from, a.effective_until,
                    COALESCE(array_agg(DISTINCT asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids
             FROM attendance_schedules a
             LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
             WHERE a.effective_from <= $2::date
               AND (a.effective_until IS NULL OR a.effective_until >= $1::date)
               AND (a.is_deleted = false OR a.is_deleted IS NULL)
               ${typeClause}
               ${academicYearClause}
             GROUP BY a.id`,
            params
        ),
        // Fetch ALL memberships (current + historical) that were active at any point
        // during the report period so that a student who changed groups mid-period
        // gets class days counted from both their old and new schedule.
        db.query(
            `SELECT gs.student_id, gs.group_id,
                    gs.effective_from, gs.effective_until
             FROM attendance_group_students gs
             JOIN attendance_groups g ON g.id = gs.group_id
             WHERE gs.student_id = ANY($1::text[])
               AND ($2::uuid IS NULL OR g.academic_year_id = $2::uuid)
               AND gs.effective_from <= $3::date
               AND (gs.effective_until IS NULL OR gs.effective_until >= $4::date)`,
            [students.map(student => student.adm_no), academicYearId || null, endDate, startDate]
        ),
        db.query(
            `SELECT schedule_id, date, cancelled_standards, cancelled_students
             FROM attendance_cancellations
             WHERE date >= $1::date AND date <= $2::date`,
            [startDate, endDate]
        ),
        db.query(
            `SELECT student_id, schedule_id, date, status
             FROM student_attendance_marks
             WHERE date >= $1::date
               AND date <= $2::date
               AND student_id = ANY($3::text[])`,
            [startDate, endDate, students.map(student => student.adm_no)]
        ),
        db.query(
            `SELECT id, start_datetime, end_datetime, target_classes, target_student_ids, is_entire_institution
             FROM institutional_leaves
             WHERE start_datetime < ($2::date + 1)
               AND end_datetime >= $1::date`,
            [startDate, endDate]
        ),
    ]);

    const schedulesByDay = new Map<number, any[]>();
    schedulesRes.rows.forEach(schedule => {
        const day = Number(schedule.day_of_week);
        schedulesByDay.set(day, [...(schedulesByDay.get(day) || []), schedule]);
    });

    const cancellationsByScheduleDate = new Map<string, any>();
    cancellationsRes.rows.forEach(row => {
        cancellationsByScheduleDate.set(`${row.schedule_id}|${toDateKey(row.date)}`, row);
    });

    const marksByStudentScheduleDate = new Map<string, any>();
    marksRes.rows.forEach(mark => {
        marksByStudentScheduleDate.set(`${mark.student_id}|${mark.schedule_id}|${toDateKey(mark.date)}`, mark);
    });

    // Per-student group membership history for the period.
    // Each entry carries the date range so we can resolve the correct
    // group on a given date (handles mid-period group changes).
    type GroupMembership = { group_id: string; from: string; until: string | null };
    const groupHistoryByStudent = new Map<string, GroupMembership[]>();
    studentGroupsRes.rows.forEach((row: any) => {
        const list = groupHistoryByStudent.get(row.student_id) || [];
        list.push({
            group_id: String(row.group_id),
            from: toDateKey(row.effective_from),
            until: row.effective_until ? toDateKey(row.effective_until) : null,
        });
        groupHistoryByStudent.set(row.student_id, list);
    });

    const studentById = new Map(students.map(student => [
        student.adm_no,
        {
            ...student,
            // group_memberships carries date-ranged history; group_ids is kept as
            // a flat list for the standards-fallback path in scheduleAppliesToStudent.
            group_memberships: groupHistoryByStudent.get(student.adm_no) || [],
            get group_ids() {
                return (groupHistoryByStudent.get(student.adm_no) || []).map(m => m.group_id);
            },
        },
    ]));
    const effectiveSessionsByStudentDate = new Map<string, Map<string, number>>();
    const sessionByStudentSchedule = new Map<string, AttendanceSessionSummary>();

    for (const dateStr of dateRange(startDate, endDate)) {
        const day = dayOfWeekFromDateKey(dateStr);
        const schedulesForDay = schedulesByDay.get(day) || [];

        for (const schedule of schedulesForDay) {
            if (!scheduleAppliesToDate(schedule, dateStr)) continue;

            for (const [studentId, student] of studentById) {
                if (student.report_start_date && dateStr < student.report_start_date) continue;
                if (student.report_end_date && dateStr > student.report_end_date) continue;
                // Date-aware group check: resolve which group(s) the student
                // belonged to ON THIS SPECIFIC DATE and only match schedules for
                // those groups. This correctly handles mid-period group changes
                // (e.g. moved from Division A to Division D on Aug 5: before Aug 5
                // Division A schedule counts, from Aug 5 Division D schedule counts).
                const scheduleGroupIds = (schedule.group_ids || []).map(String).filter(Boolean);
                if (scheduleGroupIds.length > 0) {
                    const activeGroupIds = (student.group_memberships || [])
                        .filter((m: GroupMembership) => m.from <= dateStr && (m.until === null || m.until >= dateStr))
                        .map((m: GroupMembership) => m.group_id);
                    const matchesGroup = activeGroupIds.some((id: string) => scheduleGroupIds.includes(id));
                    if (!matchesGroup) {
                        // Fall back: if the student has an actual mark here (legacy data
                        // or groups added before history tracking), still count the session.
                        const hasMark = marksByStudentScheduleDate.has(`${studentId}|${schedule.id}|${dateStr}`);
                        if (!hasMark) continue;
                    }
                } else if (!scheduleAppliesToStudent(schedule, student)) {
                    // Schedule uses standards (not groups) — fall back to existing logic.
                    const hasMark = marksByStudentScheduleDate.has(`${studentId}|${schedule.id}|${dateStr}`);
                    if (!hasMark) continue;
                }

                const summary = summaries.get(studentId) || emptySummary();
                const sessionKey = String(schedule.id);
                const studentSessionKey = `${studentId}|${sessionKey}`;
                let session = sessionByStudentSchedule.get(studentSessionKey);
                if (!session) {
                    session = {
                        schedule_id: sessionKey,
                        session: schedule.name || `${schedule.class_type || 'Class'} Session`,
                        planned: 0,
                        cancelled: 0,
                        effective_total: 0,
                        attended: 0,
                        not_attended: 0,
                        present: 0,
                        late: 0,
                        absent: 0,
                        leave: 0,
                        total: 0,
                    };
                    summary.sessions.push(session);
                    sessionByStudentSchedule.set(studentSessionKey, session);
                }

                summary.plannedClasses += 1;
                session.planned += 1;

                const cancellation = cancellationsByScheduleDate.get(`${schedule.id}|${dateStr}`)
                    || institutionalLeaveCancellationForStudent(schedule, student, dateStr, institutionalLeavesRes.rows);
                if (isStandardCancelled(cancellation, student.attendance_standard || student.standard || '', student.adm_no)) {
                    summary.cancelledClasses += 1;
                    session.cancelled += 1;
                    summaries.set(studentId, summary);
                    continue;
                }

                const mark = marksByStudentScheduleDate.get(`${studentId}|${schedule.id}|${dateStr}`);
                const status = String(mark?.status || '').toLowerCase();

                summary.effectiveClasses += 1;
                session.effective_total += 1;
                session.total += 1;

                if (!effectiveSessionsByStudentDate.has(studentId)) {
                    effectiveSessionsByStudentDate.set(studentId, new Map<string, number>());
                }
                const dailyCounts = effectiveSessionsByStudentDate.get(studentId)!;
                dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);

                if (status === 'present') {
                    summary.presentClasses += 1;
                    summary.attendedClasses += 1;
                    summary.weightedAttendedClasses += 1;
                    session.present += 1;
                    session.attended += 1;
                } else if (status === 'late') {
                    // A "late" mark earns only half the attendance point of a
                    // full "present" mark; still counted as attended for the
                    // raw display counts (attendedClasses / attendanceLabel).
                    summary.lateClasses += 1;
                    summary.attendedClasses += 1;
                    summary.weightedAttendedClasses += 0.5;
                    session.late += 1;
                    session.attended += 1;
                } else if (status === 'absent' || status === 'outside') {
                    summary.absentClasses += 1;
                    summary.notAttendedClasses += 1;
                    session.absent += 1;
                    session.not_attended += 1;
                } else if (status === 'leave') {
                    summary.leaveClasses += 1;
                    summary.notAttendedClasses += 1;
                    session.leave += 1;
                    session.not_attended += 1;
                } else {
                    summary.notAttendedClasses += 1;
                    session.not_attended += 1;
                }

                summaries.set(studentId, summary);
            }
        }
    }

    summaries.forEach(summary => {
        summary.attendanceLabel = formatAttendanceLabel(summary);
    });
    summaries.forEach((summary, studentId) => {
        const dailyCounts = effectiveSessionsByStudentDate.get(studentId) || new Map<string, number>();
        summary.pointDayWeights = Object.fromEntries(
            Array.from(dailyCounts.entries()).map(([date, count]) => [
                date,
                count >= 2 ? 1 : count === 1 ? 0.75 : 0,
            ])
        );
        summary.pointClassDays = Object.values(summary.pointDayWeights)
            .reduce((total, weight) => total + weight, 0);
    });

    return summaries;
}

export async function getStudentAttendanceSummaries(
    db: Queryable,
    students: StudentForAttendanceReport[],
    startDate: string,
    endDate: string,
    classType?: string,
    academicYearId?: string | null
) {
    if (students.length === 0) return new Map<string, StudentAttendanceSummary>();

    return cachedResult(
        makeCacheKey('attendance:student-summaries:v2', {
            startDate,
            endDate,
            classType: classType || 'all',
            academicYearId: academicYearId || 'legacy',
            students: attendanceStudentsFingerprint(students),
        }),
        60_000,
        () => computeStudentAttendanceSummaries(db, students, startDate, endDate, classType, academicYearId)
    );
}
