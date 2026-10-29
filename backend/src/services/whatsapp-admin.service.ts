import { randomUUID } from 'node:crypto';

type Queryable = { query(sql: string, params?: any[]): Promise<{ rows: any[] }> };
export type PortalDatabase = Queryable & { getClient(): Promise<Queryable & { release(): void }> };
export type WhatsAppSettings = {
  enabled: boolean; sender_id: string | null; production_started_at: string | Date | null;
  hourly_limit: number; daily_limit: number; min_interval_seconds: number; max_age_hours: number;
};
export type Sender = { id: string; displayName: string; phone: string; status: string; liveStatus: string;
  cap: number; used: number; remaining: number; coldCap: number | null; coldLimitEnabled: boolean; coldUsed: number };
export class WhatsAppControlError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

export function validateSettingsInput(input: any) {
  if (!input || typeof input.enabled !== 'boolean' || typeof input.sender_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.sender_id)) {
    throw new WhatsAppControlError('invalid_settings', 400);
  }
  for (const [field, minimum, maximum] of [
    ['hourly_limit', 1, 500], ['daily_limit', 1, 2000], ['min_interval_seconds', 20, 3600], ['max_age_hours', 1, 48],
  ] as const) {
    if (!Number.isInteger(input[field]) || input[field] < minimum || input[field] > maximum) throw new WhatsAppControlError('invalid_limits', 400);
  }
  if (input.hourly_limit > input.daily_limit) throw new WhatsAppControlError('hourly_limit_exceeds_daily_limit', 400);
  return { enabled: input.enabled, sender_id: input.sender_id, hourly_limit: input.hourly_limit,
    daily_limit: input.daily_limit, min_interval_seconds: input.min_interval_seconds, max_age_hours: input.max_age_hours };
}

export async function readWhatsAppSettings(database: Queryable): Promise<WhatsAppSettings> {
  const result = await database.query('SELECT * FROM whatsapp_notification_settings WHERE singleton = true');
  if (!result.rows[0]) throw new WhatsAppControlError('settings_migration_required', 503);
  return result.rows[0];
}

export async function readCevoxStatus(request: typeof fetch = fetch) {
  const key = process.env.CEVOX_CONTROL_API_KEY;
  const base = new URL(process.env.CEVOX_CONTROL_API_BASE_URL || 'https://rqwaps.ribathulquran.in');
  if (!key || base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new WhatsAppControlError('cevox_control_credentials_required', 503);
  }
  let response: Response;
  try {
    response = await request(new URL('/api/stats', base), { headers: { 'x-api-key': key }, redirect: 'error', signal: AbortSignal.timeout(10_000) });
  } catch { throw new WhatsAppControlError('cevox_status_unavailable', 503); }
  if (!response.ok) throw new WhatsAppControlError('cevox_status_unavailable', 503);
  const body = await response.json().catch(() => null);
  if (!body || !Array.isArray(body.numbers) || !body.policy || typeof body.policy.inQuietHours !== 'boolean'
    || !Number.isInteger(body.policy.perContactHourly) || body.policy.perContactHourly < 1) {
    throw new WhatsAppControlError('invalid_cevox_status', 503);
  }
  const numbers: Sender[] = body.numbers.map((number: any) => {
    const coldLimitEnabled = typeof number.coldLimitEnabled === 'boolean'
      ? number.coldLimitEnabled : number.coldCap !== null;
    const validColdCap = Number.isFinite(number.coldCap)
      || (number.coldCap === null && coldLimitEnabled === false);
    if (typeof number.id !== 'string' || typeof number.status !== 'string' || typeof number.liveStatus !== 'string'
      || !['cap', 'used', 'remaining', 'coldUsed'].every(field => Number.isFinite(number[field]) && number[field] >= 0)
      || !validColdCap) {
      throw new WhatsAppControlError('invalid_cevox_status', 503);
    }
    return { id: number.id, displayName: String(number.displayName || 'WhatsApp sender'), phone: String(number.phone || ''),
      status: number.status, liveStatus: number.liveStatus, cap: number.cap, used: number.used,
      remaining: number.remaining, coldCap: number.coldCap, coldLimitEnabled, coldUsed: number.coldUsed };
  });
  return { numbers, policy: { inQuietHours: body.policy.inQuietHours, perContactHourly: body.policy.perContactHourly,
    quietHours: typeof body.policy.quietHours === 'string' ? body.policy.quietHours : null } };
}

export async function reserveWhatsAppSend(database: PortalDatabase, input: {
  requestId?: string; notificationId?: string; kind: 'production' | 'test'; senderId: string; recipient: string; actorId?: string;
}) {
  const requestId = input.requestId || randomUUID();
  const status = await readCevoxStatus();
  const sender = status.numbers.find(number => number.id === input.senderId && number.status === 'connected' && number.liveStatus === 'connected');
  if (!sender) throw new WhatsAppControlError('sender_not_connected');
  if (status.policy.inQuietHours) throw new WhatsAppControlError('provider_quiet_hours');
  if (sender.remaining < 1) throw new WhatsAppControlError('provider_daily_cap');
  const client = await database.getClient();
  try {
    await client.query('BEGIN');
    const locked = await client.query('SELECT * FROM whatsapp_notification_settings WHERE singleton = true FOR UPDATE');
    const settings = locked.rows[0];
    if (!settings) throw new WhatsAppControlError('settings_migration_required', 503);
    if (input.kind === 'production' && (!settings.enabled || !settings.production_started_at)) throw new WhatsAppControlError('sending_paused');
    if (settings.sender_id !== input.senderId) throw new WhatsAppControlError('sender_changed');
    const duplicate = await client.query('SELECT status FROM whatsapp_notification_attempts WHERE request_id = $1', [requestId]);
    if (duplicate.rows[0]) throw new WhatsAppControlError('test_already_attempted');
    if (input.kind === 'test') {
      const unresolved = await client.query(
        "SELECT id FROM whatsapp_notification_attempts WHERE kind = 'test' AND recipient = $1 AND status IN ('reserved', 'uncertain') AND created_at > now() - interval '24 hours' LIMIT 1", [input.recipient],
      );
      if (unresolved.rows.length) throw new WhatsAppControlError('previous_test_requires_review');
    }
    const counts = await client.query(
      `SELECT count(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS hourly,
              count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS daily,
              count(*) FILTER (WHERE recipient = $1 AND created_at >= now() - interval '1 hour')::int AS contact_hourly
       FROM whatsapp_notification_attempts WHERE status IN ('reserved', 'api_accepted', 'uncertain')`, [input.recipient],
    );
    if (counts.rows[0].hourly >= settings.hourly_limit) throw new WhatsAppControlError('app_hourly_cap');
    if (counts.rows[0].daily >= settings.daily_limit) throw new WhatsAppControlError('app_daily_cap');
    if (counts.rows[0].contact_hourly >= status.policy.perContactHourly) throw new WhatsAppControlError('contact_hourly_cap');
    const interval = await client.query(
      `SELECT last_attempt_at IS NOT NULL AND last_attempt_at > now() - ($1 * interval '1 second') AS waiting
       FROM whatsapp_notification_settings WHERE singleton = true`, [settings.min_interval_seconds],
    );
    if (interval.rows[0]?.waiting) throw new WhatsAppControlError('send_interval');
    const inserted = await client.query(
      `INSERT INTO whatsapp_notification_attempts(request_id, notification_id, kind, sender_id, recipient, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [requestId, input.notificationId || null, input.kind, input.senderId, input.recipient, input.actorId || null],
    );
    await client.query('UPDATE whatsapp_notification_settings SET last_attempt_at = now() WHERE singleton = true');
    await client.query('COMMIT');
    return inserted.rows[0].id as string;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function finishWhatsAppSend(database: Queryable, id: string, status: string, error: string | null) {
  const safeStatus = status === 'api_accepted' ? 'api_accepted' : status === 'uncertain' ? 'uncertain' : 'failed';
  await database.query(
    'UPDATE whatsapp_notification_attempts SET status = $2, error_code = $3, updated_at = now() WHERE id = $1 AND status = $4',
    [id, safeStatus, error, 'reserved'],
  );
}
