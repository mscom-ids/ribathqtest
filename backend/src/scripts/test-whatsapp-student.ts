import path from 'node:path';
import dotenv from 'dotenv';
import { closeDatabasePool, db } from '../config/db';
import {
  enqueueMovementNotifications,
  getMovementNotificationConfig,
  processMovementNotification,
} from '../services/student-movement-notifications.service';

dotenv.config({ path: path.resolve(__dirname, '../../../.env.whatsapp-test.local'), override: true, quiet: true });

async function main() {
  const config = getMovementNotificationConfig();
  if (!config?.testStudentId || !config.testRecipient
    || process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED !== 'true'
    || process.env.WHATSAPP_SENDING_ENABLED !== 'false') {
    throw new Error('test_only_configuration_required');
  }
  const client = await db.getClient();
  let leaveId: string;
  try {
    await client.query('BEGIN');
    const student = await client.query(
      `SELECT adm_no FROM students WHERE adm_no = $1
       AND name = 'WhatsApp Test Student - Do Not Use'
       AND comprehensive_details->>'whatsapp_notification_test' = 'true'
       FOR UPDATE`,
      [config.testStudentId],
    );
    if (!student.rows[0]) throw new Error('dedicated_test_student_required');
    const existing = await client.query(
      `SELECT id FROM student_leaves WHERE student_id = $1
       AND reason = 'WhatsApp notification integration test' ORDER BY created_at LIMIT 1`,
      [config.testStudentId],
    );
    if (existing.rows[0]) {
      leaveId = existing.rows[0].id;
    } else {
      const outside = await client.query(
        "SELECT id FROM student_leaves WHERE student_id = $1 AND status = 'outside'",
        [config.testStudentId],
      );
      if (outside.rows[0]) throw new Error('test_student_already_outside');
      const occurredAt = new Date().toISOString();
      const inserted = await client.query(
        `INSERT INTO student_leaves (
           student_id, leave_type, start_datetime, end_datetime, status, reason,
           reason_category, remarks, companion_name, companion_relationship
         ) VALUES ($1, 'out-campus', $2::timestamptz, $2::timestamptz + interval '1 hour',
                   'outside', 'WhatsApp notification integration test', 'Other',
                   'Dedicated test only; no actual student movement', 'Test Guardian', 'Father')
         RETURNING id`,
        [config.testStudentId, occurredAt],
      );
      leaveId = inserted.rows[0].id;
      await client.query(
        `INSERT INTO student_movements (student_id, leave_id, direction, timestamp)
         VALUES ($1, $2, 'out', $3::timestamptz)`,
        [config.testStudentId, leaveId, occurredAt],
      );
      await enqueueMovementNotifications(client, [leaveId], 'student_exit', occurredAt);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const sendAndCheck = async (event: 'student_exit' | 'student_return') => {
    const queued = await db.query(
      'SELECT id, status FROM student_movement_notifications WHERE leave_id = $1 AND event = $2',
      [leaveId, event],
    );
    const notification = queued.rows[0];
    if (!notification) throw new Error('test_notification_not_queued');
    if (notification.status === 'pending') {
      await processMovementNotification(db, config, fetch, notification.id);
    }
    const result = await db.query('SELECT status, last_error FROM student_movement_notifications WHERE id = $1', [notification.id]);
    console.log(`${config.testStudentId} ${event}: ${result.rows[0].status}${result.rows[0].last_error ? ` (${result.rows[0].last_error})` : ''}`);
    if (result.rows[0].status !== 'api_accepted') throw new Error('test_send_not_confirmed_no_automatic_retry');
  };
  await sendAndCheck('student_exit');

  const returnClient = await db.getClient();
  try {
    await returnClient.query('BEGIN');
    const leave = await returnClient.query('SELECT status FROM student_leaves WHERE id = $1 FOR UPDATE', [leaveId]);
    if (leave.rows[0]?.status === 'outside') {
      const returnedAt = new Date().toISOString();
      await returnClient.query(
        `UPDATE student_leaves SET status = 'returned', actual_return_datetime = $2,
         return_status = 'normal', updated_at = now() WHERE id = $1`,
        [leaveId, returnedAt],
      );
      await returnClient.query(
        `INSERT INTO student_movements (student_id, leave_id, direction, timestamp)
         VALUES ($1, $2, 'in', $3::timestamptz)`,
        [config.testStudentId, leaveId, returnedAt],
      );
      await enqueueMovementNotifications(returnClient, [leaveId], 'student_return', returnedAt);
    }
    await returnClient.query('COMMIT');
  } catch (error) {
    await returnClient.query('ROLLBACK');
    throw error;
  } finally {
    returnClient.release();
  }
  await sendAndCheck('student_return');
  console.log('Test exit and return accepted by Cevox. Only the configured test recipient was used; check WhatsApp for delivery.');
}

main().catch(error => {
  const safeErrors = new Set([
    'test_only_configuration_required', 'dedicated_test_student_required',
    'test_student_already_outside', 'test_notification_not_queued',
    'test_send_not_confirmed_no_automatic_retry',
  ]);
  console.error(error instanceof Error && safeErrors.has(error.message)
    ? error.message : 'Test stopped; check private webhook settings, migration, and database connectivity');
  process.exitCode = 1;
}).finally(() => closeDatabasePool());
