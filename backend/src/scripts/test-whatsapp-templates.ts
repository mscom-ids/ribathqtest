import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { closeDatabasePool, db } from '../config/db';
import { classifyMovementWebhookResult, getMovementNotificationConfig, prepareMovementNotification } from '../services/student-movement-notifications.service';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.whatsapp-test.local'), override: true, quiet: true });

type PreviewRecord = { notificationId: string; status: string; error?: string | null };
type PreviewState = { version: number; studentId: string; recipient: string; records: PreviewRecord[] };

async function main() {
  const config = getMovementNotificationConfig();
  if (!config || config.testStudentId !== 'R999' || config.testRecipient !== '918921551686'
    || process.env.WHATSAPP_SENDING_ENABLED !== 'false'
    || process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true'
    || config.webhookUrl !== 'https://server.n8n.zvntorai.in/webhook/erp-student-movement'
    || !process.argv.includes('--workflow-updated')) throw new Error('test_only_configuration_required');
  const source = await db.query(
    `SELECT s.adm_no AS student_id, s.name AS student_name, sl.companion_name,
            sl.companion_relationship, sl.start_datetime AS occurred_at
     FROM students s JOIN student_leaves sl ON sl.student_id = s.adm_no
     WHERE s.adm_no = $1 AND s.name = 'WhatsApp Test Student - Do Not Use'
       AND s.comprehensive_details->>'whatsapp_notification_test' = 'true'
       AND sl.reason = 'WhatsApp notification integration test'
     ORDER BY sl.created_at LIMIT 1`,
    [config.testStudentId],
  );
  if (source.rows.length !== 1) throw new Error('dedicated_test_student_required');
  if (!process.argv.includes('--single') || process.argv.includes('--bundle') || process.argv.includes('--random')) {
    throw new Error('only_single_template_preview_supported');
  }
  const previewCount = 1;
  const statePath = path.resolve(__dirname, '../../../tmp/whatsapp-template-test-state.json.single');
  const lockPath = `${statePath}.lock`;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const lock = fs.openSync(lockPath, 'wx');
  try {
    const state: PreviewState = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
      : { version: 1, studentId: config.testStudentId, recipient: config.testRecipient,
        records: Array.from({ length: previewCount }, () => ({ notificationId: randomUUID(), status: 'not_attempted' })) };
    if (state.version !== 1 || state.studentId !== 'R999' || state.recipient !== '918921551686'
      || state.records.length !== previewCount) throw new Error('invalid_test_state');
    const persist = () => {
      const temporaryPath = `${statePath}.tmp`;
      fs.writeFileSync(temporaryPath, JSON.stringify(state, null, 2));
      fs.renameSync(temporaryPath, statePath);
    };
    persist();
    for (const [index, record] of state.records.entries()) {
      if (record.status === 'api_accepted') continue;
      if (record.status !== 'not_attempted') throw new Error('previous_attempt_requires_review');
      const payload = prepareMovementNotification(record.notificationId, {
        ...source.rows[0], event: 'student_exit', to: `+${config.testRecipient}`,
        occurred_at: new Date(source.rows[0].occurred_at).toISOString(),
      }, config.senderId);
      if (payload.to !== '918921551686' || process.env.WHATSAPP_SENDING_ENABLED !== 'false'
        || process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true') throw new Error('test_only_configuration_required');
      record.status = 'attempting';
      persist();
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-erp-webhook-secret': config.secret },
          body: JSON.stringify({ ...payload, student_id: 'R999', test_notification: true }),
          redirect: 'error', signal: AbortSignal.timeout(75_000),
        });
        const body = await response.json().catch(() => null);
        const result = classifyMovementWebhookResult(response.status, body, record.notificationId);
        record.status = result.status;
        record.error = result.error;
      } catch {
        record.status = 'uncertain';
        record.error = 'webhook_request_outcome_unknown';
      }
      persist();
      console.log(`R999 single departure template: ${record.status}${record.error ? ` (${record.error})` : ''}`);
      if (record.status !== 'api_accepted') throw new Error('test_send_not_confirmed_no_automatic_retry');
    }
    console.log('One fixed departure test template accepted by Cevox; only the authorized test recipient was targeted.');
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

main().catch(error => {
  const safeErrors = new Set(['test_only_configuration_required', 'dedicated_test_student_required',
    'invalid_test_state', 'previous_attempt_requires_review', 'test_send_not_confirmed_no_automatic_retry', 'only_single_template_preview_supported']);
  console.error(error instanceof Error && safeErrors.has(error.message) ? error.message : 'Template test stopped; check private settings and database connectivity.');
  process.exitCode = 1;
}).finally(() => closeDatabasePool());
