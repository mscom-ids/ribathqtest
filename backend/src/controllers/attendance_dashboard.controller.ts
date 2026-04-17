import { Request, Response } from 'express';
import { db } from '../config/db';
import { getStaffId } from '../utils/staff.utils';

const ROLE_LIMITS = {
    staff: 3,    // 3 days for mentors
    usthad: 3,   // same window for usthad role
    mentor: 3,   // same window for mentor role
    admin: 30,
    principal: 30,
    vice_principal: 30,
    controller: 30
};

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
        `SELECT standard,
                (hifz_mentor_id    = $1) AS is_hifz,
                (school_mentor_id  = $1) AS is_school,
                (madrasa_mentor_id = $1) AS is_madrasa
         FROM students
         WHERE status = 'active'
           AND standard IS NOT NULL
           AND (hifz_mentor_id = $1 OR school_mentor_id = $1 OR madrasa_mentor_id = $1)`,
        [mentorId]
    );

    const counts: MentorCountMap = { hifz: {}, school: {}, madrasa: {} };
    for (const row of result.rows) {
        const std = row.standard;
        if (row.is_hifz)    counts.hifz[std]    = (counts.hifz[std]    || 0) + 1;
        if (row.is_school)  counts.school[std]  = (counts.school[std]  || 0) + 1;
        if (row.is_madrasa) counts.madrasa[std] = (counts.madrasa[std] || 0) + 1;
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

export const getSchedules = async (req: Request, res: Response) => {
    try {
        const { academic_year_id, show_inactive } = req.query;
        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id`;
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
        const user = (req as any).user;

        if (MENTOR_ROLES.includes(user?.role)) {
            const mentorId = await getStaffId(req);
            if (!mentorId) {
                return res.json({ success: true, data: [] });
            }

            // ONE query for all mentor↔standard counts, then in-memory lookup
            // per schedule. Replaces the previous N+1 COUNT(*) loop.
            const counts = await getMentorStudentCounts(mentorId);

            const filteredSchedules = schedules
                .map(schedule => ({
                    ...schedule,
                    student_count: countStudentsForSchedule(schedule, counts),
                }))
                .filter(s => s.student_count > 0);

            return res.json({ success: true, data: filteredSchedules });
        }

        res.json({ success: true, data: schedules });
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

        let query = `SELECT a.*, s.name as mentor_name, s.photo_url as mentor_photo
                     FROM attendance_schedules a
                     LEFT JOIN staff s ON a.mentor_id = s.id
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

            const filteredSchedules = result.rows
                .map((schedule: any) => ({
                    ...schedule,
                    student_count: countStudentsForSchedule(schedule, counts),
                }))
                .filter((s: any) => s.student_count > 0);

            return res.json({ success: true, data: filteredSchedules });
        }

        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createSchedule = async (req: Request, res: Response) => {
    try {
        const { class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from } = req.body;

        // Auto-calculate effective_from: next occurrence of the selected day
        const startDate = effective_from || getNextOccurrence(day_of_week);

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
                const extStds = typeof existing.standards === 'string' ? JSON.parse(existing.standards || '[]') : existing.standards;
                const reqStds = Array.isArray(standards) ? standards : [];
                
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
            `INSERT INTO attendance_schedules (class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [class_type, name || null, JSON.stringify(standards), day_of_week, start_time, end_time, duration_mins, startDate]
        );
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
        const cancels = await db.query(
            'SELECT * FROM attendance_cancellations WHERE date >= $1 AND date <= $2',
            [start_date, end_date]
        );

        let marksQuery: { rows: any[] };
        if (MENTOR_ROLES.includes(user?.role)) {
            // Mentors only see their own marks — so "Marked" status is per-mentor
            marksQuery = await db.query(
                'SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2 AND marked_by = $3',
                [start_date, end_date, user.id]
            );
        } else {
            // Admin/Principal: see all marks (session shown as completed if anyone marked it)
            marksQuery = await db.query(
                'SELECT * FROM attendance_marks WHERE date >= $1 AND date <= $2',
                [start_date, end_date]
            );
        }

        res.json({
            success: true,
            cancellations: cancels.rows,
            marks: marksQuery.rows
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

        const relevantIds = allScheds.rows
            .filter((sched: any) => countStudentsForSchedule(sched, counts) > 0)
            .map((sched: any) => sched.id);

        res.json({ success: true, schedule_ids: relevantIds, mentor_standards: mentorStudentStds });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
};

export const getStudentsForSchedule = async (req: Request, res: Response) => {
    try {
        let { schedule_id, date, mentor_id } = req.query;
        const user = (req as any).user;

        if (!schedule_id) return res.status(400).json({ success: false, error: "schedule_id required" });

        // ── Phase 1 (parallel): resolve mentor id + load schedule ──
        // Previously these were sequential awaits even though the schedule
        // lookup doesn't depend on the staff id at all.
        const isMentorRole = MENTOR_ROLES.includes(user?.role);
        const [resolvedMentorId, schedRes] = await Promise.all([
            isMentorRole ? getStaffId(req) : Promise.resolve(null),
            db.query(
                'SELECT standards, class_type, start_time, end_time FROM attendance_schedules WHERE id = $1',
                [schedule_id]
            ),
        ]);

        if (isMentorRole && resolvedMentorId) {
            mentor_id = resolvedMentorId;
        }

        if (schedRes.rows.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });

        const rawStds: string[] = typeof schedRes.rows[0].standards === 'string'
            ? JSON.parse(schedRes.rows[0].standards || '[]')
            : (schedRes.rows[0].standards || []);
        const classType = (schedRes.rows[0].class_type || '').toLowerCase();
        const sessionEndStr = schedRes.rows[0].end_time; // 'HH:mm:ss'

        // Normalize schedule pill-labels → actual student DB values
        const dbStds = rawStds.map(normalizeScheduleStandard);

        const mentorCol = MENTOR_COL_MAP[classType];

        let permanentStudents: any[] = [];
        let delegatedStudents: any[] = [];

        if (mentor_id && mentorCol) {
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
                     ORDER BY standard, name`,
                    [dbStds, mentor_id]
                ),
                db.query(
                    `SELECT s.adm_no, s.name, s.standard, s.photo_url
                     FROM mentor_delegations d
                     JOIN students s ON s.${mentorCol} = d.from_staff_id
                     WHERE d.to_staff_id = $1
                       AND d.status = 'approved'
                       AND s.status = 'active'
                       AND s.standard = ANY($2)
                     ORDER BY s.name`,
                    [mentor_id, dbStds]
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
                [dbStds]
            );
            permanentStudents = allRes.rows.map((s: any) => ({ ...s, is_temp: false }));
        }

        const students = [...permanentStudents, ...delegatedStudents];

        let studentsWithLeave = students;
        if (students.length > 0 && date) {
            try {
                const studentIds = students.map((s: any) => s.adm_no);
                // Phase 3: leave overlap check.
                // Removed `start_datetime::date` casts on the indexed columns —
                // PG can't use a btree index when the indexed column is wrapped
                // in a function/cast. Compare directly to date-bounded timestamps
                // so the existing student_id index can be combined with the new
                // (status, start_datetime, end_datetime) index.
                const leavesRes = await db.query(
                    `SELECT student_id, start_datetime
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
                         (status = 'returned'
                            AND start_datetime <  ($2::date + 1)
                            AND COALESCE(actual_return_datetime, end_datetime) >= $2::date)
                       )
                     ORDER BY start_datetime DESC`,
                    [studentIds, date]
                );
                
                const leaveMap = new Map();
                for (const r of leavesRes.rows) {
                    if (!leaveMap.has(r.student_id)) {
                        leaveMap.set(r.student_id, r.start_datetime); // keep most recent leave of the day
                    }
                }

                // If no exact session end time is known, fallback to now
                const referenceTimeStr = sessionEndStr || "23:59:00"; 
                // Build a precise timestamp object for when the session finished
                const sessionEndDateTimeObj = new Date(`${date}T${referenceTimeStr}+05:30`);

                studentsWithLeave = students.map((s: any) => {
                    const lStart = leaveMap.get(s.adm_no);
                    let isLockedOutside = false;
                    let wentOutsideLater = false;

                    if (lStart) {
                        const leaveStartObj = new Date(lStart);
                        if (sessionEndDateTimeObj >= leaveStartObj) {
                            // Leave happened before or during the session completion
                            isLockedOutside = true;
                        } else {
                            // Session ended cleanly before the student left campus
                            wentOutsideLater = true;
                        }
                    }

                    return {
                        ...s,
                        is_locked_outside: isLockedOutside,
                        went_outside_later: wentOutsideLater,
                        leave_start_time: lStart || null,
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

        // If an admin/principal is marking on behalf of a specific mentor,
        // store the mark under the mentor's ID so their portal shows it as "Marked"
        const ADMIN_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
        const effectiveMarkedBy = ADMIN_ROLES.includes(userRole) && on_behalf_of ? on_behalf_of : userId;

        const schedRes = await db.query('SELECT * FROM attendance_schedules WHERE id = $1', [schedule_id]);
        if (schedRes.rows.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
        const schedule = schedRes.rows[0];

        // ── Security Guard: mentor roles may only mark their own students ──
        if (MENTOR_ROLES.includes(userRole) && student_marks?.length > 0) {
            const mentorId = await getStaffId(req);
            if (mentorId) {
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
                        `SELECT adm_no FROM students WHERE adm_no = ANY($1) AND ${mentorCol} = $2`,
                        [submittedIds, mentorId]
                    );
                    const permIds = new Set(permRes.rows.map((r: any) => r.adm_no));

                    // Fetch delegated students (from mentors who delegated TO the current mentor)
                    let delegatedIds = new Set<string>();
                    try {
                        const delRes = await db.query(
                            `SELECT s.adm_no FROM mentor_delegations d
                             JOIN students s ON s.${mentorCol} = d.from_staff_id
                             WHERE d.to_staff_id = $1
                               AND d.status = 'approved'
                               AND s.adm_no = ANY($2)`,
                            [mentorId, submittedIds]
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

        const cancelCheck = await db.query('SELECT id FROM attendance_cancellations WHERE schedule_id = $1 AND date = $2', [schedule_id, date]);
        if (cancelCheck.rows.length > 0) return res.status(400).json({ success: false, error: "Cannot mark attendance for cancelled sessions" });

        const classDateTimeStr = `${date}T${schedule.start_time}+05:30`;
        const classDateObj = new Date(classDateTimeStr);
        const now = new Date();
        
        if (now < classDateObj) return res.status(400).json({ success: false, error: "Cannot mark attendance before the class starts" });

        const diffTime = Math.abs(now.getTime() - classDateObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const maxDays = (ROLE_LIMITS as any)[userRole] || 3;

        if (diffDays > maxDays) return res.status(403).json({ success: false, error: `Time lock expired. You only have a ${maxDays}-day window.` });

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
                [userId, date]
            );

            // Record the Master Class Completion Marker — scoped per mentor
            const result = await client.query(
                `INSERT INTO attendance_marks (schedule_id, date, marked_by, updated_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (schedule_id, date, marked_by) DO UPDATE SET updated_at = NOW() RETURNING *`,
                [schedule_id, date, effectiveMarkedBy]
            );

            await client.query('COMMIT');
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
        const { schedule_id, date, reason } = req.body;
        const userId = (req as any).user.id;
        const userRole = (req as any).user.role;

        if (!['admin', 'principal', 'vice_principal'].includes(userRole)) {
            return res.status(403).json({ success: false, error: "Only Authorities can cancel a class." });
        }

        const result = await db.query(
            `INSERT INTO attendance_cancellations (schedule_id, date, reason, cancelled_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (schedule_id, date) DO UPDATE SET reason = EXCLUDED.reason, cancelled_by = EXCLUDED.cancelled_by RETURNING *`,
            [schedule_id, date, reason, userId]
        );

        await db.query('DELETE FROM attendance_marks WHERE schedule_id = $1 AND date = $2', [schedule_id, date]);

        res.json({ success: true, data: result.rows[0] });
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
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDailyAttendanceStats = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) return res.status(400).json({ success: false, error: "start_date and end_date are required" });

        // Build stats for students
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

        // Build stats for mentors (staff attendance)
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

        res.json({ success: true, students, mentors });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
