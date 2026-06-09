"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentAttendanceSummaries = getStudentAttendanceSummaries;
const server_cache_1 = require("./server-cache");
const emptySummary = () => ({
    plannedClasses: 0,
    cancelledClasses: 0,
    effectiveClasses: 0,
    pointClassDays: 0,
    attendedClasses: 0,
    notAttendedClasses: 0,
    presentClasses: 0,
    lateClasses: 0,
    absentClasses: 0,
    leaveClasses: 0,
    attendanceLabel: '-',
    sessions: [],
});
const INDIA_TIMEZONE = 'Asia/Kolkata';
function formatDateParts(date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find(part => part.type === type)?.value || '';
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
    };
}
function toDateKey(value) {
    if (!value)
        return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return value;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return String(value).slice(0, 10);
    const { year, month, day } = formatDateParts(date);
    return `${year}-${month}-${day}`;
}
function dateRange(startDate, endDate) {
    const days = [];
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (current <= end) {
        days.push(toDateKey(current));
        current.setDate(current.getDate() + 1);
    }
    return days;
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
function parseStandards(value) {
    if (Array.isArray(value))
        return value.map(String);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value || '[]');
            return Array.isArray(parsed) ? parsed.map(String) : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function cancellationStandards(row) {
    return parseStandards(row?.cancelled_standards)
        .map(normalizeScheduleStandard)
        .filter(Boolean);
}
function isStandardCancelled(row, standard) {
    if (!row)
        return false;
    const standards = cancellationStandards(row);
    if (standards.length === 0)
        return true;
    return standards.includes(normalizeScheduleStandard(standard));
}
function scheduleDateTime(dateKey, timeValue) {
    return new Date(`${dateKey}T${String(timeValue || '00:00:00').slice(0, 8)}+05:30`);
}
function institutionalLeaveCancellationForStudent(schedule, student, dateKey, leaves) {
    const scheduleStart = scheduleDateTime(dateKey, schedule.start_time);
    const scheduleEnd = scheduleDateTime(dateKey, schedule.end_time);
    const scheduleStandards = parseStandards(schedule.standards).map(normalizeScheduleStandard);
    const studentStandard = normalizeScheduleStandard(String(student.attendance_standard || student.standard || '').trim());
    for (const leave of leaves) {
        const leaveStart = new Date(leave.start_datetime);
        const leaveEnd = new Date(leave.end_datetime);
        if (!(scheduleStart < leaveEnd && scheduleEnd > leaveStart))
            continue;
        if (leave.is_entire_institution) {
            return {
                schedule_id: schedule.id,
                date: dateKey,
                cancelled_standards: null,
            };
        }
        const targetStandards = parseStandards(leave.target_classes).map(normalizeScheduleStandard);
        if (!targetStandards.includes(studentStandard))
            continue;
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
function scheduleAppliesToDate(schedule, dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (schedule.day_of_week !== date.getDay())
        return false;
    const effectiveFrom = toDateKey(schedule.effective_from);
    const effectiveUntil = toDateKey(schedule.effective_until);
    if (effectiveFrom && effectiveFrom > dateStr)
        return false;
    if (effectiveUntil && effectiveUntil < dateStr)
        return false;
    return true;
}
function scheduleAppliesToStudent(schedule, student) {
    const studentStandard = normalizeScheduleStandard(String(student.attendance_standard || student.standard || '').trim());
    const standards = parseStandards(schedule.standards).map(normalizeScheduleStandard);
    return standards.length === 0 || standards.includes(studentStandard);
}
function formatAttendanceLabel(summary) {
    if (summary.plannedClasses === 0)
        return '-';
    const parts = [];
    parts.push(`${summary.attendedClasses} attended`);
    parts.push(`${summary.notAttendedClasses} not attended`);
    if (summary.cancelledClasses > 0)
        parts.push(`${summary.cancelledClasses} cancelled`);
    return parts.join(', ');
}
function attendanceStudentsFingerprint(students) {
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
async function computeStudentAttendanceSummaries(db, students, startDate, endDate, classType) {
    const summaries = new Map();
    students.forEach(student => summaries.set(student.adm_no, emptySummary()));
    if (students.length === 0)
        return summaries;
    const params = [startDate, endDate];
    let typeClause = '';
    if (classType) {
        params.push(classType.toLowerCase());
        typeClause = `AND LOWER(class_type) = $${params.length}`;
    }
    const [schedulesRes, cancellationsRes, marksRes, institutionalLeavesRes] = await Promise.all([
        db.query(`SELECT id, class_type, name, standards, day_of_week, start_time, end_time, effective_from, effective_until
             FROM attendance_schedules
             WHERE effective_from <= $2::date
               AND (effective_until IS NULL OR effective_until >= $1::date)
               ${typeClause}`, params),
        db.query(`SELECT schedule_id, date, cancelled_standards
             FROM attendance_cancellations
             WHERE date >= $1::date AND date <= $2::date`, [startDate, endDate]),
        db.query(`SELECT student_id, schedule_id, date, status
             FROM student_attendance_marks
             WHERE date >= $1::date
               AND date <= $2::date
               AND student_id = ANY($3::text[])`, [startDate, endDate, students.map(student => student.adm_no)]),
        db.query(`SELECT id, start_datetime, end_datetime, target_classes, is_entire_institution
             FROM institutional_leaves
             WHERE start_datetime < ($2::date + 1)
               AND end_datetime >= $1::date`, [startDate, endDate]),
    ]);
    const schedulesByDay = new Map();
    schedulesRes.rows.forEach(schedule => {
        const day = Number(schedule.day_of_week);
        schedulesByDay.set(day, [...(schedulesByDay.get(day) || []), schedule]);
    });
    const cancellationsByScheduleDate = new Map();
    cancellationsRes.rows.forEach(row => {
        cancellationsByScheduleDate.set(`${row.schedule_id}|${toDateKey(row.date)}`, row);
    });
    const marksByStudentScheduleDate = new Map();
    marksRes.rows.forEach(mark => {
        marksByStudentScheduleDate.set(`${mark.student_id}|${mark.schedule_id}|${toDateKey(mark.date)}`, mark);
    });
    const studentById = new Map(students.map(student => [student.adm_no, student]));
    const effectiveSessionsByStudentDate = new Map();
    const sessionByStudentSchedule = new Map();
    for (const dateStr of dateRange(startDate, endDate)) {
        const day = new Date(`${dateStr}T00:00:00`).getDay();
        const schedulesForDay = schedulesByDay.get(day) || [];
        for (const schedule of schedulesForDay) {
            if (!scheduleAppliesToDate(schedule, dateStr))
                continue;
            for (const [studentId, student] of studentById) {
                if (student.report_start_date && dateStr < student.report_start_date)
                    continue;
                if (student.report_end_date && dateStr > student.report_end_date)
                    continue;
                if (!scheduleAppliesToStudent(schedule, student))
                    continue;
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
                if (isStandardCancelled(cancellation, student.attendance_standard || student.standard || '')) {
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
                    effectiveSessionsByStudentDate.set(studentId, new Map());
                }
                const dailyCounts = effectiveSessionsByStudentDate.get(studentId);
                dailyCounts.set(dateStr, (dailyCounts.get(dateStr) || 0) + 1);
                if (status === 'present') {
                    summary.presentClasses += 1;
                    summary.attendedClasses += 1;
                    session.present += 1;
                    session.attended += 1;
                }
                else if (status === 'late') {
                    summary.lateClasses += 1;
                    summary.attendedClasses += 1;
                    session.late += 1;
                    session.attended += 1;
                }
                else if (status === 'absent') {
                    summary.absentClasses += 1;
                    summary.notAttendedClasses += 1;
                    session.absent += 1;
                    session.not_attended += 1;
                }
                else if (status === 'leave' || status === 'outside') {
                    summary.leaveClasses += 1;
                    summary.notAttendedClasses += 1;
                    session.leave += 1;
                    session.not_attended += 1;
                }
                else {
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
        const dailyCounts = effectiveSessionsByStudentDate.get(studentId) || new Map();
        summary.pointClassDays = Array.from(dailyCounts.values()).reduce((total, count) => {
            if (count >= 2)
                return total + 1;
            if (count === 1)
                return total + 0.75;
            return total;
        }, 0);
    });
    return summaries;
}
async function getStudentAttendanceSummaries(db, students, startDate, endDate, classType) {
    if (students.length === 0)
        return new Map();
    return (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('attendance:student-summaries', {
        startDate,
        endDate,
        classType: classType || 'all',
        students: attendanceStudentsFingerprint(students),
    }), 60000, () => computeStudentAttendanceSummaries(db, students, startDate, endDate, classType));
}
