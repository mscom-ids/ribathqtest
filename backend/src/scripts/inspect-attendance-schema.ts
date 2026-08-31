import { closeDatabasePool, db } from '../config/db';

async function main() {
  const result = await db.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position`,
    [[
      'attendance_schedules',
      'attendance_cancellations',
      'attendance_marks',
      'student_attendance_marks',
      'staff_attendance',
      'attendance_schedule_groups',
      'attendance_groups',
      'attendance_group_students',
    ]],
  );
  for (const row of result.rows) {
    console.log(`${row.table_name}.${row.column_name} ${row.data_type} nullable=${row.is_nullable} default=${row.column_default || ''}`);
  }

  const constraints = await db.query(
    `SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
            string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS columns
     FROM information_schema.table_constraints tc
     LEFT JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
      AND kcu.table_name = tc.table_name
     WHERE tc.table_schema = 'public'
       AND tc.table_name = ANY($1::text[])
     GROUP BY tc.table_name, tc.constraint_name, tc.constraint_type
     ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name`,
    [[
      'attendance_schedules',
      'attendance_cancellations',
      'attendance_marks',
      'student_attendance_marks',
      'staff_attendance',
      'attendance_schedule_groups',
      'attendance_groups',
      'attendance_group_students',
    ]],
  );
  console.log('\nCONSTRAINTS');
  for (const row of constraints.rows) {
    console.log(`${row.table_name}.${row.constraint_name} ${row.constraint_type} (${row.columns || ''})`);
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabasePool());
