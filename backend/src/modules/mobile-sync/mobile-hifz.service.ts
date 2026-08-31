import { db } from '../../config/db';
import { resolveHifzEntryEligibility } from '../../services/hifz-monthly-register.service';
import { getAcademicYearContext } from '../../utils/academic-year';
import { getMentorAccessDecision } from '../../utils/mentor-access-policy';
import { invalidateCacheByPrefix } from '../../utils/server-cache';
import { MobileDevice } from './mobile-sync.service';
import { MobileHifzMutationInput } from './mobile-hifz.validation';

type MutationResult = { httpStatus: number; response: Record<string, unknown> };

const allowedMobileRoles = new Set(['staff', 'usthad', 'mentor']);

function entryPayload(row: any) {
  return {
    id: row.id,
    student_id: row.student_id,
    entry_date: String(row.entry_date).slice(0, 10),
    mode: row.mode,
    surah_name: row.surah_name,
    start_v: row.start_v,
    end_v: row.end_v,
    notes: row.notes,
    updated_at: row.updated_at,
    entity_version: row.entity_version,
  };
}

export async function createMobileHifzEntry(options: {
  staffId: string;
  role: string;
  device: MobileDevice;
  input: MobileHifzMutationInput;
}): Promise<MutationResult> {
  const { staffId, role, device, input } = options;
  const client = await db.getClient();
  let committed = false;

  const finishRejected = async (httpStatus: number, error: string) => {
    const response = { success: false, mutationId: input.mutationId, status: 'rejected', error };
    await client.query(
      `INSERT INTO mobile_mutation_receipts (staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'rejected', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)]
    );
    await client.query('COMMIT');
    committed = true;
    return { httpStatus, response };
  };

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${staffId}:${input.mutationId}`]);

    const receipt = await client.query(
      `SELECT status, response
       FROM mobile_mutation_receipts
       WHERE staff_id = $1 AND mutation_id = $2
       LIMIT 1`,
      [staffId, input.mutationId]
    );
    if (receipt.rows[0]) {
      await client.query('COMMIT');
      committed = true;
      const stored = receipt.rows[0].response || {};
      return {
        httpStatus: receipt.rows[0].status === 'applied' ? 200 : 409,
        response: { ...stored, replayed: true },
      };
    }

    if (!allowedMobileRoles.has(role.toLowerCase())) {
      return finishRejected(403, 'This account cannot create mentor Hifz entries.');
    }

    const access = await getMentorAccessDecision('hifz_recording', input.entryDate);
    if (!access.allowed) return finishRejected(403, access.reason || 'Hifz recording is locked for this date.');

    const academicYear = await getAcademicYearContext(client);
    const studentResult = await client.query(
      `SELECT s.adm_no
       FROM students s
       LEFT JOIN student_year_snapshots snapshot
         ON snapshot.student_id = s.adm_no
        AND snapshot.academic_year_id = $3::uuid
       LEFT JOIN student_hifz_profiles profile ON profile.student_id = s.adm_no
       WHERE s.adm_no = $1
         AND LOWER(COALESCE(s.status, 'active')) = 'active'
         AND LOWER(COALESCE(snapshot.status, 'active')) = 'active'
         AND COALESCE(snapshot.hifz_mentor_id, profile.mentor_id, s.hifz_mentor_id) = $2::uuid
       LIMIT 1`,
      [input.studentId, staffId, academicYear.academicYearId]
    );
    if (!studentResult.rows[0]) return finishRejected(403, 'This student is not assigned to you for the active academic year.');

    const eligibility = await resolveHifzEntryEligibility({
      db: client,
      studentId: input.studentId,
      entryDate: input.entryDate,
      academicYearId: academicYear.academicYearId,
      requestedSessionId: input.sessionId,
    });
    if (!eligibility.allowed) return finishRejected(409, eligibility.reason || 'This Hifz entry is not eligible.');

    const conflicting = await client.query(
      `SELECT id
       FROM hifz_logs
       WHERE student_id = $1
         AND entry_date = $2::date
         AND mode = $3
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [input.studentId, input.entryDate, input.mode]
    );
    if (conflicting.rows[0]) return finishRejected(409, 'A Hifz entry already exists for this student, date, and activity.');

    const inserted = await client.query(
      `INSERT INTO hifz_logs (
         student_id, usthad_id, entry_date, mode, surah_name, start_v, end_v,
         session_id, attendance_record_id, created_by, notes, mobile_mutation_id
       ) VALUES (
         $1, $2, $3::date, $4, $5, $6, $7, $8,
         (SELECT id FROM student_attendance_marks
          WHERE student_id = $1 AND schedule_id = $8 AND date = $3::date LIMIT 1),
         $2, $9, $10
       )
       RETURNING *, (extract(epoch from updated_at) * 1000)::bigint AS entity_version`,
      [
        input.studentId,
        staffId,
        input.entryDate,
        input.mode,
        input.surahName,
        input.startVerse,
        input.endVerse,
        eligibility.sessionId,
        input.notes,
        input.mutationId,
      ]
    );
    const entry = inserted.rows[0];
    const payload = entryPayload(entry);

    await client.query(
      `INSERT INTO mobile_sync_changes (
         audience_staff_id, entity_type, entity_id, operation, entity_version, payload
       ) VALUES ($1, 'hifz_log', $2, 'upsert', $3, $4::jsonb)`,
      [staffId, entry.id, entry.entity_version, JSON.stringify(payload)]
    );

    const response = {
      success: true,
      mutationId: input.mutationId,
      status: 'applied',
      replayed: false,
      entry: payload,
    };
    await client.query(
      `INSERT INTO mobile_mutation_receipts (staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'applied', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)]
    );
    await client.query('COMMIT');
    committed = true;

    invalidateCacheByPrefix('hifz:');
    invalidateCacheByPrefix('reports:students');
    return { httpStatus: 201, response };
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
