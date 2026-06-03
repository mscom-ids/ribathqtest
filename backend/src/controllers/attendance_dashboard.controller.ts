import { Request, Response } from 'express';
import { db } from '../config/db';
import { getStaffId } from '../utils/staff.utils';
import { cachedResult, getCached, invalidateCacheByPrefix, makeCacheKey, setCached } from '../utils/server-cache';
import { getMentorAccessDecision } from '../utils/mentor-access-policy';
import { getEligibleHifzStudentsForSchedule, isHifzSchedule } from '../utils/hifz-session-eligibility';

// All roles treated as a mentor (filtered access)
const MENTOR_ROLES = ['staff', 'usthad', 'mentor'];

// Helper: calculate next occurrence of a day_of_week from a given date
function getNextOccurrence(dayOfWeek: number, fromDate: Date = new Date()): string {
    const current = fromDate.getDay(); // 0=Sun, but our system: 1=Mon..6=Sat
    // Our system uses 1=Mon, 2=Tue...6=Sat, 0=Sun
    const todayDow = current; // JS getDay: 0=Sun,1=Mon...6=Sat
    let daysUntil = dayOfWeek - todayDow;
    if (daysUntil <= 0) daysUntil += 7; // Next week if today or past
    const next = new Date(fromDate);
    next.setDate(next.getDate() + daysUntil);
    return next.toISOString().split('T')[0];
}

function normalizeScheduleStandard(label: string): string {
    const l = label.trim();
    if (l === 'Hifz Only') return 'Hifz';
    if (l === '+1 (Plus One)') return 'Plus One';
    if (l === '+2 (Plus Two)') return 'Plus Two';
    if (l.endsWith(' Standard')) return l.replace(' Standard', '');
    return l;
}

function parseStandardList(value: any): string[] {
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

function normalizeStandardList(values: any[] = []) {
    return values
        .map(value => normalizeScheduleStandard(String(value || '').trim()))
        .filter(Boolean);
}

function cancellationStandards(row: any): string[] {
    return normalizeStandardList(parseStandardList(row?.cancelled_standards));
}

function isFullCancellation(row: any) {
    return !!row && cancellationStandards(row).length === 0;
}

function isStandardCancelled(row: any, standard: string) {
    if (!row) return false;
    const standards = cancellationStandards(row);
    if (standards.length === 0) return true;
    return standards.includes(normalizeScheduleStandard(standard));
}

function toDateKey(value: string | Date): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateKeysBetween(start: string, end: string): string[] {
    const dates: string[] = [];
    const cursor = new Date(`${start}T00:00:00+05:30`);
    const last = new Date(`${end}T00:00:00+05:30`);
    while (cursor <= last) {
        dates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
}

function scheduleDateTime(dateKey: string, timeValue: string) {
    return new Date(`${dateKey}T${String(timeValue || '00:00:00').slice(0, 8)}+05:30`);
}

function cancellationMeta(row: any) {
    if (!row) return { cancelReason: null, cancelType: null };
    const isInstitutional = String(row.reason || '').startsWith('Institutional Leave:');
    return {
        cancelReason: row.resolved_reason || (isInstitutional ? 'Institutional Leave' : row.reason || 'Class cancelled'),
        cancelType: isInstitutional ? 'institutional' : 'manual',
    };
}

function computeClassStatus(schedule: any, dateKey: string, cancellation: any, marked: any, now = new Date()) {
    const rawStandards = parseStandardList(schedule.standards);
    const scheduleStandards = normalizeStandardList(rawStandards);
    const cancelledStandards = cancellationStandards(cancellation);
    const fullCancellation = isFullCancellation(cancellation)
        || (scheduleStandards.length > 0 && cancelledStandards.length > 0 && scheduleStandards.every(std => cancelledStandards.includes(std)));
    const partialCancellation = !!cancellation && !fullCancellation;
    const activeStandards = partialCancellation
        ? scheduleStandards.filter(std => !cancelledStandards.includes(std))
        : scheduleStandards;
    const meta = cancellationMeta(cancellation);

    if (fullCancellation) {
        return {
            schedule_id: schedule.id,
            date: dateKey,
            status: 'cancelled',
            statusLabel: meta.cancelType === 'institutional' ? 'Cancelled by Institutional Leave' : 'Cancelled',
            isCancelled: true,
            isPartialCancellation: false,
            isInstitutionWide: cancelledStandards.length === 0,
            cancelReason: meta.cancelReason,
            cancelType: meta.cancelType,
            activeStandards: [],
            cancelledStandards,
        };
    }

    if (partialCancellation) {
        return {
            schedule_id: schedule.id,
            date: dateKey,
            status: 'partial_cancelled',
            statusLabel: 'Some Standards Cancelled',
            isCancelled: true,
            isPartialCancellation: true,
            isInstitutionWide: false,
            cancelReason: meta.cancelReason,
            cancelType: meta.cancelType,
            activeStandards,
            cancelledStandards,
        };
    }

    if (marked) {
        return {
            schedule_id: schedule.id,
            date: dateKey,
            status: 'completed',
            statusLabel: 'Completed',
            isCancelled: false,
            isPartialCancellation: false,
            isInstitutionWide: false,
            cancelReason: null,
            cancelType: null,
            activeStandards,
            cancelledStandards: [],
        };
    }

    const start = scheduleDateTime(dateKey, schedule.start_time);
    const end = scheduleDateTime(dateKey, schedule.end_time);
    const status = now < start ? 'upcoming' : (now <= end ? 'in_progress' : 'pending');
    return {
        schedule_id: schedule.id,
        date: dateKey,
        status,
        statusLabel: status === 'upcoming' ? 'Upcoming' : (status === 'in_progress' ? 'In Progress' : 'Pending Attendance'),
        isCancelled: false,
        isPartialCancellation: false,
        isInstitutionWide: false,
        cancelReason: null,
        cancelType: null,
        activeStandards,
        cancelledStandards: [],
    };
}

function institutionalLeaveCancellationForSlot(schedule: any, dateKey: string, leaves: any[]) {
    const scheduleStart = scheduleDateTime(dateKey, schedule.start_time);
    const scheduleEnd = scheduleDateTime(dateKey, schedule.end_time);
    const scheduleStandards = normalizeStandardList(parseStandardList(schedule.standards));

    for (const leave of leaves) {
        const leaveStart = new Date(leave.start_datetime);
        const leaveEnd = new Date(leave.end_datetime);
        if (!(scheduleStart < leaveEnd && scheduleEnd > leaveStart)) continue;

        let cancelledStandards: string[] | null = null;
        if (!leave.is_entire_institution) {
            const targetStandards = normalizeStandardList(parseStandardList(leave.target_classes));
            const affectedStandards = scheduleStandards.length > 0
                ? targetStandards.filter(std => scheduleStandards.includes(std))
                : targetStandards;

            if (affectedStandards.length === 0) continue;
            cancelledStandards = scheduleStandards.length > 0 && affectedStandards.length === scheduleStandards.length
                ? null
                : affectedStandards;
        }

        return {
            id: `institutional:${leave.id}:${schedule.id}:${dateKey}`,
            schedule_id: schedule.id,
            date: dateKey,
            reason: `Institutional Leave:${leave.id}`,
            resolved_reason: leave.name || 'Institutional Leave',
            cancelled_standards: cancelledStandards,
        };
    }

    return null;
}

// Maps schedule.class_type → the corresponding students.<col> column.
// Centralised so all attendance queries stay in sync.
const MENTOR_COL_MAP: Record<string, 'hifz_mentor_id' | 'school_mentor_id' | 'madrasa_mentor_id'> = {
    hifz:     'hifz_mentor_id',
    school:   'school_mentor_id',
    madrasa:  'madrasa_mentor_id',
    madrassa: 'madrasa_mentor_id',
};

type MentorCountMap = Record<'hifz' | 'school' | 'madrasa', Record<string, number>>;

// Single-query helper: returns, for one mentor, how many active students of each
// (class_type, standard) they own. Replaces the N+1 COUNT(*) loops that used to
// fire one query per schedule.
async function getMentorStudentCounts(mentorId: string): Promise<MentorCountMap> {
    const result = await db.query(
        `SELECT adm_no, standard, is_hifz, is_school, is_madrasa
         FROM (
             SELECT s.adm_no, s.standard,
                    (s.hifz_mentor_id    = $1) AS is_hifz,
                    (s.school_mentor_id  = $1) AS is_school,
                    (s.madrasa_mentor_id = $1) AS is_madrasa
             FROM students s
             WHERE s.status = 'active'
               AND s.standard IS NOT NULL
               AND (s.hifz_mentor_id = $1 OR s.school_mentor_id = $1 OR s.madrasa_mentor_id = $1)
               AND NOT EXISTS (
                   SELECT 1 FROM mentor_delegations d
                   WHERE d.from_staff_id = $1
                     AND d.status = 'approved'
                     AND (d.student_id IS NULL OR d.student_id = s.adm_no)
               )

             UNION ALL

             SELECT s.adm_no, s.standard,
                    (s.hifz_mentor_id    = d.from_staff_id) AS is_hifz,
                    (s.school_mentor_id  = d.from_staff_id) AS is_school,
                    (s.madrasa_mentor_id = d.from_staff_id) AS is_madrasa
             FROM mentor_delegations d
             JOIN students s ON (
                s.hifz_mentor_id = d.from_staff_id
                OR s.school_mentor_id = d.from_staff_id
                OR s.madrasa_mentor_id = d.from_staff_id
             )
             WHERE d.to_staff_id = $1
               AND d.status = 'approved'
               AND (d.student_id IS NULL OR d.student_id = s.adm_no)
               AND s.status = 'active'
               AND s.standard IS NOT NULL
         ) assigned`,
        [mentorId]
    );

    const counts: MentorCountMap = { hifz: {}, school: {}, madrasa: {} };
    const seen = { hifz: new Set<string>(), school: new Set<string>(), madrasa: new Set<string>() };
    for (const row of result.rows) {
        const std = row.standard;
        if (row.is_hifz && !seen.hifz.has(`${std}|${row.adm_no}`)) {
            seen.hifz.add(`${std}|${row.adm_no}`);
            counts.hifz[std] = (counts.hifz[std] || 0) + 1;
        }
        if (row.is_school && !seen.school.has(`${std}|${row.adm_no}`)) {
            seen.school.add(`${std}|${row.adm_no}`);
            counts.school[std] = (counts.school[std] || 0) + 1;
        }
        if (row.is_madrasa && !seen.madrasa.has(`${std}|${row.adm_no}`)) {
            seen.madrasa.add(`${std}|${row.adm_no}`);
            counts.madrasa[std] = (counts.madrasa[std] || 0) + 1;
        }
    }
    return counts;
}

// Sum students-per-standard for a schedule's normalised standards.
function countStudentsForSchedule(
    schedule: any,
    counts: MentorCountMap
): number {
    const classType = (schedule.class_type || '').toLowerCase();
    const mentorCol = MENTOR_COL_MAP[classType];
    if (!mentorCol) return 0;

    // class_type → which bucket to look in; "madrassa" maps to madrasa.
    const bucket: 'hifz' | 'school' | 'madrasa' =
        classType === 'school' ? 'school' :
        (classType === 'madrasa' || classType === 'madrassa') ? 'madrasa' :
        'hifz';

    const rawStds: string[] = typeof schedule.standards === 'string'
        ? JSON.parse(schedule.standards || '[]')
        : (schedule.standards || []);

    let total = 0;
    for (const raw of rawStds) {
        const std = normalizeScheduleStandard(raw);
        total += counts[bucket][std] || 0;
    }
    return total;
}

async function countStudentsForScheduleWithRules(
    schedule: any,
    counts: MentorCountMap,
    mentorId?: string | null,
    academicYearId?: string | null,
    date?: string | null,
) {
    if (isHifzSchedule(schedule) && academicYearId) {
        const eligible = await getEligibleHifzStudentsForSchedule({
            schedule,
            academicYearId,
            mentorId,
            date,
        });
        if (eligible.usedRules && eligible.students) return eligible.students.length;
    }
    return countStudentsForSchedule(schedule, counts);
}

export const getSchedules = async (req: Request, res: Response) => {
    try {
        const { academic_year_id, show_inactive } = req.query;
        const user = (req as any).user;
        const isMentor = MENTOR_ROLES.includes(user?.role);
        const mentorId = isMentor ? await getStaffId(req) : null;
        if (isMentor && !mentorId) {
            return res.json({ success: true, data: [] });
        }

        const cacheKey = makeCacheKey('attendance:schedules', {
            academic_year_id: academic_year_id || '',
            show_inactive: show_inactive === 'true' ? 'true' : 'false',
            role: user?.role || '',
            staff: mentorId || 'all',
        });
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            return res.json({ success: true, data: cached });
        }

        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo,
                            c.name as class_setup_name, c.standard as class_standard,
                            c.section as class_section, c.type as class_department
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id
                     LEFT JOIN classes c ON a.class_id = c.id`;
        const conditions: string[] = [];
        const params: any[] = [];
        let paramCount = 1;
        
        if (academic_year_id) {
            conditions.push(`(a.academic_year_id = $${paramCount} OR a.academic_year_id IS NULL)`);
            params.push(academic_year_id);
            paramCount++;
        }

        // By default only show active (non-deleted) schedules
        if (show_inactive !== 'true') {
            conditions.push(`(a.is_deleted = false OR a.is_deleted IS NULL)`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ` + conditions.join(' AND ');
        }
        query += ` ORDER BY day_of_week, start_time`;

        const result = await db.query(query, params);
        const schedules = result.rows;

        if (isMentor) {
            // ONE query for all mentor↔standard counts, then in-memory lookup
            // per schedule. Replaces the previous N+1 COUNT(*) loop.
            const counts = await getMentorStudentCounts(mentorId!);

            const filteredSchedules = (await Promise.all(schedules.map(async schedule => ({
                ...schedule,
                student_count: await countStudentsForScheduleWithRules(schedule, counts, mentorId, academic_year_id as string | undefined),
            })))).filter(s => s.student_count > 0);

            setCached(cacheKey, filteredSchedules, 5 * 60_000);
            return res.json({ success: true, data: filteredSchedules });
        }

        // For Admins/Principals, attach expected mentors to each schedule
        const studentsRes = await db.query(
            `SELECT standard, hifz_mentor_id, school_mentor_id, madrasa_mentor_id FROM students WHERE status = 'active' AND standard IS NOT NULL`
        );
        const staffRes = await db.query(`SELECT id, name FROM staff`);
        const staffMap = new Map(staffRes.rows.map((s: any) => [s.id, s.name]));

        const schedulesWithMentors = schedules.map(schedule => {
            const classType = (schedule.class_type || '').toLowerCase();
            const mentorCol = MENTOR_COL_MAP[classType === 'madrassa' ? 'madrasa' : classType];
            const rawStds = typeof schedule.standards === 'string' ? JSON.parse(schedule.standards || '[]') : (schedule.standards || []);
            const dbStds = rawStds.map(normalizeScheduleStandard);
            const mentorStandards = new Map<string, Set<string>>();

            if (mentorCol) {
                for (const student of studentsRes.rows) {
                    if (dbStds.includes(student.standard)) {
                        const mid = student[mentorCol];
                        if (mid) {
                            if (!mentorStandards.has(mid)) mentorStandards.set(mid, new Set<string>());
                            mentorStandards.get(mid)!.add(student.standard);
                        }
                    }
                }
            }

            return {
                ...schedule,
                expected_mentors: Array.from(mentorStandards.entries()).map(([id, standards]) => ({
                    id,
                    name: staffMap.get(id) || 'Unknown',
                    standards: Array.from(standards),
                }))
            };
        });

        setCached(cacheKey, schedulesWithMentors, 5 * 60_000);
        res.json({ success: true, data: schedulesWithMentors });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Returns schedules active on a specific date (used by mentor attendance page)
export const getSchedulesForDate = async (req: Request, res: Response) => {
    try {
        const { date, academic_year_id } = req.query;
        if (!date) return res.status(400).json({ success: false, error: 'date is required (YYYY-MM-DD)' });

        const targetDate = new Date(date as string);
        const dayOfWeek = targetDate.getDay(); // 0=Sun,1=Mon...6=Sat
        const user = (req as any).user;

        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo,
                            c.name as class_setup_name, c.standard as class_standard,
                            c.section as class_section, c.type as class_department
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id
                     LEFT JOIN classes c ON a.class_id = c.id
                     WHERE a.day_of_week = $1
                       AND (a.is_deleted = false OR a.is_deleted IS NULL)
                       AND a.effective_from <= $2
                       AND (a.effective_until IS NULL OR a.effective_until >= $2)`;
        const params: any[] = [dayOfWeek, date];
        let paramCount = 3;

        if (academic_year_id) {
            query += ` AND a.academic_year_id = $${paramCount}`;
            params.push(academic_year_id);
            paramCount++;
        }

        query += ` ORDER BY a.start_time`;

        const result = await db.query(query, params);

        // ── For mentor roles: filter to only schedules where they have students ──
        if (MENTOR_ROLES.includes(user?.role)) {
            const mentorId = await getStaffId(req);
            if (!mentorId) return res.json({ success: true, data: [] });

            // ONE query, then in-memory filter. See getMentorStudentCounts.
            const counts = await getMentorStudentCounts(mentorId);

            const filteredSchedules = (await Promise.all(result.rows.map(async (schedule: any) => ({
                ...schedule,
                student_count: await countStudentsForScheduleWithRules(schedule, counts, mentorId, academic_year_id as string | undefined, date as string),
            })))).filter((s: any) => s.student_count > 0);

            return res.json({ success: true, data: filteredSchedules });
        }

        // For Admins/Principals, attach expected mentors to each schedule
        const studentsRes = await db.query(
            `SELECT standard, hifz_mentor_id, school_mentor_id, madrasa_mentor_id FROM students WHERE status = 'active' AND standard IS NOT NULL`
        );
        const staffRes = await db.query(`SELECT id, name FROM staff`);
        const staffMap = new Map(staffRes.rows.map((s: any) => [s.id, s.name]));

        const schedulesWithMentors = result.rows.map((schedule: any) => {
            const classType = (schedule.class_type || '').toLowerCase();
            const mentorCol = MENTOR_COL_MAP[classType === 'madrassa' ? 'madrasa' : classType];
            const rawStds = typeof schedule.standards === 'string' ? JSON.parse(schedule.standards || '[]') : (schedule.standards || []);
            const dbStds = rawStds.map(normalizeScheduleStandard);
            const mentorStandards = new Map<string, Set<string>>();

            if (mentorCol) {
                for (const student of studentsRes.rows) {
                    if (dbStds.includes(student.standard)) {
                        const mid = student[mentorCol];
                        if (mid) {
                            if (!mentorStandards.has(mid)) mentorStandards.set(mid, new Set<string>());
                            mentorStandards.get(mid)!.add(student.standard);
                        }
                    }
                }
            }

            return {
                ...schedule,
                expected_mentors: Array.from(mentorStandards.entries()).map(([id, standards]) => ({
                    id,
                    name: staffMap.get(id) || 'Unknown',
                    standards: Array.from(standards),
                }))
            };
        });

        res.json({ success: true, data: schedulesWithMentors });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createSchedule = async (req: Request, res: Response) => {
    try {
        const { class_id, academic_year_id, class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from } = req.body;

        // Auto-calculate effective_from: next occurrence of the selected day
        const startDate = effective_from || getNextOccurrence(day_of_week);
        let effectiveClassType = class_type;
        let effectiveName = name || null;
        let effectiveStandards = Array.isArray(standards) ? standards : [];

        if (class_id) {
            const classRes = await db.query(
                `SELECT id, name, type, standard, section
                 FROM classes
                 WHERE id = $1
                   AND ($2::uuid IS NULL OR academic_year_id = $2::uuid)
                   AND COALESCE(is_archived, false) = false`,
                [class_id, academic_year_id || null]
            );
            if (classRes.rows.length === 0) {
                return res.status(400).json({ success: false, error: 'Select a valid active class before creating timetable.' });
            }
            const classRow = classRes.rows[0];
            effectiveClassType = String(classRow.type || '').toLowerCase();
            effectiveName = name || classRow.name;
            effectiveStandards = [classRow.standard].filter(Boolean);
        }

        if (!effectiveClassType || effectiveStandards.length === 0) {
            return res.status(400).json({ success: false, error: 'Class and standard are required.' });
        }

        // Conflict Validator: only check against active (non-deleted) schedules
        const existingSchedules = await db.query(
            `SELECT * FROM attendance_schedules 
             WHERE day_of_week = $1 
               AND (is_deleted = false OR is_deleted IS NULL)
               AND (effective_until IS NULL OR effective_until >= $2)`,
            [day_of_week, startDate]
        );

        for (const existing of existingSchedules.rows) {
            if (start_time < existing.end_time && end_time > existing.start_time) {
                if (class_id && existing.class_id && existing.class_id !== class_id) {
                    continue;
                }
                const extStds = typeof existing.standards === 'string' ? JSON.parse(existing.standards || '[]') : existing.standards;
                const reqStds = effectiveStandards;
                
                const collision = reqStds.find((s: string) => extStds.includes(s));
                if (collision) {
                    return res.status(400).json({
                        success: false,
                        error: `Time Conflict: '${collision}' is already assigned to a ${existing.class_type} slot during this time.`
                    });
                }
            }
        }

        const result = await db.query(
            `INSERT INTO attendance_schedules (class_id, academic_year_id, class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [class_id || null, academic_year_id || null, effectiveClassType, effectiveName, JSON.stringify(effectiveStandards), day_of_week, start_time, end_time, duration_mins, startDate]
        );
        invalidateCacheByPrefix('attendance:');
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteSchedule = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const today = new Date().toISOString().split('T')[0];
        
        // Soft-delete: set effective_until to today and mark as deleted
        // This preserves all past attendance data
        await db.query(
            `UPDATE attendance_schedules 
             SET effective_until = $1, is_deleted = true 
             WHERE id = $2`,
            [today, id]
        );
        invalidateCacheByPrefix('attendance:');
        res.json({ success: true, message: 'Schedule deactivated. Past attendance data preserved.' });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) return res.status(400).json({ success: false, error: "Dates required" });

        const user = (req as any).user;
        const mentorId = MENTOR_ROLES.includes(user?.role) ? await getStaffId(req) : null;
        const dashboardCacheKey = makeCacheKey('attendance:dashboard', {
            start_date,
            end_date,
            role: user?.role || '',
            staff: MENTOR_ROLES.includes(user?.role) ? (mentorId || user.id || '') : 'all',
        });
        const cachedDashboard = getCached<any>(dashboardCacheKey);
        if (cachedDashboard) {
            return res.json({ success: true, ...cachedDashboard });
        }

        const cancelsPromise = db.query(
            `SELECT c.*,
                    COALESCE(il.name, CASE WHEN c.reason LIKE 'Institutional Leave:%' THEN 'Institutional Leave' ELSE c.reason END) AS resolved_reason
             FROM attendance_cancellations c
             LEFT JOIN institutional_leaves il ON c.reason = ('Institutional Leave:' || il.id::text)
             WHERE c.date >= $1 AND c.date <= $2`,
            [start_date, end_date]
        );

        let marksPromise: Promise<{ rows: any[] }>;
        if (MENTOR_ROLES.includes(user?.role)) {
            // Mentors only see their own marks — so "Marked" status is per-mentor
            marksPromise = db.query(
                'SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2 AND marked_by = $3',
                [start_date, end_date, mentorId || user.id]
            );
        } else {
            // Admin/Principal: see all marks (session shown as completed if anyone marked it)
            marksPromise = db.query(
                'SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2',
                [start_date, end_date]
            );
        }

        const schedulesPromise = db.query(
            `SELECT id, standards, day_of_week, start_time, end_time
             FROM attendance_schedules
             WHERE (is_deleted = false OR is_deleted IS NULL)
               AND effective_from <= $2::date
               AND (effective_until IS NULL OR effective_until >= $1::date)`,
            [start_date, end_date]
        );
        const institutionalLeavesPromise = db.query(
            `SELECT id, name, start_datetime, end_datetime, target_classes, is_entire_institution
             FROM institutional_leaves
             WHERE start_datetime < ($2::date + 1)
               AND end_datetime >= $1::date`,
            [start_date, end_date]
        );

        const [cancels, marksQuery, schedulesQuery, institutionalLeavesQuery] = await Promise.all([
            cancelsPromise,
            marksPromise,
            schedulesPromise,
            institutionalLeavesPromise,
        ]);
        const cancellationBySlot = new Map(cancels.rows.map((row: any) => [`${row.schedule_id}:${toDateKey(row.date)}`, row]));
        const markBySlot = new Map(marksQuery.rows.map((row: any) => [`${row.schedule_id}:${toDateKey(row.date)}`, row]));
        const classStatuses: any[] = [];
        const virtualCancellations: any[] = [];

        for (const dateKey of dateKeysBetween(String(start_date), String(end_date))) {
            const dayOfWeek = new Date(`${dateKey}T12:00:00+05:30`).getDay();
            for (const schedule of schedulesQuery.rows) {
                if (Number(schedule.day_of_week) !== dayOfWeek) continue;
                const slotKey = `${schedule.id}:${dateKey}`;
                const cancellation = cancellationBySlot.get(slotKey)
                    || institutionalLeaveCancellationForSlot(schedule, dateKey, institutionalLeavesQuery.rows);
                if (cancellation && !cancellationBySlot.has(slotKey)) {
                    virtualCancellations.push(cancellation);
                }
                classStatuses.push(computeClassStatus(
                    schedule,
                    dateKey,
                    cancellation,
                    markBySlot.get(slotKey)
                ));
            }
        }

        const stats = classStatuses.reduce((acc: any, item: any) => {
            acc.total += 1;
            if (item.status === 'completed') acc.completed += 1;
            else if (item.status === 'cancelled') {
                acc.cancelled += 1;
                if (item.cancelType === 'institutional') acc.institutionalCancelled += 1;
                else acc.manualCancelled += 1;
            } else if (item.status === 'partial_cancelled') {
                acc.partialCancelled += 1;
                if (item.cancelType === 'institutional') acc.institutionalCancelled += 1;
                else acc.manualCancelled += 1;
            } else {
                acc.pending += 1;
            }
            return acc;
        }, {
            total: 0,
            completed: 0,
            pending: 0,
            cancelled: 0,
            partialCancelled: 0,
            institutionalCancelled: 0,
            manualCancelled: 0,
        });

        const dashboardPayload = {
            cancellations: [...cancels.rows, ...virtualCancellations],
            marks: marksQuery.rows,
            class_statuses: classStatuses,
            stats,
        };
        setCached(dashboardCacheKey, dashboardPayload, 30_000);

        res.json({
            success: true,
            ...dashboardPayload
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// Returns which schedule IDs are relevant for a given mentor
// by checking which standards their assigned students are in
export const getMentorSchedules = async (req: Request, res: Response) => {
    try {
        let { mentor_id, academic_year_id } = req.query;
        const user = (req as any).user;
        if (user.role === 'staff') {
            const resolvedId = await getStaffId(req);
            if (resolvedId) mentor_id = resolvedId;
        }

        if (!mentor_id) return res.status(400).json({ success: false, error: "mentor_id required" });

        // Get all distinct standards this mentor's students are in (across all 3 mentor types)
        const studentStds = await db.query(
            `SELECT DISTINCT standard FROM students
             WHERE status = 'active' AND standard IS NOT NULL
               AND (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1)`,
            [mentor_id]
        );
        const mentorStudentStds = studentStds.rows.map((r: any) => r.standard); // e.g. ["Plus One", "Plus Two"]

        if (mentorStudentStds.length === 0) {
            return res.json({ success: true, schedule_ids: [], mentor_standards: [] });
        }

        // Get all active (non-deleted) schedules for this academic year
        let schedQuery = 'SELECT id, standards, class_type FROM attendance_schedules WHERE (is_deleted = false OR is_deleted IS NULL)';
        const params: any[] = [];
        if (academic_year_id) {
            schedQuery += ' AND (academic_year_id = $1 OR academic_year_id IS NULL)';
            params.push(academic_year_id);
        }
        const allScheds = await db.query(schedQuery, params);

        // ONE query for all per-(class_type, standard) counts; then a pure
        // in-memory filter. Replaces N COUNT(*) queries.
        const counts = await getMentorStudentCounts(mentor_id as string);

        const relevantIds = (await Promise.all(allScheds.rows.map(async (sched: any) => ({
            id: sched.id,
            count: await countStudentsForScheduleWithRules(sched, counts, mentor_id as string, academic_year_id as string | undefined),
        }))))
            .filter((sched: any) => sched.count > 0)
            .map((sched: any) => sched.id);

        res.json({ success: true, schedule_ids: relevantIds, mentor_standards: mentorStudentStds });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getStudentsForSchedule = async (req: Request, res: Response) => {
    try {
        let { schedule_id, date, mentor_id, academic_year_id } = req.query;
        const user = (req as any).user;

        if (!schedule_id) return res.status(400).json({ success: false, error: "schedule_id required" });

        // ── Phase 1 (parallel): resolve mentor id + load schedule ──
        // Previously these were sequential awaits even though the schedule
        // lookup doesn't depend on the staff id at all.
        const isMentorRole = MENTOR_ROLES.includes(user?.role);
        const [resolvedMentorId, schedRes, cancellationRes] = await Promise.all([
            isMentorRole ? getStaffId(req) : Promise.resolve(null),
            db.query(
                'SELECT id, name, standards, class_type, start_time, end_time, academic_year_id FROM attendance_schedules WHERE id = $1',
                [schedule_id]
            ),
            date
                ? db.query('SELECT * FROM attendance_cancellations WHERE schedule_id = $1 AND date = $2', [schedule_id, date])
                : Promise.resolve({ rows: [] as any[] }),
        ]);

        if (isMentorRole && resolvedMentorId) {
            mentor_id = resolvedMentorId;
        }

        if (schedRes.rows.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });

        const schedule = schedRes.rows[0];
        const rawStds: string[] = typeof schedule.standards === 'string'
            ? JSON.parse(schedule.standards || '[]')
            : (schedule.standards || []);
        const classType = (schedule.class_type || '').toLowerCase();
        const sessionStartStr = schedule.start_time; // 'HH:mm:ss'
        const sessionEndStr = schedule.end_time; // 'HH:mm:ss'
        const effectiveAcademicYearId = (academic_year_id as string) || schedule.academic_year_id || null;

        // Normalize schedule pill-labels → actual student DB values
        const dbStds = rawStds.map(normalizeScheduleStandard);
        const cancellation = cancellationRes.rows[0] || null;
        const activeDbStds = cancellation
            ? dbStds.filter(std => !isStandardCancelled(cancellation, std))
            : dbStds;

        if (date && cancellation && activeDbStds.length === 0) {
            return res.json({
                success: true,
                students: [],
                cancellation: {
                    is_cancelled: true,
                    cancelled_standards: cancellationStandards(cancellation),
                    reason: cancellation.reason,
                },
            });
        }

        const mentorCol = MENTOR_COL_MAP[classType];

        let permanentStudents: any[] = [];
        let delegatedStudents: any[] = [];
        const ruleEligible = await getEligibleHifzStudentsForSchedule({
            schedule,
            academicYearId: effectiveAcademicYearId,
            date: date as string | undefined,
            mentorId: mentor_id as string | undefined,
        });

        if (ruleEligible.usedRules && ruleEligible.students) {
            permanentStudents = ruleEligible.students
                .filter((s: any) => !cancellation || !isStandardCancelled(cancellation, s.standard))
                .map((s: any) => ({ ...s, is_temp: false }));
        } else if (mentor_id && mentorCol) {
            // ── Phase 2 (parallel): permanent students + delegated students ──
            // These two queries are independent — running them serially
            // doubled the round-trip cost for no reason.
            const [permRes, delRes] = await Promise.all([
                db.query(
                    `SELECT adm_no, name, standard, photo_url
                     FROM students
                     WHERE status = 'active'
                       AND standard = ANY($1)
                       AND ${mentorCol} = $2
                       AND NOT EXISTS (
                           SELECT 1 FROM mentor_delegations d
                           WHERE d.from_staff_id = $2
                             AND d.status = 'approved'
                             AND (d.student_id IS NULL OR d.student_id = students.adm_no)
                       )
                     ORDER BY standard, name`,
                    [activeDbStds, mentor_id]
                ),
                db.query(
                    `WITH incoming_delegations AS (
                        SELECT from_staff_id, student_id
                        FROM mentor_delegations
                        WHERE to_staff_id = $1
                          AND status = 'approved'
                     )
                     SELECT s.adm_no, s.name, s.standard, s.photo_url
                     FROM incoming_delegations d
                     JOIN students s ON s.${mentorCol} = d.from_staff_id
                     WHERE (d.student_id IS NULL OR d.student_id = s.adm_no)
                       AND s.status = 'active'
                       AND s.standard = ANY($2)
                     ORDER BY s.name`,
                    [mentor_id, activeDbStds]
                ).catch((delErr: any) => {
                    console.warn('Delegation query skipped:', delErr.message);
                    return { rows: [] as any[] };
                }),
            ]);

            permanentStudents = permRes.rows.map((s: any) => ({ ...s, is_temp: false }));
            const permIds = new Set(permanentStudents.map((s: any) => s.adm_no));
            delegatedStudents = delRes.rows
                .filter((s: any) => !permIds.has(s.adm_no))
                .map((s: any) => ({ ...s, is_temp: true }));
        } else {
            // Admin/principal: return all students unfiltered
            const allRes = await db.query(
                `SELECT adm_no, name, standard, photo_url
                 FROM students
                 WHERE status = 'active' AND standard = ANY($1)
                 ORDER BY standard, name`,
                [activeDbStds]
            );
            permanentStudents = allRes.rows.map((s: any) => ({ ...s, is_temp: false }));
        }

        const students = [...permanentStudents, ...delegatedStudents];

        let studentsWithLeave = students;
        if (students.length > 0 && date) {
            try {
                const studentIds = students.map((s: any) => s.adm_no);
                // Phase 3: leave overlap check. Fetch all leaves touching this date,
                // then compare the leave interval against the specific class interval.
                const leavesRes = await db.query(
                    `SELECT student_id, start_datetime, end_datetime, actual_return_datetime, status
                     FROM student_leaves
                     WHERE student_id = ANY($1)
                       AND (
                         (status = 'approved'
                            AND start_datetime <  ($2::date + 1)
                            AND end_datetime   >= $2::date)
                         OR
                         (status = 'outside'
                            AND start_datetime <  ($2::date + 1))
                         OR
                         (status IN ('returned', 'completed')
                            AND start_datetime <  ($2::date + 1)
                            AND COALESCE(actual_return_datetime, end_datetime) >= $2::date)
                       )
                     ORDER BY start_datetime DESC`,
                    [studentIds, date]
                );
                
                const leavesByStudent = new Map<string, any[]>();
                for (const r of leavesRes.rows) {
                    const leaves = leavesByStudent.get(r.student_id) || [];
                    leaves.push(r);
                    leavesByStudent.set(r.student_id, leaves);
                }

                const sessionStartDateTimeObj = new Date(`${date}T${sessionStartStr || '00:00:00'}+05:30`);
                const sessionEndDateTimeObj = new Date(`${date}T${sessionEndStr || '23:59:00'}+05:30`);

                studentsWithLeave = students.map((s: any) => {
                    const leaves = leavesByStudent.get(s.adm_no) || [];
                    let isLockedOutside = false;
                    let wentOutsideLater = false;
                    let relevantLeave: any = null;

                    for (const leave of leaves) {
                        const leaveStartObj = new Date(leave.start_datetime);
                        const leaveReturnObj = leave.actual_return_datetime || leave.end_datetime
                            ? new Date(leave.actual_return_datetime || leave.end_datetime)
                            : null;
                        const overlapsSession = leaveStartObj < sessionEndDateTimeObj
                            && (!leaveReturnObj || leaveReturnObj > sessionStartDateTimeObj);

                        if (overlapsSession) {
                            isLockedOutside = true;
                            relevantLeave = leave;
                            break;
                        }
                        if (leaveStartObj >= sessionEndDateTimeObj && !wentOutsideLater) {
                            wentOutsideLater = true;
                            relevantLeave = leave;
                        }
                    }

                    return {
                        ...s,
                        is_locked_outside: isLockedOutside,
                        went_outside_later: wentOutsideLater,
                        leave_start_time: relevantLeave?.start_datetime || null,
                        is_on_leave: isLockedOutside, // backwards compat
                        attendance_status: isLockedOutside ? 'outside' : 'pending' // backwards compat
                    };
                });
            } catch (leaveErr: any) {
                console.warn('Leave check failed:', leaveErr.message);
            }
        }

        res.json({ success: true, students: studentsWithLeave });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
};


export const markAttendance = async (req: Request, res: Response) => {
    try {
        // Now handles a bulk payload of student_marks
        const { schedule_id, date, student_marks, on_behalf_of } = req.body;
        const userRole = (req as any).user.role;
        const userId = (req as any).user.id;
        const staffId = await getStaffId(req); // Resolve the actual staff ID

        // If an admin/principal is marking on behalf of a specific mentor,
        // store the mark under the mentor's ID so their portal shows it as "Marked"
        const ADMIN_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
        const effectiveMarkedBy = ADMIN_ROLES.includes(userRole) && on_behalf_of ? on_behalf_of : (staffId || userId);

        const schedRes = await db.query('SELECT * FROM attendance_schedules WHERE id = $1', [schedule_id]);
        if (schedRes.rows.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
        const schedule = schedRes.rows[0];

        // ── Security Guard: mentor roles may only mark their own students ──
        if (MENTOR_ROLES.includes(userRole) && student_marks?.length > 0) {
            if (staffId) {
                const classType = (schedule.class_type || '').toLowerCase();
                const mentorColMap: Record<string, string> = {
                    hifz:     'hifz_mentor_id',
                    school:   'school_mentor_id',
                    madrasa:  'madrasa_mentor_id',
                    madrassa: 'madrasa_mentor_id',
                };
                const mentorCol = mentorColMap[classType];
                const submittedIds: string[] = student_marks.map((m: any) => m.student_id);

                if (mentorCol) {
                    // Fetch permanently assigned students
                    const permRes = await db.query(
                        `SELECT adm_no
                         FROM students
                         WHERE adm_no = ANY($1)
                           AND ${mentorCol} = $2
                           AND NOT EXISTS (
                               SELECT 1 FROM mentor_delegations d
                               WHERE d.from_staff_id = $2
                                 AND d.status = 'approved'
                                 AND (d.student_id IS NULL OR d.student_id = students.adm_no)
                           )`,
                        [submittedIds, staffId]
                    );
                    const permIds = new Set(permRes.rows.map((r: any) => r.adm_no));

                    // Fetch delegated students (from mentors who delegated TO the current mentor)
                    let delegatedIds = new Set<string>();
                    try {
                        const delRes = await db.query(
                            `WITH incoming_delegations AS (
                                SELECT from_staff_id, student_id
                                FROM mentor_delegations
                                WHERE to_staff_id = $1
                                  AND status = 'approved'
                             )
                             SELECT s.adm_no
                             FROM incoming_delegations d
                             JOIN students s ON s.${mentorCol} = d.from_staff_id
                             WHERE (d.student_id IS NULL OR d.student_id = s.adm_no)
                               AND s.adm_no = ANY($2)`,
                            [staffId, submittedIds]
                        );
                        delegatedIds = new Set(delRes.rows.map((r: any) => r.adm_no));
                    } catch (delErr: any) {
                        console.warn('Delegation check skipped:', delErr.message);
                    }

                    const unauthorizedIds = submittedIds.filter(
                        (id: string) => !permIds.has(id) && !delegatedIds.has(id)
                    );

                    if (unauthorizedIds.length > 0) {
                        return res.status(403).json({
                            success: false,
                            error: `Access denied: Not assigned to student(s): ${unauthorizedIds.join(', ')}`
                        });
                    }
                }
            }
        }

        const cancelCheck = await db.query('SELECT * FROM attendance_cancellations WHERE schedule_id = $1 AND date = $2', [schedule_id, date]);
        const cancellation = cancelCheck.rows[0] || null;
        if (isFullCancellation(cancellation)) {
            return res.status(400).json({ success: false, error: "Cannot mark attendance for a cancelled class" });
        }
        if (cancellation && student_marks?.length > 0) {
            const submittedIds: string[] = student_marks.map((m: any) => m.student_id);
            const submittedStudents = await db.query(
                `SELECT adm_no, standard
                 FROM students
                 WHERE adm_no = ANY($1::text[])`,
                [submittedIds]
            );
            const cancelledStudent = submittedStudents.rows.find((student: any) =>
                isStandardCancelled(cancellation, student.standard)
            );
            if (cancelledStudent) {
                return res.status(400).json({
                    success: false,
                    error: `Cannot mark attendance for cancelled standard: ${cancelledStudent.standard}`,
                });
            }
        }

        const classDateTimeStr = `${date}T${schedule.start_time}+05:30`;
        const classDateObj = new Date(classDateTimeStr);
        const now = new Date();
        
        if (now < classDateObj) return res.status(400).json({ success: false, error: "Cannot mark attendance before the class starts" });

        if (MENTOR_ROLES.includes(userRole)) {
            const access = await getMentorAccessDecision('attendance', date);
            if (!access.allowed) {
                return res.status(403).json({
                    success: false,
                    error: access.reason || 'Attendance is locked for this date.',
                    access_policy: access,
                });
            }
        }

        // ── Transaction: must use a single client; db.query() goes through the
        // pool and would route BEGIN/COMMIT to different connections than the
        // INSERTs, silently breaking atomicity.
        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // Bulk-insert all student marks in ONE round trip via unnest()
            // (replaces the previous per-student loop = N round trips).
            if (student_marks && Array.isArray(student_marks) && student_marks.length > 0) {
                const studentIds = student_marks.map((m: any) => m.student_id);
                const statuses   = student_marks.map((m: any) => m.status);

                await client.query(
                    `INSERT INTO student_attendance_marks
                         (schedule_id, student_id, date, status, marked_by)
                     SELECT $1::uuid, sid, $2::date, st, $3::uuid
                     FROM unnest($4::text[], $5::text[]) AS t(sid, st)
                     ON CONFLICT (schedule_id, student_id, date) DO UPDATE
                     SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by`,
                    [schedule_id, date, effectiveMarkedBy, studentIds, statuses]
                );
            }

            // Auto shadow-mark Mentor Staff record
            await client.query(
                `INSERT INTO staff_attendance (staff_id, date, status)
                 VALUES ($1, $2, 'present')
                 ON CONFLICT (staff_id, date) DO UPDATE SET status = 'present'`,
                [staffId || userId, date]
            );

            // Record the Master Class Completion Marker — scoped per mentor
            const result = await client.query(
                `INSERT INTO attendance_marks (schedule_id, date, marked_by, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (schedule_id, date, marked_by) DO UPDATE SET updated_at = NOW() RETURNING *`,
                [schedule_id, date, effectiveMarkedBy]
            );

            await client.query('COMMIT');
            invalidateCacheByPrefix('attendance:');
            invalidateCacheByPrefix('reports:mentors');
            invalidateCacheByPrefix('reports:students');
            res.json({ success: true, data: result.rows[0] });
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const cancelSession = async (req: Request, res: Response) => {
    try {
        const { schedule_id, date, reason, standards } = req.body;
        const userId = (req as any).user.id;
        const userRole = String((req as any).user.role || '').toLowerCase();

        if (!['admin', 'principal', 'vice_principal', 'controller'].includes(userRole)) {
            return res.status(403).json({ success: false, error: "Only Authorities can cancel a class." });
        }

        const schedRes = await db.query('SELECT standards FROM attendance_schedules WHERE id = $1', [schedule_id]);
        if (schedRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Schedule not found" });
        }

        const scheduleStandards = normalizeStandardList(parseStandardList(schedRes.rows[0].standards));
        const standardsProvided = Array.isArray(standards);
        const selectedStandards = normalizeStandardList(standardsProvided ? standards : []);
        const validSelectedStandards = selectedStandards.filter(std => scheduleStandards.includes(std));

        if (standardsProvided && scheduleStandards.length > 0 && validSelectedStandards.length === 0) {
            return res.status(400).json({ success: false, error: "Select at least one valid standard to cancel." });
        }

        const cancelledStandards =
            validSelectedStandards.length > 0 && validSelectedStandards.length < scheduleStandards.length
                ? JSON.stringify(validSelectedStandards)
                : null;

        const result = await db.query(
            `INSERT INTO attendance_cancellations (schedule_id, date, reason, cancelled_by, cancelled_standards)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             ON CONFLICT (schedule_id, date)
             DO UPDATE SET
                reason = EXCLUDED.reason,
                cancelled_by = EXCLUDED.cancelled_by,
                cancelled_standards = EXCLUDED.cancelled_standards
             RETURNING *`,
            [schedule_id, date, reason, userId, cancelledStandards]
        );

        invalidateCacheByPrefix('attendance:');
        invalidateCacheByPrefix('hifz:monthly');
        invalidateCacheByPrefix('reports:mentors');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const restoreSession = async (req: Request, res: Response) => {
    try {
        const { schedule_id, date } = req.body;
        const userRole = String((req as any).user.role || '').toLowerCase();

        if (!['admin', 'principal', 'vice_principal', 'controller'].includes(userRole)) {
            return res.status(403).json({ success: false, error: "Only Authorities can restore a class." });
        }

        await db.query(
            `DELETE FROM attendance_cancellations
             WHERE schedule_id = $1 AND date = $2`,
            [schedule_id, date]
        );

        invalidateCacheByPrefix('attendance:');
        invalidateCacheByPrefix('hifz:monthly');
        invalidateCacheByPrefix('reports:mentors');
        invalidateCacheByPrefix('reports:students');
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getStudentMarksForSchedule = async (req: Request, res: Response) => {
    try {
        const { schedule_id, date, student_ids } = req.query;
        if (!schedule_id || !date) return res.status(400).json({ success: false, error: "Missing required parameters" });
        
        let query = 'SELECT student_id, status FROM student_attendance_marks WHERE schedule_id = $1 AND date = $2';
        const params: any[] = [schedule_id, date];
        if (student_ids && typeof student_ids === 'string') {
            const ids = student_ids.split(',');
            if (ids.length > 0) {
                const placeholders = ids.map((_, i) => `$${3 + i}`).join(',');
                query += ` AND student_id IN (${placeholders})`;
                params.push(...ids);
            }
        }
        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getBreaks = async (req: Request, res: Response) => {
    try {
        const { academic_year_id } = req.query;

        let query = 'SELECT * FROM academic_breaks';
        const params: any[] = [];

        if (academic_year_id) {
            query += ' WHERE academic_year_id = $1';
            params.push(academic_year_id);
        }
        query += ' ORDER BY start_time';

        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const updateBreak = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { start_time, end_time } = req.body;
        
        const result = await db.query(
            'UPDATE academic_breaks SET start_time = $1, end_time = $2 WHERE id = $3 RETURNING *',
            [start_time, end_time, id]
        );
        invalidateCacheByPrefix('attendance:');
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDailyAttendanceStats = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) return res.status(400).json({ success: false, error: "start_date and end_date are required" });

        const { students, mentors } = await cachedResult(
            makeCacheKey('attendance:daily-stats', { start_date, end_date }),
            60_000,
            async () => {
                const studentRes = await db.query(
                    `SELECT status, count(*) as count
                     FROM student_attendance_marks
                     WHERE date >= $1 AND date <= $2
                     GROUP BY status`,
                    [start_date, end_date]
                );

                const students = { present: 0, absent: 0, late: 0, total: 0 };
                studentRes.rows.forEach(r => {
                    const st = r.status.toLowerCase();
                    const cnt = parseInt(r.count, 10);
                    if (st === 'present') students.present += cnt;
                    else if (st === 'absent') students.absent += cnt;
                    else if (st === 'late') students.late += cnt;
                });
                students.total = students.present + students.absent + students.late;

                const mentorRes = await db.query(
                    `SELECT status, count(*) as count
                     FROM staff_attendance
                     WHERE date >= $1 AND date <= $2
                     GROUP BY status`,
                    [start_date, end_date]
                );

                const mentors = { present: 0, absent: 0, late: 0, total: 0 };
                mentorRes.rows.forEach(r => {
                    const st = r.status.toLowerCase();
                    const cnt = parseInt(r.count, 10);
                    if (st === 'present') mentors.present += cnt;
                    else if (st === 'absent') mentors.absent += cnt;
                    else if (st === 'late') mentors.late += cnt;
                });
                mentors.total = mentors.present + mentors.absent + mentors.late;

                return { students, mentors };
            }
        );

        res.json({ success: true, students, mentors });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
