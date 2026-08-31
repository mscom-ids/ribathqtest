import { Request, Response } from 'express';
import { db } from '../../config/db';
import { getAcademicYearContext } from '../../utils/academic-year';
import { getActiveMentorStudents } from '../../services/mentor-students.service';
import { requireActiveMobileDevice, touchMobileDevice } from './mobile-sync.service';
import {
  parseDeviceId,
  parseRegisterDeviceInput,
  parseSyncCursor,
  parseSyncLimit,
} from './mobile-sync.validation';

function authenticatedStaffId(req: Request) {
  const id = (req as any).user?.id;
  return typeof id === 'string' && id ? id : null;
}

export async function registerDevice(req: Request, res: Response) {
  const client = await db.getClient();
  try {
    const staffId = authenticatedStaffId(req);
    const tokenDeviceId = (req as any).user?.device_id;
    const input = parseRegisterDeviceInput(req.body);
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (!input) return res.status(400).json({ success: false, error: 'Invalid device registration payload' });

    await client.query('BEGIN');
    if (input.pushToken) {
      await client.query(
        'UPDATE mobile_devices SET push_token = NULL WHERE push_token = $1 AND id <> $2',
        [input.pushToken, tokenDeviceId]
      );
    }
    const result = await client.query(
      `UPDATE mobile_devices
       SET platform = $4,
           device_name = $5,
           app_version = $6,
           os_version = $7,
           push_token = $8,
           last_seen_at = now()
       WHERE id = $1 AND staff_id = $2 AND installation_id = $3 AND revoked_at IS NULL
       RETURNING id, platform, installation_id, last_sync_cursor, created_at, last_seen_at`,
      [
        tokenDeviceId,
        staffId,
        input.installationId,
        input.platform,
        input.deviceName,
        input.appVersion,
        input.osVersion,
        input.pushToken,
      ]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Device does not match this mobile session' });
    }
    await client.query('COMMIT');
    return res.status(200).json({ success: true, device: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[MOBILE SYNC] Device registration failed:', error);
    return res.status(500).json({ success: false, error: 'Device registration failed' });
  } finally {
    client.release();
  }
}

export async function bootstrap(req: Request, res: Response) {
  try {
    const staffId = authenticatedStaffId(req);
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

    const device = await requireActiveMobileDevice(req, staffId);
    if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });

    const academicYear = await getAcademicYearContext(db, req.query.academic_year_id);
    const profileResult = await db.query(
      `SELECT id, email, name, role, photo_url, phone
       FROM staff
       WHERE id = $1
       LIMIT 1`,
      [staffId]
    );
    const profile = profileResult.rows[0];
    if (!profile) return res.status(404).json({ success: false, error: 'Staff profile not found' });

    const isAdminPortal = ['admin', 'controller'].includes(String(profile.role).toLowerCase());
    const [students, cursorResult, adminDashboardResult] = await Promise.all([
      isAdminPortal
        ? db.query(
            `SELECT adm_no AS id, adm_no, name, photo_url, standard,
                    NULL::text AS division, standard AS attendance_standard
             FROM students
             WHERE LOWER(COALESCE(status, 'active')) = 'active'
             ORDER BY name, adm_no
             LIMIT 1000`
          ).then(result => result.rows)
        : getActiveMentorStudents(db, staffId, {
            academicYearId: academicYear.academicYearId,
            useCache: false,
          }),
      db.query(
        `SELECT COALESCE(MAX(sequence_id), 0)::text AS cursor
         FROM mobile_sync_changes
         WHERE audience_staff_id = $1`,
        [staffId]
      ),
      isAdminPortal
        ? db.query(
            `SELECT
               (SELECT COUNT(*)::int FROM students WHERE LOWER(COALESCE(status, 'active')) = 'active') AS total_students,
               (SELECT COUNT(*)::int FROM students s
                WHERE LOWER(COALESCE(s.status, 'active')) = 'active'
                  AND EXISTS (SELECT 1 FROM student_leaves sl WHERE sl.student_id = s.adm_no AND sl.status = 'outside')) AS out_campus,
               (SELECT COUNT(*)::int FROM staff) AS total_staff,
               (SELECT COUNT(*)::int FROM staff WHERE is_active IS TRUE OR is_active IS NULL) AS active_staff,
               (SELECT COUNT(*)::int FROM mentor_delegations WHERE status = 'pending') AS pending_delegations`
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const studentIds = students.map(student => student.adm_no);
    const hifzEntries = studentIds.length > 0
      ? (await db.query(
          `SELECT id, student_id, entry_date::text, mode, surah_name, start_v, end_v,
                  notes, updated_at,
                  (extract(epoch from updated_at) * 1000)::bigint::text AS entity_version
           FROM hifz_logs
           WHERE student_id = ANY($1::text[])
             AND deleted_at IS NULL
             AND entry_date >= CURRENT_DATE - INTERVAL '120 days'
           ORDER BY entry_date DESC, created_at DESC
           LIMIT 5000`,
          [studentIds]
        )).rows
      : [];

    const cursor = Number(cursorResult.rows[0]?.cursor || 0);
    const adminCounts = adminDashboardResult.rows[0];
    await touchMobileDevice(device.id, cursor);

    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      syncCursor: cursor,
      profile,
      academicYear: {
        id: academicYear.academicYearId,
        name: academicYear.name,
        mode: academicYear.mode,
      },
      students,
      hifzEntries,
      portal: isAdminPortal ? 'admin' : 'staff',
      dashboardSummary: adminCounts ? {
        totalStudents: adminCounts.total_students,
        onCampus: Math.max(0, adminCounts.total_students - adminCounts.out_campus),
        outCampus: adminCounts.out_campus,
        totalStaff: adminCounts.total_staff,
        activeStaff: adminCounts.active_staff,
        pendingDelegations: adminCounts.pending_delegations,
      } : null,
      capabilities: {
        deltaSync: true,
        offlineMutations: ['hifz_entry_create', 'attendance_mark', 'leave_create', 'leave_return'],
        attendanceConflictProtocol: 1,
        leaveConflictProtocol: 1,
        hifzBootstrapWindowDays: 120,
      },
    });
  } catch (error) {
    console.error('[MOBILE SYNC] Bootstrap failed:', error);
    return res.status(500).json({ success: false, error: 'Mobile setup failed' });
  }
}

export async function downloadChanges(req: Request, res: Response) {
  try {
    const staffId = authenticatedStaffId(req);
    const cursor = parseSyncCursor(req.query.cursor);
    const limit = parseSyncLimit(req.query.limit);
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (cursor === null || limit === null) {
      return res.status(400).json({ success: false, error: 'Invalid sync cursor or limit' });
    }

    const device = await requireActiveMobileDevice(req, staffId);
    if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });

    const result = await db.query(
      `SELECT sequence_id::text, entity_type, entity_id, operation,
              entity_version::text, payload, changed_at
       FROM mobile_sync_changes
       WHERE audience_staff_id = $1
         AND sequence_id > $2
       ORDER BY sequence_id ASC
       LIMIT $3`,
      [staffId, cursor, limit + 1]
    );

    const hasMore = result.rows.length > limit;
    const changes = hasMore ? result.rows.slice(0, limit) : result.rows;
    const nextCursor = changes.length > 0
      ? Number(changes[changes.length - 1].sequence_id)
      : cursor;

    await touchMobileDevice(device.id, nextCursor);

    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      changes,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('[MOBILE SYNC] Delta download failed:', error);
    return res.status(500).json({ success: false, error: 'Synchronization failed' });
  }
}

export async function revokeDevice(req: Request, res: Response) {
  const client = await db.getClient();
  try {
    const staffId = authenticatedStaffId(req);
    const deviceId = parseDeviceId(req.params.deviceId);
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (!deviceId) return res.status(400).json({ success: false, error: 'Invalid device ID' });

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE mobile_devices
       SET revoked_at = now(), push_token = NULL
       WHERE id = $1 AND staff_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [deviceId, staffId]
    );

    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Active device not found' });
    }
    await client.query(
      `UPDATE mobile_refresh_sessions
       SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'device_revoked')
       WHERE device_id = $1 AND revoked_at IS NULL`,
      [deviceId]
    );
    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[MOBILE SYNC] Device revocation failed:', error);
    return res.status(500).json({ success: false, error: 'Device revocation failed' });
  } finally {
    client.release();
  }
}
