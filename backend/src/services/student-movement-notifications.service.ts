import { isWhatsAppSendingEnabled } from './whatsapp-safety';
import { readWhatsAppSettings, reserveWhatsAppSend, finishWhatsAppSend, WhatsAppControlError, PortalDatabase } from './whatsapp-admin.service';

type Database = {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
};

type MovementEvent = 'student_exit' | 'student_return';
type NotificationStatus = 'api_accepted' | 'failed' | 'uncertain' | 'skipped' | 'pending';

const eligibleMovementLeaveSql = `(
  sl.leave_type IN ('out-campus', 'outdoor')
  OR (sl.leave_type = 'institutional' AND EXISTS (
    SELECT 1 FROM institutional_leaves il
    WHERE il.id = sl.institutional_leave_id AND il.campus_location = 'outside'
  ))
)`;

export type MovementNotificationConfig = {
  webhookUrl: string;
  secret: string;
  phoneField: 'phone_number' | 'phone';
  senderId?: string;
  testRecipient?: string;
  testStudentId?: string;
  productionStartAt?: string;
  adminControls?: boolean;
  maxAgeHours?: number;
};

export function getMovementNotificationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): MovementNotificationConfig | null {
  const testMode = environment.N8N_STUDENT_MOVEMENT_TEST_ENABLED === 'true';
  const adminControls = !testMode && environment.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED === 'true';
  if ((!isWhatsAppSendingEnabled(environment) && !testMode) || environment.N8N_STUDENT_MOVEMENT_ENABLED !== 'true') return null;
  let testRecipient: string | undefined;
  let testStudentId: string | undefined;
  let productionStartAt: string | undefined;
  if (testMode) {
    const testPhone = environment.N8N_STUDENT_MOVEMENT_TEST_PHONE?.trim() || '';
    if (!/^\+[1-9]\d{7,14}$/.test(testPhone)) {
      throw new Error('Test mode requires N8N_STUDENT_MOVEMENT_TEST_PHONE in international +countrycode format');
    }
    testRecipient = testPhone.slice(1);
    testStudentId = environment.N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID?.trim();
    if (!testStudentId || !/^R\d{3}$/.test(testStudentId)) {
      throw new Error('Test mode requires a dedicated N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID like R999');
    }
  } else if (!adminControls) {
    const startAt = environment.N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT?.trim() || '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(startAt)
      || !Number.isFinite(new Date(startAt).getTime())) {
      throw new Error('Production sending requires N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT as a fixed ISO timestamp with timezone');
    }
    productionStartAt = new Date(startAt).toISOString();
  }
  const webhookUrl = environment.N8N_STUDENT_MOVEMENT_WEBHOOK_URL?.trim() || '';
  const secret = environment.N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET?.trim() || '';
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new Error('N8N_STUDENT_MOVEMENT_WEBHOOK_URL must be a production HTTPS webhook URL');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password
    || parsedUrl.search || parsedUrl.hash || !parsedUrl.pathname.startsWith('/webhook/')) {
    throw new Error('N8N_STUDENT_MOVEMENT_WEBHOOK_URL must be a production HTTPS webhook URL');
  }
  if (secret.length < 32 || /[\r\n]/.test(secret)) {
    throw new Error('N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET must contain at least 32 characters');
  }
  const phoneField = environment.N8N_STUDENT_MOVEMENT_PHONE_FIELD || 'phone_number';
  if (phoneField !== 'phone_number' && phoneField !== 'phone') {
    throw new Error('N8N_STUDENT_MOVEMENT_PHONE_FIELD must be phone_number or phone');
  }
  const senderId = environment.N8N_STUDENT_MOVEMENT_WA_NUMBER_ID?.trim() || undefined;
  if (senderId && (senderId.length > 150 || /[\r\n\u0000-\u001f]/.test(senderId))) {
    throw new Error('N8N_STUDENT_MOVEMENT_WA_NUMBER_ID is invalid');
  }
  return {
    webhookUrl, secret, phoneField,
    senderId, testRecipient, testStudentId, productionStartAt, adminControls,
  };
}

function movementSendingAllowed(config: MovementNotificationConfig) {
  if (config.testRecipient && config.testStudentId) {
    return process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED === 'true';
  }
  return (!!config.productionStartAt || config.adminControls) && isWhatsAppSendingEnabled()
    && process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true';
}

export async function getActiveMovementNotificationConfig(database: Database, config = getMovementNotificationConfig()) {
  if (!config?.adminControls) return config;
  const settings = await readWhatsAppSettings(database);
  if (!settings.enabled || !settings.sender_id || !settings.production_started_at) return null;
  return { ...config, senderId: settings.sender_id, productionStartAt: new Date(settings.production_started_at).toISOString(), maxAgeHours: settings.max_age_hours };
}

export async function enqueueMovementNotifications(
  client: Database,
  leaveIds: string[],
  event: MovementEvent,
  occurredAt: string,
) {
  const config = await getActiveMovementNotificationConfig(client);
  if (!config || leaveIds.length === 0) return;
  if (config.productionStartAt && new Date(occurredAt).getTime() < new Date(config.productionStartAt).getTime()) return;
  await client.query(
    `INSERT INTO student_movement_notifications (id, leave_id, event, payload, next_attempt_at)
     SELECT gen_random_uuid(), sl.id, $2,
            jsonb_build_object(
              'event', $2::text,
              'to', CASE WHEN $4::text IS NULL THEN s.${config.phoneField} ELSE $5::text END,
              'student_id', s.adm_no,
              'test_notification', $4::text IS NOT NULL,
              'student_name', s.name,
              'companion_name', sl.companion_name,
              'companion_relationship', sl.companion_relationship,
              'occurred_at', $3::timestamptz
            ), GREATEST(now(), $3::timestamptz)
     FROM student_leaves sl
     JOIN students s ON s.adm_no = sl.student_id
     WHERE sl.id = ANY($1::uuid[])
       AND ${eligibleMovementLeaveSql}
       AND sl.status <> 'cancelled'
       AND ($6::timestamptz IS NULL OR (
         sl.created_at >= $6::timestamptz AND sl.start_datetime >= $6::timestamptz
         AND $3::timestamptz >= $6::timestamptz
         AND COALESCE(s.comprehensive_details->>'whatsapp_notification_test', 'false') <> 'true'
       ))
       AND ($4::text IS NULL OR (s.adm_no = $4 AND s.comprehensive_details->>'whatsapp_notification_test' = 'true'))
     ON CONFLICT (leave_id, event) DO NOTHING`,
    [leaveIds, event, occurredAt, config.testStudentId || null, config.testRecipient || null, config.productionStartAt || null],
  );
}

export function prepareMovementNotification(
  notificationId: string,
  source: Record<string, unknown>,
  senderId?: string,
): Record<string, string> {
  const text = (field: string) => {
    const value = source[field];
    if (typeof value !== 'string' || !value.trim() || value.length > 150
      || /[\r\n\u0000-\u001f]/.test(value)) {
      throw new Error(`invalid_${field}`);
    }
    return value.trim();
  };
  const event = text('event');
  if (event !== 'student_exit' && event !== 'student_return') throw new Error('invalid_event');
  const rawPhone = typeof source.to === 'string' ? source.to.trim() : '';
  if (!rawPhone || !/^\+?[\d\s()-]+$/.test(rawPhone)) throw new Error('invalid_guardian_phone');
  let phone = rawPhone.replace(/\D/g, '');
  if (rawPhone.startsWith('00')) phone = phone.slice(2);
  if (!rawPhone.startsWith('+') && !rawPhone.startsWith('00') && phone.length === 10) phone = `91${phone}`;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('invalid_guardian_phone');
  const occurredAt = new Date(text('occurred_at'));
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('invalid_occurred_at');
  const payload: Record<string, string> = {
    notification_id: notificationId,
    event,
    to: phone,
    student_name: text('student_name'),
    occurred_at: occurredAt.toISOString(),
  };
  if (event === 'student_exit') {
    payload.companion_name = text('companion_name');
    payload.companion_relationship = text('companion_relationship');
  }
  if (senderId) payload.wa_number_id = senderId;
  return payload;
}

export async function refreshPendingMovementNotifications(client: Database, leaveId: string) {
  const config = await getActiveMovementNotificationConfig(client);
  if (!config) return;
  await client.query(
    `UPDATE student_movement_notifications notification
     SET payload = notification.payload || jsonb_build_object(
           'companion_name', sl.companion_name,
           'companion_relationship', sl.companion_relationship,
           'occurred_at', CASE WHEN notification.event = 'student_exit'
             THEN sl.start_datetime ELSE sl.actual_return_datetime END
         ),
         next_attempt_at = GREATEST(now(), CASE WHEN notification.event = 'student_exit'
           THEN sl.start_datetime ELSE sl.actual_return_datetime END),
         updated_at = now()
     FROM student_leaves sl
     WHERE notification.leave_id = sl.id AND sl.id = $1 AND notification.status = 'pending'
       AND ${eligibleMovementLeaveSql}
       AND ($2::timestamptz IS NULL OR (
         notification.created_at >= $2::timestamptz
         AND sl.created_at >= $2::timestamptz AND sl.start_datetime >= $2::timestamptz
         AND COALESCE(notification.payload->>'test_notification', 'false') <> 'true'
       ))`,
    [leaveId, config.productionStartAt || null],
  );
}

export function classifyMovementWebhookResult(
  httpStatus: number,
  response: unknown,
  notificationId: string,
): { status: NotificationStatus; error: string | null } {
  if ([401, 403, 404].includes(httpStatus)) {
    return { status: httpStatus === 404 ? 'pending' : 'failed', error: `webhook_http_${httpStatus}` };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { status: 'uncertain', error: `webhook_http_${httpStatus}` };
  }
  if (!response || typeof response !== 'object') return { status: 'uncertain', error: 'invalid_webhook_response' };
  const result = response as Record<string, unknown>;
  if (result.notification_id !== notificationId) return { status: 'uncertain', error: 'notification_id_mismatch' };
  const gatewayStatus = Number(result.cevox_http_status);
  const gateway = result.cevox_response;
  if (!gateway || typeof gateway !== 'object') return { status: 'uncertain', error: 'invalid_cevox_response' };
  const body = gateway as Record<string, unknown>;
  if (gatewayStatus < 200 || gatewayStatus >= 300 || !Number.isFinite(gatewayStatus)) {
    const rejectedBeforeSend: Record<string, number> = {
      no_number: 404, not_ready: 503, paused: 423, quiet_hours: 425,
      cooldown: 429, hourly_limit: 429, cap_reached: 429, cold_cap_reached: 429,
    };
    if (typeof body.code === 'string' && Object.prototype.hasOwnProperty.call(rejectedBeforeSend, body.code)
      && gatewayStatus === rejectedBeforeSend[body.code] && typeof body.error === 'string') {
      return { status: 'pending', error: `cevox_${body.code}` };
    }
    return { status: 'uncertain', error: 'cevox_http_not_successful' };
  }
  if (body.success === false || body.error || body.status === 'failed') {
    return { status: 'failed', error: 'cevox_rejected' };
  }
  if (body.status === 'sent' || body.status === 'queued' || body.success === true) {
    return { status: 'api_accepted', error: null };
  }
  return { status: 'uncertain', error: 'unrecognized_cevox_response' };
}

export async function processMovementNotification(
  database: Database,
  config: MovementNotificationConfig,
  request: typeof fetch = fetch,
  notificationId?: string,
): Promise<boolean> {
  if (!movementSendingAllowed(config)) return false;
  if (config.adminControls) {
    const active = await getActiveMovementNotificationConfig(database, config);
    if (!active) return false;
    config = active;
  }
  const claimed = await database.query(
    `WITH candidate AS (
       SELECT notification.id
       FROM student_movement_notifications notification
       WHERE notification.status = 'pending' AND notification.next_attempt_at <= now()
         AND EXISTS (
           SELECT 1 FROM student_leaves sl JOIN students s ON s.adm_no = sl.student_id
           WHERE sl.id = notification.leave_id AND sl.status <> 'cancelled'
             AND ${eligibleMovementLeaveSql}
             AND ($3::timestamptz IS NULL OR (
               notification.created_at >= $3::timestamptz
               AND sl.created_at >= $3::timestamptz AND sl.start_datetime >= $3::timestamptz
               AND CASE WHEN notification.event = 'student_exit' THEN sl.start_datetime
                        ELSE sl.actual_return_datetime END >= $3::timestamptz
               AND COALESCE(notification.payload->>'test_notification', 'false') <> 'true'
               AND COALESCE(s.comprehensive_details->>'whatsapp_notification_test', 'false') <> 'true'
             ))
         )
         AND ($2::uuid IS NULL OR notification.id = $2::uuid)
         AND ($1::text IS NULL OR (
           notification.payload->>'student_id' = $1
           AND notification.payload->>'test_notification' = 'true'
           AND EXISTS (
             SELECT 1 FROM student_leaves sl JOIN students s ON s.adm_no = sl.student_id
             WHERE sl.id = notification.leave_id AND s.adm_no = $1
               AND s.comprehensive_details->>'whatsapp_notification_test' = 'true'
           )
         ))
         AND NOT EXISTS (
           SELECT 1 FROM student_movement_notifications earlier
           WHERE earlier.leave_id = notification.leave_id
             AND earlier.event = 'student_exit' AND notification.event = 'student_return'
             AND earlier.status IN ('pending', 'processing')
         )
       ORDER BY notification.created_at, notification.id
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE student_movement_notifications notification
     SET status = 'processing', processing_started_at = now(),
         attempts = attempts + 1, updated_at = now()
     FROM candidate WHERE notification.id = candidate.id
     RETURNING notification.id, notification.payload, notification.attempts`,
    [config.testStudentId || null, notificationId || null, config.productionStartAt || null],
  );
  const notification = claimed.rows[0];
  if (!notification) return false;
  let outcome: { status: NotificationStatus; error: string | null } = {
    status: 'skipped', error: 'invalid_payload',
  };
  let payload: Record<string, string> | undefined;
  try {
    if (config.testRecipient && (notification.payload.student_id !== config.testStudentId
      || notification.payload.test_notification !== true)) {
      throw new Error('blocked_non_test_student');
    }
    payload = prepareMovementNotification(notification.id, {
      ...notification.payload,
      ...(config.testRecipient ? { to: `+${config.testRecipient}` } : {}),
    }, config.senderId);
    if (config.testRecipient) payload.student_id = config.testStudentId!;
  } catch (error) {
    outcome = { status: 'skipped', error: error instanceof Error ? error.message : 'invalid_payload' };
  }
  if (payload) {
    if (!movementSendingAllowed(config)) {
      await database.query(
        `UPDATE student_movement_notifications
         SET status = 'pending', processing_started_at = NULL, updated_at = now()
         WHERE id = $1 AND status = 'processing'`,
        [notification.id],
      );
      return false;
    }
    let attemptId: string | undefined;
    if (config.adminControls) {
      try {
        attemptId = await reserveWhatsAppSend(database as PortalDatabase, {
          kind: 'production', notificationId: notification.id, senderId: config.senderId!, recipient: payload.to,
        });
      } catch (error) {
        const code = error instanceof WhatsAppControlError ? error.code : 'send_reservation_unavailable';
        await database.query(
          `UPDATE student_movement_notifications SET status = 'pending', last_error = $2,
           processing_started_at = NULL, next_attempt_at = now() + interval '5 minutes', updated_at = now()
           WHERE id = $1 AND status = 'processing'`, [notification.id, code],
        );
        return false;
      }
    }
    try {
      const response = await request(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-erp-webhook-secret': config.secret },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(75_000),
      });
      const result: unknown = await response.json().catch(() => null);
      outcome = classifyMovementWebhookResult(response.status, result, notification.id);
    } catch {
      outcome = { status: 'uncertain', error: 'webhook_request_outcome_unknown' };
    }
    if (attemptId) await finishWhatsAppSend(database, attemptId, outcome.status, outcome.error);
  }
  const finalOutcome = outcome;
  if (finalOutcome.status === 'pending' && finalOutcome.error === 'webhook_http_404' && notification.attempts >= 5) {
    finalOutcome.status = 'failed';
  }
  const retryDelay = finalOutcome.error && ['cevox_hourly_limit', 'cevox_cap_reached', 'cevox_cold_cap_reached'].includes(finalOutcome.error)
    ? 3600 : finalOutcome.error === 'cevox_quiet_hours' ? 1800 : 300;
  await database.query(
    `UPDATE student_movement_notifications
     SET status = $2, last_error = $3, processing_started_at = NULL,
         next_attempt_at = now() + ($4 * interval '1 second'), updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [notification.id, finalOutcome.status, finalOutcome.error, retryDelay],
  );
  console.log(`[MOVEMENT NOTIFICATION] ${notification.id} ${finalOutcome.status}`);
  return true;
}

export function startMovementNotificationWorker(database: Database) {
  const baseConfig = getMovementNotificationConfig();
  if (!baseConfig) return null;
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped || !movementSendingAllowed(baseConfig)) return;
    running = true;
    try {
      const config = await getActiveMovementNotificationConfig(database, baseConfig);
      if (!config) return;
      if (config.adminControls) {
        await database.query(
          `UPDATE student_movement_notifications notification SET status = 'skipped', last_error = 'expired_or_already_returned', updated_at = now()
           FROM student_leaves sl WHERE notification.leave_id = sl.id AND notification.status = 'pending' AND (
             CASE WHEN notification.event = 'student_exit' THEN sl.start_datetime ELSE sl.actual_return_datetime END
               < now() - ($1 * interval '1 hour')
             OR (notification.event = 'student_exit' AND sl.actual_return_datetime IS NOT NULL)
           )`, [config.maxAgeHours],
        );
        await database.query("UPDATE whatsapp_notification_attempts SET status = 'uncertain', error_code = 'interrupted_attempt', updated_at = now() WHERE status = 'reserved' AND created_at < now() - interval '3 minutes'");
      }
      if (config.productionStartAt) {
        await database.query(
          `UPDATE student_movement_notifications notification
           SET status = 'skipped', last_error = 'before_production_start_or_test', updated_at = now()
           WHERE notification.status = 'pending' AND (
             notification.created_at < $1::timestamptz
             OR COALESCE(notification.payload->>'test_notification', 'false') = 'true'
             OR NOT EXISTS (
               SELECT 1 FROM student_leaves sl JOIN students s ON s.adm_no = sl.student_id
               WHERE sl.id = notification.leave_id
                 AND sl.created_at >= $1::timestamptz AND sl.start_datetime >= $1::timestamptz
                 AND CASE WHEN notification.event = 'student_exit' THEN sl.start_datetime
                          ELSE sl.actual_return_datetime END >= $1::timestamptz
                 AND COALESCE(s.comprehensive_details->>'whatsapp_notification_test', 'false') <> 'true'
             )
           )`,
          [config.productionStartAt],
        );
      }
      await database.query(
        `UPDATE student_movement_notifications notification
         SET status = 'skipped', last_error = 'leave_type_not_notifiable', updated_at = now()
         WHERE notification.status = 'pending' AND NOT EXISTS (
           SELECT 1 FROM student_leaves sl
           WHERE sl.id = notification.leave_id AND ${eligibleMovementLeaveSql}
         )`,
      );
      await database.query(
        `UPDATE student_movement_notifications notification
         SET status = 'skipped', last_error = 'leave_cancelled', updated_at = now()
         FROM student_leaves sl
         WHERE notification.leave_id = sl.id AND sl.status = 'cancelled'
           AND notification.status = 'pending'`,
      );
      await database.query(
        `UPDATE student_movement_notifications
         SET status = 'uncertain', last_error = 'worker_interrupted', updated_at = now(),
             processing_started_at = NULL
         WHERE status = 'processing' AND processing_started_at < now() - interval '3 minutes'`,
      );
      for (let processed = 0; processed < 10 && !stopped; processed++) {
        if (!await processMovementNotification(database, config)) break;
      }
    } catch {
      console.error('[MOVEMENT NOTIFICATION] Queue processing failed; check database connectivity and migration');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, 5000);
  timer.unref();
  void tick();
  console.log('[MOVEMENT NOTIFICATION] n8n worker enabled');
  return () => { stopped = true; clearInterval(timer); };
}
