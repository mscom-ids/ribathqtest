import { Request } from 'express';
import { db } from '../../config/db';
import { parseDeviceId } from './mobile-sync.validation';

export type MobileDevice = {
  id: string;
  staff_id: string;
  platform: 'android' | 'ios';
  installation_id: string;
  last_sync_cursor: string;
};

export async function requireActiveMobileDevice(req: Request, staffId: string): Promise<MobileDevice | null> {
  const deviceId = parseDeviceId(req.header('x-device-id'));
  if (!deviceId) return null;
  const tokenDeviceId = (req as any).user?.device_id;
  if (tokenDeviceId !== deviceId) return null;

  const result = await db.query(
    `SELECT id, staff_id, platform, installation_id, last_sync_cursor
     FROM mobile_devices
     WHERE id = $1
       AND staff_id = $2
       AND revoked_at IS NULL
     LIMIT 1`,
    [deviceId, staffId]
  );

  return result.rows[0] || null;
}

export async function touchMobileDevice(deviceId: string, cursor?: number) {
  if (cursor === undefined) {
    await db.query('UPDATE mobile_devices SET last_seen_at = now() WHERE id = $1', [deviceId]);
    return;
  }

  await db.query(
    `UPDATE mobile_devices
     SET last_seen_at = now(),
         last_sync_cursor = GREATEST(last_sync_cursor, $2)
     WHERE id = $1`,
    [deviceId, cursor]
  );
}

export type PublishMobileChangeInput = {
  audienceStaffIds: string[];
  entityType: string;
  entityId: string;
  operation: 'upsert' | 'delete' | 'invalidate';
  entityVersion?: number;
  payload?: Record<string, unknown> | null;
};

/**
 * Publishes one authorization-scoped change to multiple mobile feeds in one
 * database round trip. Domain services should call this only after their
 * primary transaction commits. Payloads must contain the minimum fields the
 * authorized recipient needs; use `invalidate` when clients should refetch.
 */
export async function publishMobileChange(input: PublishMobileChangeInput) {
  const audienceStaffIds = Array.from(new Set(input.audienceStaffIds.filter(Boolean)));
  if (audienceStaffIds.length === 0) return;

  await db.query(
    `INSERT INTO mobile_sync_changes (
       audience_staff_id, entity_type, entity_id, operation, entity_version, payload
     )
     SELECT audience_staff_id, $2, $3, $4, $5, $6::jsonb
     FROM unnest($1::uuid[]) AS audience_staff_id`,
    [
      audienceStaffIds,
      input.entityType,
      input.entityId,
      input.operation,
      input.entityVersion || 1,
      JSON.stringify(input.payload ?? null),
    ]
  );
}
