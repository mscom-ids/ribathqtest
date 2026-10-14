import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../config/db';
import { verifyToken } from '../middleware/auth.middleware';
import { createUnlockToken, verifyUnlockToken, readWhatsAppSettings, readCevoxStatus,
  validateSettingsInput, reserveWhatsAppSend, finishWhatsAppSend, WhatsAppControlError } from '../services/whatsapp-admin.service';
import { getMovementNotificationConfig, prepareMovementNotification, classifyMovementWebhookResult } from '../services/student-movement-notifications.service';

const router = Router();
const passcodeHash = () => process.env.WHATSAPP_ADMIN_PASSCODE_HASH || '';
const hashConfigured = () => /^\$2[ab]\$(1[0-5])\$[./A-Za-z0-9]{53}$/.test(passcodeHash());
const sessionToken = (req: Request) => req.headers.authorization?.replace(/^Bearer /, '') || req.cookies?.auth_token || '';
const wrap = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

router.use(verifyToken);
router.use((req, res, next) => { (async () => {
  res.setHeader('Cache-Control', 'no-store');
  const user = (req as any).user;
  if (user?.role !== 'admin' || user.token_use || req.headers['x-delegation-token']) {
    throw new WhatsAppControlError('admin_access_required', 403);
  }
  const staff = await db.query('SELECT role FROM staff WHERE id = $1', [user.id]);
  if (staff.rows[0]?.role !== 'admin') throw new WhatsAppControlError('admin_access_required', 403);
  (req as any).whatsappAdmin = user.id;
})().then(() => next()).catch(next); });

router.get('/session', wrap(async (req, res) => {
  const migration = await db.query("SELECT to_regclass('public.whatsapp_notification_settings') AS settings, to_regclass('public.whatsapp_notification_attempts') AS attempts");
  const configured = hashConfigured();
  res.json({ success: true, passcode_configured: configured, migration_ready: !!migration.rows[0]?.settings && !!migration.rows[0]?.attempts,
    control_mode: process.env.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED === 'true',
    production_environment_ready: process.env.WHATSAPP_SENDING_ENABLED === 'true' && process.env.N8N_STUDENT_MOVEMENT_ENABLED === 'true'
      && process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true',
    cevox_configured: !!process.env.CEVOX_CONTROL_API_KEY,
    test_recipient_configured: /^\+[1-9]\d{7,14}$/.test(process.env.N8N_STUDENT_MOVEMENT_TEST_PHONE || ''),
    test_recipient_hint: process.env.N8N_STUDENT_MOVEMENT_TEST_PHONE ? `ending ${process.env.N8N_STUDENT_MOVEMENT_TEST_PHONE.slice(-4)}` : 'not configured',
    unlocked: configured && verifyUnlockToken(String(req.headers['x-whatsapp-admin-unlock'] || ''), (req as any).whatsappAdmin,
      sessionToken(req), passcodeHash(), process.env.JWT_SECRET!),
  });
}));

router.post('/unlock', wrap(async (req, res) => {
  if (!hashConfigured()) throw new WhatsAppControlError('passcode_not_configured', 503);
  if (typeof req.body?.passcode !== 'string' || Buffer.byteLength(req.body.passcode) > 72 || req.body.passcode.length < 8) {
    throw new WhatsAppControlError('invalid_passcode', 403);
  }
  const actor = (req as any).whatsappAdmin;
  const attempt = await db.query(
    `INSERT INTO whatsapp_notification_unlock_attempts(actor_id, failures) VALUES ($1, 1)
     ON CONFLICT(actor_id) DO UPDATE SET
       failures = CASE WHEN whatsapp_notification_unlock_attempts.window_started_at < now() - interval '15 minutes'
         THEN 1 ELSE whatsapp_notification_unlock_attempts.failures + 1 END,
       window_started_at = CASE WHEN whatsapp_notification_unlock_attempts.window_started_at < now() - interval '15 minutes'
         THEN now() ELSE whatsapp_notification_unlock_attempts.window_started_at END RETURNING failures`, [actor],
  );
  if (attempt.rows[0].failures > 5) throw new WhatsAppControlError('too_many_passcode_attempts_wait_15_minutes', 429);
  if (!await bcrypt.compare(req.body.passcode, passcodeHash())) throw new WhatsAppControlError('invalid_passcode', 403);
  await db.query('DELETE FROM whatsapp_notification_unlock_attempts WHERE actor_id = $1', [actor]);
  await db.query('INSERT INTO whatsapp_notification_audit(actor_id, action) VALUES ($1, $2)', [actor, 'unlock']);
  res.json({ success: true, token: createUnlockToken(actor, sessionToken(req), passcodeHash(), process.env.JWT_SECRET!), expires_in_seconds: 600 });
}));

router.use((req, _res, next) => {
  if (!hashConfigured() || !verifyUnlockToken(String(req.headers['x-whatsapp-admin-unlock'] || ''), (req as any).whatsappAdmin,
    sessionToken(req), passcodeHash(), process.env.JWT_SECRET!)) return next(new WhatsAppControlError('passcode_unlock_required', 403));
  next();
});

router.get('/', wrap(async (_req, res) => {
  const settings = await readWhatsAppSettings(db);
  let provider: Awaited<ReturnType<typeof readCevoxStatus>> | null = null;
  let providerError: string | null = null;
  try { provider = await readCevoxStatus(); } catch (error) { providerError = error instanceof WhatsAppControlError ? error.code : 'cevox_status_unavailable'; }
  const usage = await db.query(
    `SELECT count(*) FILTER (WHERE status = 'api_accepted' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS sent_today,
            count(*) FILTER (WHERE status IN ('reserved', 'api_accepted', 'uncertain') AND created_at >= now() - interval '1 hour')::int AS hourly_reserved,
            count(*) FILTER (WHERE status IN ('reserved', 'api_accepted', 'uncertain') AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date)::int AS daily_reserved
     FROM whatsapp_notification_attempts`,
  );
  const queue = await db.query('SELECT status, count(*)::int AS count FROM student_movement_notifications GROUP BY status');
  const recent = await db.query('SELECT id, kind, status, error_code, created_at FROM whatsapp_notification_attempts ORDER BY created_at DESC LIMIT 15');
  const audit = await db.query('SELECT actor_id, action, details, created_at FROM whatsapp_notification_audit ORDER BY created_at DESC LIMIT 10');
  res.json({ success: true, settings, provider, provider_error: providerError, usage: usage.rows[0], queue: queue.rows,
    recent: recent.rows, audit: audit.rows, effective_environment_enabled: !!getMovementNotificationConfig() });
}));

router.post('/pause', wrap(async (req, res) => {
  if (process.env.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED !== 'true') throw new WhatsAppControlError('admin_control_mode_required', 503);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE whatsapp_notification_settings SET enabled = false, updated_at = now() WHERE singleton = true');
    await client.query('INSERT INTO whatsapp_notification_audit(actor_id, action) VALUES ($1, $2)', [(req as any).whatsappAdmin, 'pause']);
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.put('/', wrap(async (req, res) => {
  const input = validateSettingsInput(req.body);
  if (process.env.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED !== 'true') throw new WhatsAppControlError('admin_control_mode_required', 503);
  const provider = await readCevoxStatus();
  const sender = provider.numbers.find(number => number.id === input.sender_id && number.status === 'connected' && number.liveStatus === 'connected');
  if (!sender) throw new WhatsAppControlError('sender_not_connected');
  if (input.enabled && (!getMovementNotificationConfig() || process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED === 'true')) {
    throw new WhatsAppControlError('production_environment_not_ready', 503);
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const current = (await client.query('SELECT * FROM whatsapp_notification_settings WHERE singleton = true FOR UPDATE')).rows[0];
    if (!current) throw new WhatsAppControlError('settings_migration_required', 503);
    if (current.enabled && current.sender_id !== input.sender_id) throw new WhatsAppControlError('pause_before_switching_sender');
    const flight = await client.query("SELECT id FROM whatsapp_notification_attempts WHERE status = 'reserved' AND created_at >= now() - interval '3 minutes' LIMIT 1");
    if (current.sender_id !== input.sender_id && flight.rows.length) throw new WhatsAppControlError('wait_for_in_flight_message');
    const saved = await client.query(
      `UPDATE whatsapp_notification_settings SET enabled = $1, sender_id = $2, hourly_limit = $3, daily_limit = $4,
       min_interval_seconds = $5, max_age_hours = $6, production_started_at = CASE WHEN $1 THEN COALESCE(production_started_at, now())
         ELSE production_started_at END, updated_at = now() WHERE singleton = true RETURNING *`,
      [input.enabled, input.sender_id, input.hourly_limit, input.daily_limit, input.min_interval_seconds, input.max_age_hours],
    );
    await client.query('INSERT INTO whatsapp_notification_audit(actor_id, action, details) VALUES ($1, $2, $3::jsonb)',
      [(req as any).whatsappAdmin, input.enabled ? 'enable_or_update' : 'configure_paused', JSON.stringify(input)]);
    await client.query('COMMIT');
    res.json({ success: true, settings: saved.rows[0] });
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}));

router.post('/test', wrap(async (req, res) => {
  const requestId = req.body?.request_id;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new WhatsAppControlError('invalid_test_request', 400);
  const settings = await readWhatsAppSettings(db);
  if (!settings.sender_id) throw new WhatsAppControlError('select_sender_first');
  const config = getMovementNotificationConfig({ ...process.env, WHATSAPP_SENDING_ENABLED: 'false',
    N8N_STUDENT_MOVEMENT_ENABLED: 'true', N8N_STUDENT_MOVEMENT_TEST_ENABLED: 'true' });
  if (!config || config.testStudentId !== 'R999' || !config.testRecipient) throw new WhatsAppControlError('r999_test_configuration_required', 503);
  const student = await db.query("SELECT name FROM students WHERE adm_no = 'R999' AND name = 'WhatsApp Test Student - Do Not Use' AND comprehensive_details->>'whatsapp_notification_test' = 'true'");
  if (student.rows.length !== 1) throw new WhatsAppControlError('marked_r999_required');
  const payload = prepareMovementNotification(requestId, { event: 'student_exit', to: `+${config.testRecipient}`,
    student_name: student.rows[0].name, companion_name: 'Test Guardian', companion_relationship: 'Father', occurred_at: new Date().toISOString() }, settings.sender_id);
  const attemptId = await reserveWhatsAppSend(db, { requestId, kind: 'test', senderId: settings.sender_id,
    recipient: config.testRecipient, actorId: (req as any).whatsappAdmin });
  let outcome: { status: string; error: string | null } = { status: 'uncertain', error: 'webhook_request_outcome_unknown' };
  try {
    const response = await fetch(config.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-erp-webhook-secret': config.secret },
      body: JSON.stringify({ ...payload, student_id: 'R999', test_notification: true }), redirect: 'error', signal: AbortSignal.timeout(75_000) });
    outcome = classifyMovementWebhookResult(response.status, await response.json().catch(() => null), requestId);
  } catch {}
  await finishWhatsAppSend(db, attemptId, outcome.status, outcome.error);
  await db.query('INSERT INTO whatsapp_notification_audit(actor_id, action, details) VALUES ($1, $2, $3::jsonb)',
    [(req as any).whatsappAdmin, 'test', JSON.stringify({ request_id: requestId, status: outcome.status })]);
  res.json({ success: true, status: outcome.status, error: outcome.error, request_id: requestId,
    message: 'Only the configured R999 test recipient was targeted. API acceptance does not confirm delivery.' });
}));

router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const known = error instanceof WhatsAppControlError;
  res.status(known ? error.status : 503).json({ success: false, error: known ? error.code : 'notification_controls_unavailable_check_server_configuration' });
});

export default router;
