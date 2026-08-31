import { PoolClient } from 'pg';
import { db } from '../../config/db';
import { attendanceRosterStateHash } from '../../services/attendance-roster-state.service';
import { lockAttendanceSessions } from '../../services/attendance-session-lock.service';
import { getActiveMentorStudents } from '../../services/mentor-students.service';
import { getAcademicYearContext } from '../../utils/academic-year';
import { getMentorAccessDecision } from '../../utils/mentor-access-policy';
import { invalidateCacheByPrefix } from '../../utils/server-cache';
import { MobileDevice } from './mobile-sync.service';
import { MobileAttendanceMutationInput } from './mobile-attendance.validation';

type MutationResult = { httpStatus: number; response: Record<string, unknown> };

const MOBILE_MENTOR_ROLES = new Set(['staff', 'usthad', 'mentor']);
const MENTOR_COLUMN: Record<string, string> = {
  hifz: 'hifz_mentor_id',
  school: 'school_mentor_id',
  madrasa: 'madrasa_mentor_id',
  madrassa: 'madrasa_mentor_id',
};

function parseList(value: any): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeStandard(value: string) {
  const label = String(value || '').trim();
  if (label === 'Hifz Only') return 'Hifz';
  if (label === '+1 (Plus One)') return 'Plus One';
  if (label === '+2 (Plus Two)') return 'Plus Two';
  return label.endsWith(' Standard') ? label.slice(0, -' Standard'.length) : label;
}

function cancellationStandards(cancellation: any) {
  return parseList(cancellation?.cancelled_standards).map(normalizeStandard).filter(Boolean);
}

function cancellationStudents(cancellation: any) {
  return parseList(cancellation?.cancelled_students).filter(Boolean);
}

function isFullCancellation(cancellation: any) {
  return !!cancellation && cancellationStandards(cancellation).length === 0 && cancellationStudents(cancellation).length === 0;
}

function dateTime(date: string, time: string) {
  return new Date(`${date}T${String(time || '00:00:00').slice(0, 8)}+05:30`);
}

function dateKey(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = value instanceof Date ? value : new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

async function loadUnavailableStudents(
  client: PoolClient,
  studentIds: string[],
  date: string,
  startTime: string,
  endTime: string,
) {
  if (studentIds.length === 0) return new Map<string, any>();
  const start = dateTime(date, startTime);
  const end = dateTime(date, endTime);
  if (end <= start) end.setDate(end.getDate() + 1);
  const presenceTable = await client.query(`SELECT to_regclass('public.student_current_presence') AS name`);
  const hasPresence = !!presenceTable.rows[0]?.name;
  const sql = hasPresence
    ? `WITH outside_presence AS (
         SELECT scp.student_id, sl.start_datetime, sl.end_datetime, sl.actual_return_datetime,
                COALESCE(sl.leave_type, 'out-campus') AS leave_type,
                COALESCE(sl.status, 'outside') AS status, 0 AS priority
         FROM student_current_presence scp
         LEFT JOIN student_leaves sl ON sl.id = scp.active_leave_id
         WHERE scp.student_id = ANY($1::text[]) AND scp.status = 'outside'
       ), overlapping AS (
         SELECT sl.student_id, sl.start_datetime, sl.end_datetime, sl.actual_return_datetime,
                sl.leave_type, sl.status, 1 AS priority
         FROM student_leaves sl
         WHERE sl.student_id = ANY($1::text[])
           AND sl.start_datetime < $3::timestamptz
           AND (sl.status = 'outside'
             OR (sl.status = 'approved' AND COALESCE(sl.end_datetime, 'infinity'::timestamptz) > $2::timestamptz)
             OR (sl.status IN ('returned', 'completed') AND COALESCE(sl.actual_return_datetime, sl.end_datetime) > $2::timestamptz))
       )
       SELECT DISTINCT ON (student_id) *
       FROM (SELECT * FROM outside_presence UNION ALL SELECT * FROM overlapping) unavailable
       ORDER BY student_id, priority, start_datetime DESC NULLS LAST`
    : `SELECT DISTINCT ON (sl.student_id) sl.student_id, sl.start_datetime, sl.end_datetime,
              sl.actual_return_datetime, sl.leave_type, sl.status
       FROM student_leaves sl
       WHERE sl.student_id = ANY($1::text[])
         AND sl.start_datetime < $3::timestamptz
         AND (sl.status = 'outside'
           OR (sl.status = 'approved' AND COALESCE(sl.end_datetime, 'infinity'::timestamptz) > $2::timestamptz)
           OR (sl.status IN ('returned', 'completed') AND COALESCE(sl.actual_return_datetime, sl.end_datetime) > $2::timestamptz))
       ORDER BY sl.student_id, sl.start_datetime DESC NULLS LAST`;
  const result = await client.query(sql, [studentIds, start.toISOString(), end.toISOString()]);
  return new Map(result.rows.map(row => [String(row.student_id), row]));
}

async function loadRoster(client: PoolClient, schedule: any, staffId: string, date: string) {
  const cancellation = schedule.attendance_cancellation || null;
  const cancelledStandards = new Set(cancellationStandards(cancellation));
  const standards = parseList(schedule.standards)
    .map(normalizeStandard)
    .filter(standard => !cancelledStandards.has(standard));
  const groups = Array.isArray(schedule.attendance_groups) ? schedule.attendance_groups : parseList(schedule.attendance_groups);
  const linkedGroups = (groups as any[]).filter(group => !group.mentor_id || String(group.mentor_id) === staffId);
  let students: any[] = [];

  if ((groups as any[]).length > 0 && linkedGroups.length === 0) {
    throw Object.assign(new Error('This timetable roster belongs to another mentor.'), { status: 403, code: 'NOT_AUTHORIZED' });
  }

  if (linkedGroups.length > 0) {
    const result = await client.query(
      `SELECT DISTINCT s.adm_no, s.name, placement.standard, s.photo_url, false AS is_temp
       FROM attendance_group_students member
       JOIN attendance_groups group_row ON group_row.id = member.group_id
       JOIN students s ON s.adm_no = member.student_id AND LOWER(COALESCE(s.status, 'active')) = 'active'
       JOIN academic_student_placements placement
         ON placement.student_id = s.adm_no
        AND placement.academic_year_id = $2
        AND placement.status = 'active'
       WHERE member.group_id = ANY($1::uuid[])
         AND placement.standard = ANY($3::text[])
       ORDER BY placement.standard, s.name`,
      [linkedGroups.map(group => group.id), schedule.academic_year_id, standards],
    );
    students = result.rows;
  } else if (String(schedule.class_type).toLowerCase() === 'hifz') {
    students = await getActiveMentorStudents(client as any, staffId, {
      academicYearId: schedule.academic_year_id,
      useCache: false,
    });
    students = students.filter(student => standards.includes(normalizeStandard(student.attendance_standard || student.standard)));
  } else {
    const department = String(schedule.class_type || '').toLowerCase() === 'madrassa'
      ? 'madrasa'
      : String(schedule.class_type || '').toLowerCase();
    const configured = await client.query(
      `SELECT DISTINCT s.adm_no, s.name, placement.standard, s.photo_url, false AS is_temp
       FROM attendance_groups group_row
       JOIN attendance_group_students member ON member.group_id = group_row.id
       JOIN students s ON s.adm_no = member.student_id AND LOWER(COALESCE(s.status, 'active')) = 'active'
       JOIN academic_student_placements placement
         ON placement.student_id = s.adm_no
        AND placement.academic_year_id = $2
        AND placement.status = 'active'
       WHERE group_row.mentor_id = $1
         AND group_row.academic_year_id = $2
         AND group_row.department = $3
         AND group_row.standard = ANY($4::text[])
       ORDER BY placement.standard, s.name`,
      [staffId, schedule.academic_year_id, department, standards],
    );
    if (configured.rows.length > 0) {
      students = configured.rows;
    } else {
      const mentorColumn = MENTOR_COLUMN[department];
      if (!mentorColumn) return [];
      const permanent = await client.query(
        `SELECT s.adm_no, s.name, s.standard, s.photo_url, false AS is_temp
         FROM students s
         WHERE LOWER(COALESCE(s.status, 'active')) = 'active'
           AND s.standard = ANY($1::text[])
           AND s.${mentorColumn} = $2
           AND NOT EXISTS (
             SELECT 1 FROM mentor_delegations delegation
             WHERE delegation.from_staff_id = $2
               AND delegation.status = 'approved'
               AND (delegation.student_id IS NULL OR delegation.student_id = s.adm_no)
           )`,
        [standards, staffId],
      );
      const delegated = await client.query(
        `SELECT DISTINCT s.adm_no, s.name, s.standard, s.photo_url, true AS is_temp
         FROM mentor_delegations delegation
         JOIN students s ON s.${mentorColumn} = delegation.from_staff_id
         WHERE delegation.to_staff_id = $1
           AND delegation.status = 'approved'
           AND (delegation.student_id IS NULL OR delegation.student_id = s.adm_no)
           AND LOWER(COALESCE(s.status, 'active')) = 'active'
           AND s.standard = ANY($2::text[])`,
        [staffId, standards],
      );
      const byId = new Map<string, any>();
      [...permanent.rows, ...delegated.rows].forEach(student => byId.set(String(student.adm_no), student));
      students = Array.from(byId.values());
    }
  }

  students = students
    .filter(student => !cancelledStandards.has(normalizeStandard(student.standard)))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const unavailable = await loadUnavailableStudents(
    client,
    students.map(student => String(student.adm_no)),
    date,
    schedule.start_time,
    schedule.end_time,
  );
  return students.map(student => {
    const leave = unavailable.get(String(student.adm_no));
    const leaveType = String(leave?.leave_type || '').toLowerCase();
    const onCampusLeave = ['on-campus', 'internal'].includes(leaveType);
    return {
      ...student,
      is_locked_outside: !!leave,
      is_on_leave: onCampusLeave,
      leave_type: leave?.leave_type || null,
      attendance_status: onCampusLeave ? 'on_leave' : leave ? 'outside' : 'pending',
    };
  });
}

export async function saveMobileAttendance(options: {
  staffId: string;
  role: string;
  device: MobileDevice;
  input: MobileAttendanceMutationInput;
}): Promise<MutationResult> {
  const { staffId, role, device, input } = options;
  const client = await db.getClient();
  let completed = false;

  const reject = async (httpStatus: number, code: string, error: string, details?: Record<string, unknown>) => {
    const response = {
      success: false,
      mutationId: input.mutationId,
      status: 'rejected',
      code,
      error,
      ...(details || {}),
    };
    await client.query(
      `INSERT INTO mobile_mutation_receipts(staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'rejected', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)],
    );
    await client.query('COMMIT');
    completed = true;
    return { httpStatus, response };
  };

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${staffId}:${input.mutationId}`]);
    const receipt = await client.query(
      `SELECT status, response FROM mobile_mutation_receipts
       WHERE staff_id = $1 AND mutation_id = $2 LIMIT 1`,
      [staffId, input.mutationId],
    );
    if (receipt.rows[0]) {
      await client.query('COMMIT');
      completed = true;
      return {
        httpStatus: receipt.rows[0].status === 'applied' ? 200 : 409,
        response: { ...(receipt.rows[0].response || {}), replayed: true },
      };
    }

    if (!MOBILE_MENTOR_ROLES.has(role.toLowerCase())) {
      return reject(403, 'NOT_AUTHORIZED', 'This account cannot mark mentor attendance.');
    }

    await lockAttendanceSessions(client, [{ scheduleId: input.scheduleId, date: input.date }]);
    const scheduleResult = await client.query(
      `SELECT schedule.*,
              COALESCE((
                SELECT revision FROM mobile_attendance_session_revisions revision
                WHERE revision.schedule_id = schedule.id AND revision.session_date = $2::date
              ), 0)::bigint AS session_revision,
              (
                SELECT to_jsonb(cancellation) FROM attendance_cancellations cancellation
                WHERE cancellation.schedule_id = schedule.id AND cancellation.date = $2::date LIMIT 1
              ) AS attendance_cancellation,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object('id', group_row.id, 'mentor_id', group_row.mentor_id))
                FROM attendance_schedule_groups link
                JOIN attendance_groups group_row ON group_row.id = link.group_id
                WHERE link.schedule_id = schedule.id
              ), '[]'::jsonb) AS attendance_groups
       FROM attendance_schedules schedule
       WHERE schedule.id = $1
       FOR UPDATE`,
      [input.scheduleId, input.date],
    );
    const schedule = scheduleResult.rows[0];
    if (!schedule || schedule.is_deleted) return reject(409, 'SESSION_CHANGED', 'This class is no longer available.');
    if (schedule.mentor_id && String(schedule.mentor_id) !== staffId) {
      return reject(403, 'NOT_AUTHORIZED', 'This timetable slot belongs to another mentor.');
    }

    const day = new Date(`${input.date}T12:00:00Z`).getUTCDay();
    const outsideWindow = input.date < dateKey(schedule.effective_from)
      || (schedule.effective_until && input.date > dateKey(schedule.effective_until));
    if (day !== Number(schedule.day_of_week) || outsideWindow) {
      return reject(409, 'SESSION_CHANGED', 'This class is not active on the selected date.');
    }
    const academicYear = await getAcademicYearContext(client);
    if (academicYear.academicYearId && String(schedule.academic_year_id) !== academicYear.academicYearId) {
      return reject(409, 'SESSION_CHANGED', 'This class belongs to a previous academic year.');
    }
    if (isFullCancellation(schedule.attendance_cancellation)) {
      return reject(409, 'SESSION_CANCELLED', schedule.attendance_cancellation.reason || 'This class was cancelled.');
    }
    if (Number(schedule.mobile_revision || 1) !== input.scheduleRevision
      || Number(schedule.session_revision || 0) !== input.sessionRevision) {
      return reject(409, 'SESSION_CHANGED', 'The class changed while this device was offline.', {
        currentScheduleRevision: Number(schedule.mobile_revision || 1),
        currentSessionRevision: Number(schedule.session_revision || 0),
      });
    }

    const access = await getMentorAccessDecision('attendance', input.date);
    if (!access.allowed) return reject(403, 'ATTENDANCE_LOCKED', access.reason || 'Attendance is locked for this date.');
    if (new Date() < dateTime(input.date, schedule.start_time)) {
      return reject(409, 'SESSION_NOT_STARTED', 'Attendance cannot be marked before the class starts.');
    }

    const roster = await loadRoster(client, schedule, staffId, input.date);
    const rosterHash = attendanceRosterStateHash(roster);
    if (rosterHash !== input.rosterStateHash) {
      return reject(409, 'ROSTER_CHANGED', 'The student roster or leave status changed while this device was offline.', {
        currentRosterStateHash: rosterHash,
      });
    }
    const rosterIds = roster.map(student => String(student.adm_no)).sort();
    const submittedIds = input.marks.map(mark => mark.studentId).sort();
    if (rosterIds.join('\n') !== submittedIds.join('\n')) {
      return reject(409, 'ROSTER_CHANGED', 'Attendance must be reviewed against the latest complete roster.');
    }

    const submittedByStudent = new Map(input.marks.map(mark => [mark.studentId, mark.status]));
    const cancelledIds = new Set(cancellationStudents(schedule.attendance_cancellation));
    const marks = roster.map(student => {
      const studentId = String(student.adm_no);
      const leaveType = String(student.leave_type || '').toLowerCase();
      const forcedStatus = cancelledIds.has(studentId)
        ? 'Leave'
        : student.is_locked_outside
          ? (['on-campus', 'internal'].includes(leaveType) ? 'Leave' : 'Outside')
          : submittedByStudent.get(studentId);
      return { studentId, status: forcedStatus || 'Present' };
    });
    const studentIds = marks.map(mark => mark.studentId);
    const statuses = marks.map(mark => mark.status);

    const saved = await client.query(
      `WITH saved_students AS (
         INSERT INTO student_attendance_marks(schedule_id, student_id, date, status, marked_by)
         SELECT $1::uuid, student_id, $2::date, status, $3::uuid
         FROM unnest($4::text[], $5::text[]) AS input(student_id, status)
         ON CONFLICT (schedule_id, student_id, date) DO UPDATE
         SET status = EXCLUDED.status, marked_by = EXCLUDED.marked_by
         RETURNING id
       ), saved_staff AS (
         INSERT INTO staff_attendance(staff_id, date, status)
         VALUES ($3::uuid, $2::date, 'present')
         ON CONFLICT (staff_id, date) DO UPDATE SET status = 'present'
         RETURNING staff_id
       ), saved_session AS (
         INSERT INTO attendance_marks(schedule_id, date, marked_by, updated_at)
         VALUES ($1::uuid, $2::date, $3::uuid, now())
         ON CONFLICT (schedule_id, date, marked_by) DO UPDATE SET updated_at = now()
         RETURNING id, updated_at
       )
       SELECT saved_session.id, saved_session.updated_at,
              (SELECT COUNT(*)::int FROM saved_students) AS student_mark_count
       FROM saved_session`,
      [input.scheduleId, input.date, staffId, studentIds, statuses],
    );
    const revision = await client.query(
      `SELECT revision::bigint FROM mobile_attendance_session_revisions
       WHERE schedule_id = $1 AND session_date = $2::date`,
      [input.scheduleId, input.date],
    );
    const nextSessionRevision = Number(revision.rows[0]?.revision || input.sessionRevision + 1);
    const response = {
      success: true,
      mutationId: input.mutationId,
      status: 'applied',
      replayed: false,
      attendance: {
        scheduleId: input.scheduleId,
        date: input.date,
        scheduleRevision: input.scheduleRevision,
        sessionRevision: nextSessionRevision,
        studentMarkCount: saved.rows[0]?.student_mark_count || marks.length,
        updatedAt: saved.rows[0]?.updated_at,
        marks,
      },
    };
    await client.query(
      `INSERT INTO mobile_mutation_receipts(staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'applied', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)],
    );
    await client.query(
      `INSERT INTO mobile_sync_changes(audience_staff_id, entity_type, entity_id, operation, entity_version, payload)
       VALUES ($1, 'attendance_session', $2, 'invalidate', $3, $4::jsonb)`,
      [staffId, `${input.scheduleId}:${input.date}`, nextSessionRevision, JSON.stringify({
        schedule_id: input.scheduleId,
        date: input.date,
        session_revision: nextSessionRevision,
      })],
    );
    await client.query('COMMIT');
    completed = true;

    invalidateCacheByPrefix('attendance:dashboard');
    invalidateCacheByPrefix('attendance:daily-stats');
    invalidateCacheByPrefix('attendance:student-summaries');
    invalidateCacheByPrefix('reports:');
    return { httpStatus: 201, response };
  } catch (error: any) {
    if (!completed) await client.query('ROLLBACK').catch(() => undefined);
    if (error?.status && error?.code) {
      return { httpStatus: error.status, response: { success: false, code: error.code, error: error.message } };
    }
    throw error;
  } finally {
    client.release();
  }
}
