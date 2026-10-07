import assert from 'node:assert/strict';
import { applyInstitutionalAttendanceCancellations } from '../controllers/leaves.controller';

async function run() {
  const executed: Array<{ sql: string; params?: any[] }> = [];
  const client = {
    async query(sql: string, params?: any[]) {
      executed.push({ sql, params });
      if (sql.includes('FROM attendance_schedules')) {
        return {
          rows: [{
            id: '00000000-0000-4000-8000-000000000001',
            standards: ['7th'],
            day_of_week: 0,
            start_time: '06:00:00',
            end_time: '08:30:00',
            effective_from: '2026-06-01',
            effective_until: null,
          }],
        };
      }
      return { rows: [] };
    },
  };

  const count = await applyInstitutionalAttendanceCancellations(client, {
    id: '00000000-0000-4000-8000-000000000002',
    start_datetime: '2026-10-04T00:00:00+05:30',
    end_datetime: '2026-10-04T23:59:00+05:30',
    target_classes: [],
    target_student_ids: [],
    is_entire_institution: true,
    created_by: '00000000-0000-4000-8000-000000000003',
  });

  assert.equal(count, 1);
  const insert = executed.find(({ sql }) => sql.includes('INSERT INTO attendance_cancellations'));
  assert.ok(insert, 'expected cancellation insert');
  assert.match(insert!.sql, /cancelled_students\s*=\s*COALESCE\(\(/);
  assert.match(insert!.sql, /\), '\[\]'::jsonb\)/);
  const rows = JSON.parse(String(insert!.params?.[0]));
  assert.deepEqual(rows[0].cancelled_students, []);
  assert.equal(rows[0].reason, 'Institutional Leave:00000000-0000-4000-8000-000000000002');

  console.log('Institutional leave cancellation regression test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
