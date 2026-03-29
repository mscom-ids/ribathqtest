require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();

    console.log('=== Phase 1: Database Migration ===');

    // 1. Add date-effective columns to attendance_schedules
    console.log('Adding effective_from, effective_until, is_deleted to attendance_schedules...');
    await c.query(`
        ALTER TABLE attendance_schedules
        ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
        ADD COLUMN IF NOT EXISTS effective_until DATE DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE
    `);
    console.log('  Done.');

    // 2. Delete all rows from academic_sessions
    console.log('Deleting all rows from academic_sessions...');
    const delResult = await c.query('DELETE FROM academic_sessions');
    console.log('  Deleted ' + delResult.rowCount + ' rows.');

    // 3. Remove attendance rows referencing academic_sessions (attendance table has session_id FK)
    console.log('Clearing attendance table (0 rows expected)...');
    const attResult = await c.query('DELETE FROM attendance');
    console.log('  Deleted ' + attResult.rowCount + ' rows.');

    // 4. Verify
    console.log('');
    console.log('=== Verification ===');
    const r1 = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attendance_schedules' ORDER BY ordinal_position`);
    console.log('attendance_schedules columns:');
    r1.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ')'));

    const r2 = await c.query('SELECT COUNT(*) as cnt FROM academic_sessions');
    console.log('academic_sessions rows: ' + r2.rows[0].cnt);

    const r3 = await c.query('SELECT COUNT(*) as cnt FROM attendance');
    console.log('attendance rows: ' + r3.rows[0].cnt);

    console.log('');
    console.log('Migration complete!');
    await c.end();
}

main().catch(console.error);
