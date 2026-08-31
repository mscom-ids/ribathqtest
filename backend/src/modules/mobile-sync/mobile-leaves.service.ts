import crypto from 'node:crypto';
import { PoolClient } from 'pg';
import { db } from '../../config/db';
import { getActiveMentorStudents } from '../../services/mentor-students.service';
import { getAcademicYearContext } from '../../utils/academic-year';
import { invalidateCacheByPrefix } from '../../utils/server-cache';
import { MobileDevice } from './mobile-sync.service';
import { MobileLeaveMutationInput } from './mobile-leaves.validation';

type MutationResult = { httpStatus: number; response: Record<string, unknown> };
const MOBILE_MENTOR_ROLES = new Set(['staff', 'usthad', 'mentor']);

function leavePayload(row: any) {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    studentName: row.student_name || null,
    standard: row.standard || null,
    leaveType: row.leave_type,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    reasonCategory: row.reason_category || row.reason || null,
    remarks: row.remarks || null,
    companionName: row.companion_name || null,
    companionRelationship: row.companion_relationship || null,
    status: row.status,
    actualReturnDatetime: row.actual_return_datetime || null,
    returnStatus: row.return_status || null,
    mobileRevision: Number(row.mobile_revision || 1),
    updatedAt: row.updated_at,
  };
}

function presenceStateHash(rows: any[]) {
  const state = rows
    .map(row => ({ id: String(row.id), revision: Number(row.mobile_revision || 1), status: String(row.status), type: String(row.leave_type) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

async function lockStudentPresence(client: PoolClient, studentId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`student-presence:${studentId}`]);
}

async function activePresence(client: PoolClient, studentId: string) {
  const result = await client.query(
    `SELECT id, student_id, leave_type, status, mobile_revision
     FROM student_leaves
     WHERE student_id = $1
       AND (status = 'outside' OR (status = 'approved' AND leave_type IN ('on-campus', 'internal')))
     ORDER BY id
     FOR UPDATE`,
    [studentId],
  );
  return result.rows;
}

async function isAssignedMentor(client: PoolClient, staffId: string, studentId: string) {
  const academicYear = await getAcademicYearContext(client);
  const students = await getActiveMentorStudents(client, staffId, {
    academicYearId: academicYear.academicYearId,
    studentId,
    useCache: false,
  });
  return students.some(student => student.adm_no === studentId);
}

export async function loadMobileMentorWorkspace(staffId: string) {
  const academicYear = await getAcademicYearContext(db);
  const students = await getActiveMentorStudents(db, staffId, {
    academicYearId: academicYear.academicYearId,
    useCache: false,
  });
  const studentIds = students.map(student => student.adm_no);
  const [leavesResult, institutionalResult, assignmentsResult] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve({ rows: [] as any[] })
      : db.query(
          `SELECT sl.*, s.name AS student_name,
                  COALESCE(p.standard, s.standard, s.hifz_standard, 'Common') AS standard
           FROM student_leaves sl
           JOIN students s ON s.adm_no = sl.student_id
           LEFT JOIN academic_student_placements p
             ON p.student_id = s.adm_no
            AND p.academic_year_id = $2::uuid
            AND p.status = 'active'
           WHERE sl.student_id = ANY($1::text[])
             AND sl.leave_type <> 'outdoor'
             AND (sl.created_at >= now() - interval '180 days'
                  OR sl.status IN ('outside', 'approved'))
           ORDER BY sl.created_at DESC
           LIMIT 1000`,
          [studentIds, academicYear.academicYearId],
        ),
    db.query(
      `SELECT id, name, start_datetime, end_datetime, target_classes, target_student_ids,
              campus_location, is_entire_institution, created_at
       FROM institutional_leaves
       WHERE end_datetime >= now() - interval '90 days'
       ORDER BY start_datetime DESC
       LIMIT 200`,
    ),
    db.query(
      `SELECT delegation.id, delegation.from_staff_id AS original_mentor_id,
              mentor.name AS original_mentor_name, mentor.photo_url AS original_mentor_photo,
              delegation.student_id, student.name AS student_name, delegation.reason,
              CASE WHEN delegation.student_id IS NOT NULL THEN 1 ELSE (
                SELECT COUNT(*)::int FROM students roster
                WHERE LOWER(COALESCE(roster.status, 'active')) = 'active'
                  AND roster.hifz_mentor_id = delegation.from_staff_id
              ) END AS student_count,
              delegation.created_at, delegation.updated_at
       FROM mentor_delegations delegation
       JOIN staff mentor ON mentor.id = delegation.from_staff_id
       LEFT JOIN students student ON student.adm_no = delegation.student_id
       WHERE delegation.to_staff_id = $1
         AND delegation.status = 'approved'
       ORDER BY delegation.created_at DESC`,
      [staffId],
    ),
  ]);

  const leaves = leavesResult.rows;
  const activeByStudent = new Map<string, any[]>();
  for (const leave of leaves) {
    if (leave.status === 'outside' || (leave.status === 'approved' && ['on-campus', 'internal'].includes(String(leave.leave_type)))) {
      const list = activeByStudent.get(String(leave.student_id)) || [];
      list.push(leave);
      activeByStudent.set(String(leave.student_id), list);
    }
  }

  return {
    success: true,
    serverTime: new Date().toISOString(),
    academicYear: { id: academicYear.academicYearId, name: academicYear.name },
    students: students.map(student => {
      const active = activeByStudent.get(student.adm_no) || [];
      return {
        id: student.adm_no,
        name: student.name,
        standard: student.standard || student.attendance_standard || '',
        photoUrl: student.photo_url || null,
        presenceStateHash: presenceStateHash(active),
        activeLeaveId: active[0]?.id || null,
        isOutside: active.some(leave => leave.status === 'outside'),
        isOnCampusLeave: active.some(leave => leave.status === 'approved'),
      };
    }),
    leaves: leaves.map(leavePayload),
    institutionalLeaves: institutionalResult.rows.map(row => ({
      id: String(row.id), name: row.name, startDatetime: row.start_datetime,
      endDatetime: row.end_datetime, targetClasses: row.target_classes || [],
      targetStudentIds: row.target_student_ids || [], campusLocation: row.campus_location,
      entireInstitution: !!row.is_entire_institution, updatedAt: row.created_at,
    })),
    assignments: assignmentsResult.rows.map(row => ({
      id: String(row.id), originalMentorId: String(row.original_mentor_id),
      originalMentorName: row.original_mentor_name, originalMentorPhoto: row.original_mentor_photo || null,
      studentId: row.student_id || null, studentName: row.student_name || null,
      studentCount: Number(row.student_count || 0), reason: row.reason || null,
      updatedAt: row.updated_at || row.created_at,
    })),
  };
}

export async function saveMobileLeave(options: {
  staffId: string;
  role: string;
  device: MobileDevice;
  input: MobileLeaveMutationInput;
}): Promise<MutationResult> {
  const { staffId, role, device, input } = options;
  const client = await db.getClient();
  let completed = false;

  const reject = async (httpStatus: number, code: string, error: string, details?: Record<string, unknown>) => {
    const response = { success: false, mutationId: input.mutationId, status: 'rejected', code, error, ...(details || {}) };
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
      return { httpStatus: receipt.rows[0].status === 'applied' ? 200 : 409, response: { ...(receipt.rows[0].response || {}), replayed: true } };
    }
    if (!MOBILE_MENTOR_ROLES.has(role.toLowerCase())) return reject(403, 'NOT_AUTHORIZED', 'This account cannot manage mentor leaves.');
    const auditActorResult = await client.query('SELECT profile_id FROM staff WHERE id = $1 LIMIT 1', [staffId]);
    const auditActorId = auditActorResult.rows[0]?.profile_id || staffId;

    let savedLeave: any;
    if (input.operation === 'create') {
      const studentId = String(input.studentId);
      await lockStudentPresence(client, studentId);
      if (!await isAssignedMentor(client, staffId, studentId)) return reject(403, 'NOT_AUTHORIZED', 'This student is no longer assigned to you.');
      const active = await activePresence(client, studentId);
      const currentPresenceStateHash = presenceStateHash(active);
      if (currentPresenceStateHash !== input.expectedPresenceStateHash) {
        return reject(409, 'PRESENCE_CHANGED', 'The student leave or campus state changed while this device was offline.', { currentPresenceStateHash });
      }
      if (active.length > 0) return reject(409, 'PRESENCE_CHANGED', 'This student already has an active leave or outside movement.', { currentPresenceStateHash });

      const inserted = await client.query(
        `INSERT INTO student_leaves (
           student_id, leave_type, start_datetime, end_datetime, reason, reason_category,
           remarks, companion_name, companion_relationship, status, created_by, mobile_mutation_id
         ) VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          studentId, input.leaveType, input.startDatetime, input.endDatetime || null,
          input.reasonCategory, input.remarks || null, input.companionName || null,
          input.companionRelationship || null, input.leaveType === 'out-campus' ? 'outside' : 'approved',
          auditActorId, input.mutationId,
        ],
      );
      savedLeave = inserted.rows[0];
      if (input.leaveType === 'out-campus') {
        await client.query(
          `INSERT INTO student_movements(student_id, leave_id, direction, timestamp, recorded_by)
           VALUES ($1, $2, 'out', $3::timestamptz, $4)`,
          [studentId, savedLeave.id, input.startDatetime, auditActorId],
        );
      }
    } else {
      const leaveResult = await client.query('SELECT * FROM student_leaves WHERE id = $1 FOR UPDATE', [input.leaveId]);
      const leave = leaveResult.rows[0];
      if (!leave) return reject(409, 'LEAVE_CHANGED', 'This leave no longer exists.');
      await lockStudentPresence(client, String(leave.student_id));
      if (!await isAssignedMentor(client, staffId, String(leave.student_id))) return reject(403, 'NOT_AUTHORIZED', 'This student is no longer assigned to you.');
      if (Number(leave.mobile_revision || 1) !== input.expectedLeaveRevision) {
        return reject(409, 'LEAVE_CHANGED', 'This leave was changed while this device was offline.', { currentLeaveRevision: Number(leave.mobile_revision || 1) });
      }
      const isOnCampus = ['on-campus', 'internal'].includes(String(leave.leave_type).toLowerCase());
      if ((isOnCampus && leave.status !== 'approved') || (!isOnCampus && leave.status !== 'outside')) {
        return reject(409, 'LEAVE_CHANGED', 'This leave has already been closed or cancelled.');
      }
      const returnedAt = new Date(String(input.returnDatetime));
      if (returnedAt < new Date(leave.start_datetime)) return reject(400, 'INVALID_RETURN_TIME', 'Return time cannot be earlier than leave start time.');
      const returnStatus = leave.end_datetime && returnedAt > new Date(leave.end_datetime) ? 'late' : 'normal';
      await client.query(
        `INSERT INTO student_movements(student_id, leave_id, direction, timestamp, is_late, recorded_by)
         VALUES ($1, $2, 'in', $3::timestamptz, $4, $5)`,
        [leave.student_id, leave.id, input.returnDatetime, returnStatus === 'late', auditActorId],
      );
      const updated = await client.query(
        `UPDATE student_leaves
         SET status = $2, actual_return_datetime = $3::timestamptz, return_status = $4, updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [leave.id, isOnCampus ? 'completed' : 'returned', input.returnDatetime, returnStatus],
      );
      savedLeave = updated.rows[0];
    }

    const student = await client.query(
      `SELECT name, COALESCE(standard, hifz_standard, 'Common') AS standard FROM students WHERE adm_no = $1`,
      [savedLeave.student_id],
    );
    savedLeave = { ...savedLeave, student_name: student.rows[0]?.name, standard: student.rows[0]?.standard };
    const response = { success: true, mutationId: input.mutationId, status: 'applied', replayed: false, leave: leavePayload(savedLeave) };
    await client.query(
      `INSERT INTO mobile_mutation_receipts(staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'applied', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)],
    );
    await client.query('COMMIT');
    completed = true;
    invalidateCacheByPrefix('leaves:');
    return { httpStatus: 201, response };
  } catch (error) {
    if (!completed) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
