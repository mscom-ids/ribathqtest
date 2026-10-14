import assert from 'node:assert/strict';
import {
  classifyMovementWebhookResult,
  enqueueMovementNotifications,
  getMovementNotificationConfig,
  prepareMovementNotification,
  processMovementNotification,
} from '../services/student-movement-notifications.service';
import { isWhatsAppSendingEnabled, isStaffWhatsAppSendingEnabled } from '../services/whatsapp-safety';
import { sendWhatsAppMessage } from '../services/whatsapp.service';

const environment = {
  WHATSAPP_SENDING_ENABLED: 'true',
  N8N_STUDENT_MOVEMENT_ENABLED: 'true',
  N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT: '2026-10-12T00:00:00Z',
  N8N_STUDENT_MOVEMENT_WEBHOOK_URL: 'https://server.n8n.zvntorai.in/webhook/erp-student-movement',
  N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET: 'test-only-secret-with-at-least-32-characters',
};
const config = getMovementNotificationConfig(environment)!;
const payload = {
  event: 'student_exit',
  to: '98765 43210',
  student_name: 'Ahmed',
  companion_name: 'Mohammed',
  companion_relationship: 'Father',
  occurred_at: '2026-10-12T15:45:00+05:30',
};

async function run() {
  assert.equal(isWhatsAppSendingEnabled({}), false);
  assert.equal(isWhatsAppSendingEnabled({ WHATSAPP_SENDING_ENABLED: 'false' }), false);
  assert.equal(isWhatsAppSendingEnabled({ WHATSAPP_SENDING_ENABLED: '1' }), false);
  assert.equal(isStaffWhatsAppSendingEnabled({ WHATSAPP_SENDING_ENABLED: 'true' }), false);
  assert.equal(isStaffWhatsAppSendingEnabled({ WHATSAPP_SENDING_ENABLED: 'true', WHATSAPP_STAFF_SENDING_ENABLED: 'true' }), true);
  assert.equal(isWhatsAppSendingEnabled({ WHATSAPP_SENDING_ENABLED: 'true', N8N_STUDENT_MOVEMENT_TEST_ENABLED: 'true' }), false);
  assert.equal(getMovementNotificationConfig({ ...environment, WHATSAPP_SENDING_ENABLED: 'false' }), null);
  assert.equal(getMovementNotificationConfig({ ...environment, WHATSAPP_SENDING_ENABLED: undefined }), null);
  const originalSendingFlag = process.env.WHATSAPP_SENDING_ENABLED;
  const originalFetch = globalThis.fetch;
  let blockedRequests = 0;
  globalThis.fetch = async () => { blockedRequests++; throw new Error('Unexpected outgoing WhatsApp request'); };
  process.env.WHATSAPP_SENDING_ENABLED = 'false';
  try {
    assert.deepEqual(await sendWhatsAppMessage('919876543210', 'must not send', {
      apiUrl: 'https://example.com/api/messages', apiToken: 'test-token',
    }), { success: false, error: 'WhatsApp sending is disabled' });
    assert.equal(await processMovementNotification({
      query: async () => { throw new Error('Disabled worker must not claim queued messages'); },
    }, config), false);
    assert.equal(blockedRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSendingFlag === undefined) delete process.env.WHATSAPP_SENDING_ENABLED;
    else process.env.WHATSAPP_SENDING_ENABLED = originalSendingFlag;
  }
  assert.equal(getMovementNotificationConfig({}), null);
  assert.throws(() => getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET: '' }));
  assert.throws(() => getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_WEBHOOK_URL: 'http://example.com/webhook/test' }));
  assert.throws(() => getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_WEBHOOK_URL: 'https://example.com/webhook-test/test' }));
  assert.throws(() => getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_PHONE_FIELD: 'phone; SELECT' }));
  assert.equal(config.productionStartAt, '2026-10-12T00:00:00.000Z');
  for (const cutoff of ['', 'invalid', '2026-10-12T00:00:00', '2026-15-12T00:00:00Z']) {
    assert.throws(() => getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT: cutoff }));
  }
  assert.equal(getMovementNotificationConfig({ ...environment, N8N_STUDENT_MOVEMENT_PRODUCTION_START_AT: '2026-10-12T05:30:00+05:30' })?.productionStartAt,
    config.productionStartAt, 'Production cutoff must be a fixed timezone-aware instant');

  const eligibilityPattern = /sl\.leave_type = 'out-campus'\s+OR \(sl\.leave_type = 'institutional' AND EXISTS \(\s+SELECT 1 FROM institutional_leaves il\s+WHERE il\.id = sl\.institutional_leave_id AND il\.campus_location = 'outside'/;
  const priorEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    for (const event of ['student_exit', 'student_return'] as const) {
      let insertion = '';
      await enqueueMovementNotifications({
        query: async (sql, params) => {
          insertion = sql;
          assert.equal(params?.[1], event);
          assert.equal(params?.[5], config.productionStartAt);
          return { rows: [] };
        },
      }, ['test-leave'], event, payload.occurred_at);
      assert.match(insertion, eligibilityPattern, `${event} must allow only Out-Campus or explicitly outside institutional leaves`);
      assert.ok(insertion.includes('sl.created_at >= $6::timestamptz'));
      assert.ok(insertion.includes('sl.start_datetime >= $6::timestamptz'));
      assert.ok(insertion.includes("COALESCE(s.comprehensive_details->>'whatsapp_notification_test', 'false') <> 'true'"));
      for (const excludedType of ['outdoor', 'on-campus', 'internal', 'personal']) {
        assert.ok(!insertion.includes(`'${excludedType}'`), `${excludedType} must not be included in notification eligibility`);
      }
      await enqueueMovementNotifications({ query: async () => { throw new Error('Historical movements must not be queued'); } },
        ['old-leave'], event, '2026-10-11T23:59:59Z');
    }
  } finally {
    for (const [key, value] of Object.entries(priorEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const prepared = prepareMovementNotification('test-exit', payload);
  assert.equal(prepared.to, '919876543210');
  assert.equal(prepared.occurred_at, '2026-10-12T10:15:00.000Z');
  assert.equal(prepared.companion_relationship, 'Father');
  assert.equal(prepareMovementNotification('test', { ...payload, to: '+44 1234 567890' }).to, '441234567890');
  assert.equal(prepareMovementNotification('test', { ...payload, to: '00919876543210' }).to, '919876543210');
  assert.throws(() => prepareMovementNotification('test', { ...payload, to: '9876543210 / 9123456789' }));
  assert.throws(() => prepareMovementNotification('test', { ...payload, companion_name: '' }));
  assert.throws(() => prepareMovementNotification('test', { ...payload, event: 'on-campus' }));
  const returned = prepareMovementNotification('test-return', {
    ...payload, event: 'student_return', companion_name: null, companion_relationship: null,
  }, 'school-number');
  assert.equal(returned.companion_name, undefined);
  assert.equal(returned.wa_number_id, 'school-number');

  const accepted = { notification_id: 'test-exit', cevox_http_status: 200, cevox_response: { status: 'sent' } };
  assert.equal(classifyMovementWebhookResult(200, accepted, 'test-exit').status, 'api_accepted');
  assert.equal(classifyMovementWebhookResult(200, { ...accepted, cevox_response: { success: false } }, 'test-exit').status, 'failed');
  assert.equal(classifyMovementWebhookResult(200, { ...accepted, notification_id: 'other' }, 'test-exit').status, 'uncertain');
  assert.equal(classifyMovementWebhookResult(200, { ...accepted, cevox_response: {} }, 'test-exit').status, 'uncertain');
  assert.equal(classifyMovementWebhookResult(401, null, 'test-exit').status, 'failed');
  assert.equal(classifyMovementWebhookResult(404, null, 'test-exit').status, 'pending');
  assert.equal(classifyMovementWebhookResult(500, null, 'test-exit').status, 'uncertain');
  assert.equal(classifyMovementWebhookResult(429, null, 'test-exit').status, 'uncertain');
  assert.equal(classifyMovementWebhookResult(200, { ...accepted, cevox_http_status: 500 }, 'test-exit').status, 'uncertain');

  const updates: any[][] = [];
  const database = {
    async query(sql: string, params?: any[]) {
      if (sql.includes('WITH candidate')) {
        assert.match(sql, eligibilityPattern, 'Previously queued notifications must have their current leave eligibility rechecked');
        assert.ok(sql.includes("sl.status <> 'cancelled'"));
        assert.equal(params?.[2], config.productionStartAt);
        for (const requiredCutoff of ['notification.created_at >= $3::timestamptz', 'sl.created_at >= $3::timestamptz', 'sl.start_datetime >= $3::timestamptz', 'ELSE sl.actual_return_datetime END >= $3::timestamptz']) {
          assert.ok(sql.includes(requiredCutoff), 'Queued historical departures and their later returns must be excluded');
        }
        return { rows: [{ id: 'test-exit', payload, attempts: 1 }] };
      }
      updates.push(params || []);
      return { rows: [] };
    },
  };
  let requests = 0;
  const successfulRequest: typeof fetch = async (url, options) => {
    requests++;
    assert.equal(url, config.webhookUrl);
    assert.equal((options?.headers as Record<string, string>)['x-erp-webhook-secret'], config.secret);
    assert.equal(options?.redirect, 'error');
    assert.equal(JSON.parse(String(options?.body)).notification_id, 'test-exit');
    return new Response(JSON.stringify(accepted), { status: 200 });
  };
  assert.equal(await processMovementNotification(database, config, successfulRequest), true);
  assert.equal(updates[updates.length - 1]?.[1], 'api_accepted');
  await processMovementNotification(database, config, async () => { requests++; throw new Error('timeout'); });
  assert.equal(updates[updates.length - 1]?.[1], 'uncertain');
  assert.equal(requests, 2, 'network failures must not trigger another send');
  await processMovementNotification({
    async query(sql: string, params?: any[]) {
      if (sql.includes('WITH candidate')) return { rows: [{ id: 'test-exit', payload: { ...payload, to: '' }, attempts: 1 }] };
      updates.push(params || []);
      return { rows: [] };
    },
  }, config, successfulRequest);
  assert.equal(updates[updates.length - 1]?.[1], 'skipped');
  assert.equal(requests, 2, 'invalid guardian contacts must never reach the gateway');
  assert.equal(await processMovementNotification({ query: async () => ({ rows: [] }) }, config, successfulRequest), false);
  await processMovementNotification({
    async query(sql: string, params?: any[]) {
      if (sql.includes('WITH candidate')) return { rows: [{ id: 'test-exit', payload, attempts: 5 }] };
      updates.push(params || []);
      return { rows: [] };
    },
  }, config, async () => new Response('Webhook not registered', { status: 404 }));
  assert.equal(updates[updates.length - 1]?.[1], 'failed', 'unpublished webhook retries must be bounded');

  const originalEnabled = process.env.N8N_STUDENT_MOVEMENT_ENABLED;
  process.env.N8N_STUDENT_MOVEMENT_ENABLED = 'false';
  try {
    await enqueueMovementNotifications({ query: async () => { throw new Error('disabled queue must not query'); } }, ['leave'], 'student_exit', payload.occurred_at);
  } finally {
    if (originalEnabled === undefined) delete process.env.N8N_STUDENT_MOVEMENT_ENABLED;
    else process.env.N8N_STUDENT_MOVEMENT_ENABLED = originalEnabled;
  }
  const testEnvironment = {
    ...environment,
    WHATSAPP_SENDING_ENABLED: 'false',
    N8N_STUDENT_MOVEMENT_TEST_ENABLED: 'true',
    N8N_STUDENT_MOVEMENT_TEST_PHONE: '+919876543210',
    N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID: 'R999',
  };
  const testConfig = getMovementNotificationConfig(testEnvironment)!;
  assert.equal(testConfig.testStudentId, 'R999');
  assert.equal(testConfig.testRecipient, '919876543210');
  assert.equal(testConfig.productionStartAt, undefined, 'Isolated tests must not require or overwrite the production cutoff');
  assert.throws(() => getMovementNotificationConfig({ ...testEnvironment, N8N_STUDENT_MOVEMENT_TEST_PHONE: '' }));
  assert.throws(() => getMovementNotificationConfig({ ...testEnvironment, N8N_STUDENT_MOVEMENT_TEST_STUDENT_ID: '' }));
  const previousTestMode = process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED;
  const previousMasterFlag = process.env.WHATSAPP_SENDING_ENABLED;
  process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED = 'true';
  process.env.WHATSAPP_SENDING_ENABLED = 'false';
  let testRequests = 0;
  try {
    const restrictedDatabase = (studentId: string, marked: boolean) => ({
      async query(sql: string, params?: any[]) {
        if (sql.includes('WITH candidate')) {
          assert.equal(params?.[0], 'R999');
          return { rows: [{
            id: 'test-exit', attempts: 1,
            payload: { ...payload, to: '911111111111', student_id: studentId, test_notification: marked },
          }] };
        }
        updates.push(params || []);
        return { rows: [] };
      },
    });
    const testRequest: typeof fetch = async (_url, options) => {
      testRequests++;
      const sent = JSON.parse(String(options?.body));
      assert.equal(sent.to, '919876543210', 'test recipient must override the stored guardian contact');
      assert.equal(sent.student_id, 'R999');
      return new Response(JSON.stringify(accepted), { status: 200 });
    };
    await processMovementNotification(restrictedDatabase('R001', true), testConfig, testRequest);
    assert.equal(testRequests, 0, 'a real student must never send in test mode');
    await processMovementNotification(restrictedDatabase('R999', false), testConfig, testRequest);
    assert.equal(testRequests, 0, 'an unmarked notification must never send in test mode');
    await processMovementNotification(restrictedDatabase('R999', true), testConfig, testRequest);
    assert.equal(testRequests, 1);
    assert.deepEqual(await sendWhatsAppMessage('919876543210', 'staff must remain blocked'), {
      success: false, error: 'WhatsApp sending is disabled',
    });
    assert.equal(await processMovementNotification(database, config, testRequest), false,
      'a stale normal-mode worker must not send when test mode is enabled');
  } finally {
    if (previousTestMode === undefined) delete process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED;
    else process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED = previousTestMode;
    if (previousMasterFlag === undefined) delete process.env.WHATSAPP_SENDING_ENABLED;
    else process.env.WHATSAPP_SENDING_ENABLED = previousMasterFlag;
  }
  console.log('Student movement notification regression tests passed.');
}

const originalSendingFlag = process.env.WHATSAPP_SENDING_ENABLED;
process.env.WHATSAPP_SENDING_ENABLED = 'true';
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (originalSendingFlag === undefined) delete process.env.WHATSAPP_SENDING_ENABLED;
  else process.env.WHATSAPP_SENDING_ENABLED = originalSendingFlag;
});
