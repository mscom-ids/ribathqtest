import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';
import { RegisterDeviceInput } from './mobile-sync.validation';

if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is required.');
const JWT_SECRET = process.env.JWT_SECRET as string;

function positiveNumber(value: string | undefined, fallback: number, minimum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

const ACCESS_TOKEN_TTL_SECONDS = positiveNumber(process.env.MOBILE_ACCESS_TOKEN_TTL_SECONDS, 900, 300);
const REFRESH_TOKEN_TTL_DAYS = positiveNumber(process.env.MOBILE_REFRESH_TOKEN_TTL_DAYS, 30, 1);
const SESSION_FAMILY_TTL_DAYS = Math.max(
  REFRESH_TOKEN_TTL_DAYS,
  positiveNumber(process.env.MOBILE_SESSION_FAMILY_TTL_DAYS, 90, 1)
);

export class MobileSessionError extends Error {
  constructor(public readonly reason: 'invalid' | 'expired' | 'reused') {
    super(reason === 'reused' ? 'Refresh token reuse detected. Sign in again.' : 'Mobile session expired. Sign in again.');
    this.name = 'MobileSessionError';
  }
}

function makeRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token, 'utf8').digest();
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function signAccessToken(staff: any, deviceId: string) {
  return jwt.sign(
    {
      id: staff.id,
      profile_id: staff.profile_id,
      email: staff.email,
      role: staff.role,
      name: staff.name,
      token_use: 'mobile_access',
      device_id: deviceId,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );
}

export async function createMobileSession(staff: any, device: RegisterDeviceInput) {
  const client = await db.getClient();
  const refreshToken = makeRefreshToken();
  const now = new Date();
  const expiresAt = addDays(now, REFRESH_TOKEN_TTL_DAYS);
  const familyExpiresAt = addDays(now, SESSION_FAMILY_TTL_DAYS);

  try {
    await client.query('BEGIN');
    if (device.pushToken) {
      await client.query(
        `UPDATE mobile_devices
         SET push_token = NULL
         WHERE push_token = $1
           AND NOT (staff_id = $2 AND installation_id = $3)`,
        [device.pushToken, staff.id, device.installationId]
      );
    }

    const deviceResult = await client.query(
      `INSERT INTO mobile_devices (
         staff_id, installation_id, platform, device_name, app_version, os_version, push_token
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (staff_id, installation_id) DO UPDATE
       SET platform = EXCLUDED.platform,
           device_name = EXCLUDED.device_name,
           app_version = EXCLUDED.app_version,
           os_version = EXCLUDED.os_version,
           push_token = EXCLUDED.push_token,
           last_seen_at = now(),
           revoked_at = NULL
       RETURNING id, installation_id, platform, last_sync_cursor`,
      [staff.id, device.installationId, device.platform, device.deviceName, device.appVersion, device.osVersion, device.pushToken]
    );
    const mobileDevice = deviceResult.rows[0];

    await client.query(
      `INSERT INTO mobile_refresh_sessions (
         family_id, staff_id, device_id, token_hash, expires_at, family_expires_at
       ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [staff.id, mobileDevice.id, hashRefreshToken(refreshToken), expiresAt, familyExpiresAt]
    );
    await client.query('COMMIT');

    return {
      accessToken: signAccessToken(staff, mobileDevice.id),
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      device: mobileDevice,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function rotateMobileSession(deviceId: string, currentToken: string) {
  const client = await db.getClient();
  const nextToken = makeRefreshToken();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT session.*, staff.email, staff.name, staff.role, staff.profile_id,
              COALESCE(staff.is_active, true) AS staff_is_active,
              device.revoked_at AS device_revoked_at
       FROM mobile_refresh_sessions session
       JOIN staff ON staff.id = session.staff_id
       JOIN mobile_devices device ON device.id = session.device_id
       WHERE session.token_hash = $1 AND session.device_id = $2
       FOR UPDATE OF session`,
      [hashRefreshToken(currentToken), deviceId]
    );
    const session = result.rows[0];
    if (!session) {
      await client.query('ROLLBACK');
      throw new MobileSessionError('invalid');
    }

    if (session.revoked_at || session.replaced_by) {
      await client.query(
        `UPDATE mobile_refresh_sessions
         SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'token_reuse')
         WHERE family_id = $1`,
        [session.family_id]
      );
      await client.query('COMMIT');
      throw new MobileSessionError('reused');
    }

    const now = new Date();
    if (!session.staff_is_active || session.device_revoked_at || new Date(session.expires_at) <= now || new Date(session.family_expires_at) <= now) {
      await client.query(
        `UPDATE mobile_refresh_sessions
         SET revoked_at = now(), revoke_reason = 'expired_or_inactive'
         WHERE family_id = $1 AND revoked_at IS NULL`,
        [session.family_id]
      );
      await client.query('COMMIT');
      throw new MobileSessionError('expired');
    }

    const normalExpiry = addDays(now, REFRESH_TOKEN_TTL_DAYS);
    const familyExpiry = new Date(session.family_expires_at);
    const nextExpiry = normalExpiry < familyExpiry ? normalExpiry : familyExpiry;
    const nextResult = await client.query(
      `INSERT INTO mobile_refresh_sessions (
         family_id, staff_id, device_id, token_hash, expires_at, family_expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [session.family_id, session.staff_id, session.device_id, hashRefreshToken(nextToken), nextExpiry, familyExpiry]
    );
    await client.query(
      `UPDATE mobile_refresh_sessions
       SET revoked_at = now(), revoke_reason = 'rotated', replaced_by = $2, last_used_at = now()
       WHERE id = $1`,
      [session.id, nextResult.rows[0].id]
    );
    await client.query('UPDATE mobile_devices SET last_seen_at = now() WHERE id = $1', [session.device_id]);
    await client.query('COMMIT');

    return {
      accessToken: signAccessToken(session, session.device_id),
      refreshToken: nextToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt: nextExpiry.toISOString(),
    };
  } catch (error) {
    if (!(error instanceof MobileSessionError)) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeMobileSession(deviceId: string, refreshToken: string) {
  await db.query(
    `UPDATE mobile_refresh_sessions
     SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = COALESCE(revoke_reason, 'logout')
     WHERE device_id = $1 AND token_hash = $2`,
    [deviceId, hashRefreshToken(refreshToken)]
  );
}
