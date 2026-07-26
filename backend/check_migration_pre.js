require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Inspect attendance_schedules columns
    const columnsRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'attendance_schedules'
    `);
    console.log("Columns in attendance_schedules:");
    columnsRes.rows.forEach(r => console.log(`  - ${r.column_name}: ${r.data_type}`));
    
    // Count schedules
    const countSchedules = await client.query("SELECT COUNT(*)::int as count FROM attendance_schedules");
    console.log("Total attendance schedules:", countSchedules.rows[0].count);

    // Count student attendance marks
    const countMarks = await client.query("SELECT COUNT(*)::int as count FROM student_attendance_marks");
    console.log("Total student attendance marks:", countMarks.rows[0].count);
    
    // Count attendance_marks (class-level marks)
    const countClassMarks = await client.query("SELECT COUNT(*)::int as count FROM attendance_marks");
    console.log("Total attendance_marks (class level):", countClassMarks.rows[0].count);

    await client.end();
}

run().catch(console.error);
