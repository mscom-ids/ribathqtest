import { closeDatabasePool, db } from '../config/db';

async function main() {
  const readiness = {
    webhookConfigured: Boolean(process.env.N8N_STUDENT_MOVEMENT_WEBHOOK_URL),
    secretConfigured: Boolean(process.env.N8N_STUDENT_MOVEMENT_WEBHOOK_SECRET),
    masterSendingEnabled: process.env.WHATSAPP_SENDING_ENABLED === 'true',
    testModeEnabled: process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED === 'true',
  };
  const queue = await db.query("SELECT to_regclass('public.student_movement_notifications') IS NOT NULL AS ready");
  console.log(JSON.stringify({ ...readiness, queueMigrationApplied: queue.rows[0].ready }));
  const existing = await db.query(
    `SELECT adm_no FROM students
     WHERE comprehensive_details->>'whatsapp_notification_test' = 'true'
       AND name = 'WhatsApp Test Student - Do Not Use'
     ORDER BY adm_no LIMIT 1`,
  );
  if (existing.rows[0]) {
    console.log(`Test student already exists: ${existing.rows[0].adm_no}`);
    return;
  }
  const created = await db.query(
    `INSERT INTO students (adm_no, name, dob, father_name, status, standard, admission_date, comprehensive_details)
     SELECT candidate.adm_no, 'WhatsApp Test Student - Do Not Use', '2008-01-01'::date,
            'Test Guardian', 'active', 'Hifz', '2026-10-12'::date,
            '{"whatsapp_notification_test":true}'::jsonb
     FROM (
       SELECT 'R' || number::text AS adm_no
       FROM generate_series(999, 900, -1) AS number
       WHERE NOT EXISTS (SELECT 1 FROM students WHERE adm_no = 'R' || number::text)
       ORDER BY number DESC LIMIT 1
     ) candidate
     RETURNING adm_no`,
  );
  if (!created.rows[0]) throw new Error('No reserved test admission number is available');
  console.log(`Created test student: ${created.rows[0].adm_no}; no guardian contact or login created`);
}

main().catch(() => {
  console.error('Could not prepare test student; check database connectivity and schema');
  process.exitCode = 1;
}).finally(() => closeDatabasePool());
