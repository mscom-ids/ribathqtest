import assert from 'node:assert/strict';
import { validateSettingsInput, readCevoxStatus,
  reserveWhatsAppSend, WhatsAppControlError, PortalDatabase } from '../services/whatsapp-admin.service';
import { getActiveMovementNotificationConfig, getMovementNotificationConfig, classifyMovementWebhookResult,
  processMovementNotification, requeueVerifiedUnsentMovementNotification } from '../services/student-movement-notifications.service';

async function main() {
  const senderId = '11111111-1111-4111-8111-111111111111';
  const settings = { enabled: false, sender_id: senderId, hourly_limit: 30, daily_limit: 100,
    min_interval_seconds: 60, max_age_hours: 24, production_started_at: null as string | null };
  assert.equal(validateSettingsInput(settings).sender_id, senderId);
  for (const invalid of [{ enabled: 'true' }, { sender_id: 'https://untrusted.example' }, { daily_limit: 0 },
    { min_interval_seconds: 0 }, { hourly_limit: 101 }, { max_age_hours: 999 }]) {
    assert.throws(() => validateSettingsInput({ ...settings, ...invalid }));
  }
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { WHATSAPP_SENDING_ENABLED: 'true', N8N_STUDENT_MOVEMENT_ENABLED: 'true',
      N8N_STUDENT_MOVEMENT_TEST_ENABLED: 'false', N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED: 'true',
      N8N_STUDENT_MOVEMENT_WEBHOOK_URL: 'https://example.com/webhook/movement',
      N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET: 'test-only-secret-with-at-least-32-characters',
      CEVOX_CONTROL_API_BASE_URL: 'https://example.com', CEVOX_CONTROL_API_KEY: 'test-only-api-key' });
    delete process.env.N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT;
    const config = getMovementNotificationConfig()!;
    assert.equal(config.adminControls, true);
    assert.equal(config.productionStartAt, undefined);
    const configDatabase = { query: async () => ({ rows: [{ ...settings }] }) };
    assert.equal(await getActiveMovementNotificationConfig(configDatabase, config), null, 'Controls default paused, even with the environment armed');
    let requests = 0;
    assert.equal(await processMovementNotification(configDatabase, config, async () => { requests++; throw new Error('Must not send while paused'); }), false);
    assert.equal(requests, 0);
    settings.enabled = true;
    settings.production_started_at = '2026-10-14T08:00:00Z';
    const active = await getActiveMovementNotificationConfig(configDatabase, config);
    assert.equal(active?.senderId, senderId);
    assert.equal(active?.productionStartAt, '2026-10-14T08:00:00.000Z');
    const provider = { numbers: [{ id: senderId, displayName: 'School', phone: '919000000001', status: 'connected',
      liveStatus: 'connected', cap: 100, used: 0, remaining: 100, coldCap: 20 as number | null, coldLimitEnabled: true, coldUsed: 0 }],
      policy: { inQuietHours: false, perContactHourly: 4, quietHours: '21:00–8:00' } };
    globalThis.fetch = async (_url, options) => {
      assert.equal((options?.headers as Record<string, string>)['x-api-key'], 'test-only-api-key');
      return new Response(JSON.stringify(provider), { status: 200 });
    };
    assert.equal((await readCevoxStatus()).numbers[0].cap, 100);
    provider.numbers[0].coldCap = null;
    provider.numbers[0].coldLimitEnabled = false;
    const coldLimitDisabled = (await readCevoxStatus()).numbers[0];
    assert.equal(coldLimitDisabled.coldCap, null);
    assert.equal(coldLimitDisabled.coldLimitEnabled, false);
    provider.numbers[0].coldCap = 20;
    provider.numbers[0].coldLimitEnabled = true;
    let hourly = 0;
    let daily = 0;
    let contactHourly = 0;
    let waiting = false;
    let duplicate = false;
    const statements: string[] = [];
    const database: PortalDatabase = {
      query: async () => ({ rows: [] }),
      getClient: async () => ({ release() {}, async query(sql) {
        statements.push(sql);
        if (sql.includes('FOR UPDATE')) return { rows: [{ ...settings }] };
        if (sql.includes('WHERE request_id')) return { rows: duplicate ? [{ status: 'api_accepted' }] : [] };
        if (sql.includes('contact_hourly')) return { rows: [{ hourly, daily, contact_hourly: contactHourly }] };
        if (sql.includes('AS waiting')) return { rows: [{ waiting }] };
        if (sql.includes('RETURNING id')) return { rows: [{ id: 'attempt-id' }] };
        return { rows: [] };
      } }),
    };
    const input = { kind: 'production' as const, senderId, recipient: '919000000002' };
    assert.equal(await reserveWhatsAppSend(database, input), 'attempt-id');
    assert.ok(statements.indexOf('BEGIN') < statements.findIndex(sql => sql.includes('FOR UPDATE')));
    assert.ok(statements.findIndex(sql => sql.includes('FOR UPDATE')) < statements.findIndex(sql => sql.includes('contact_hourly')));
    const expectBlocked = async (code: string) => {
      const before = statements.filter(sql => sql.includes('INSERT INTO whatsapp_notification_attempts')).length;
      await assert.rejects(reserveWhatsAppSend(database, input), error => error instanceof WhatsAppControlError && error.code === code);
      assert.equal(statements.filter(sql => sql.includes('INSERT INTO whatsapp_notification_attempts')).length, before);
    };
    hourly = 30; await expectBlocked('app_hourly_cap'); hourly = 0;
    daily = 100; await expectBlocked('app_daily_cap'); daily = 0;
    contactHourly = 4; await expectBlocked('contact_hourly_cap'); contactHourly = 0;
    waiting = true; await expectBlocked('send_interval'); waiting = false;
    duplicate = true; await expectBlocked('test_already_attempted'); duplicate = false;
    settings.enabled = false; await expectBlocked('sending_paused'); settings.enabled = true;
    settings.sender_id = 'changed'; await expectBlocked('sender_changed'); settings.sender_id = senderId;
    provider.numbers[0].remaining = 0; await expectBlocked('provider_daily_cap'); provider.numbers[0].remaining = 100;
    provider.policy.inQuietHours = true; await expectBlocked('provider_quiet_hours'); provider.policy.inQuietHours = false;
    provider.numbers[0].liveStatus = 'disconnected'; await expectBlocked('sender_not_connected');
    const rejected = { notification_id: 'id', cevox_http_status: 429, cevox_response: { code: 'hourly_limit', error: 'Limit reached' } };
    assert.equal(classifyMovementWebhookResult(200, rejected, 'id').status, 'pending');
    assert.equal(classifyMovementWebhookResult(200, { ...rejected, cevox_response: { code: 'unknown', error: 'Unknown' } }, 'id').status, 'uncertain');
    assert.equal(classifyMovementWebhookResult(200, { ...rejected, cevox_http_status: 500 }, 'id').status, 'uncertain');

    const retryStatements: string[] = [];
    const retryParameters: any[][] = [];
    const retryDatabase: PortalDatabase = {
      query: async () => ({ rows: [] }),
      getClient: async () => ({
        release() {},
        async query(sql: string, params?: any[]) {
          retryStatements.push(sql);
          retryParameters.push(params || []);
          if (sql.includes('FROM whatsapp_notification_attempts attempt')) return { rows: [{ notification_id: 'notification-id' }] };
          return { rows: [] };
        },
      }),
    };
    assert.equal(await requeueVerifiedUnsentMovementNotification(retryDatabase, { attemptId: 'attempt-id', actorId: 'admin-id' }), 'notification-id');
    assert.ok(retryStatements.some(sql => sql.includes("SET status = 'pending'")), 'Only an explicitly reviewed uncertainty is requeued');
    assert.ok(retryParameters.some(params => params.includes('retry_verified_unsent')), 'Requeue is recorded in the audit log');
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnvironment)) delete process.env[key];
    Object.assign(process.env, previousEnvironment);
  }
  console.log('WhatsApp admin role protection, fail-closed settings, sender checks, queue limits and safe deferral tests passed without live sends.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
