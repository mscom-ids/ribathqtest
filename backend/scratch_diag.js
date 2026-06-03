const { Client } = require('pg');
require('dotenv').config();

const connString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

async function main() {
    const c = new Client({ connectionString: connString, ssl: { rejectUnauthorized: false } });
    await c.connect();
    console.log('Connected to Database successfully.');

    // 1. Hifz Schedules
    console.log('\n--- 1. Hifz Attendance Schedules ---');
    const hifzScheds = await c.query("SELECT id, class_type, name, standards, day_of_week, start_time, end_time FROM attendance_schedules WHERE class_type = 'hifz' OR class_type = 'Hifz' OR name ILIKE '%Hifz%'");
    hifzScheds.rows.forEach(r => {
        console.log(`ID: ${r.id} | Class Type: ${r.class_type} | Name: ${r.name} | Standards: ${JSON.stringify(r.standards)} | Day: ${r.day_of_week} | Time: ${r.start_time}-${r.end_time}`);
    });

    // 2. Classes table rows
    console.log('\n--- 2. Classes Sample (Up to 10 rows) ---');
    const classesRes = await c.query("SELECT * FROM classes LIMIT 10");
    console.log(`Total classes found: ${classesRes.rows.length}`);
    classesRes.rows.forEach(r => {
        console.log(`ID: ${r.id} | Name: ${r.name} | Type: ${r.type} | Standard: ${r.standard} | Year: ${r.academic_year_id}`);
    });

    // 3. Enrollments count & sample
    console.log('\n--- 3. Enrollments Count & Sample ---');
    const enrollCount = await c.query("SELECT COUNT(*) as count FROM enrollments");
    console.log(`Total enrollments count: ${enrollCount.rows[0].count}`);
    if (Number(enrollCount.rows[0].count) > 0) {
        const enrollSample = await c.query("SELECT * FROM enrollments LIMIT 5");
        enrollSample.rows.forEach(r => console.log(JSON.stringify(r)));
    } else {
        console.log("No enrollments found (0 rows).");
    }

    // 4. Student standards count & overlap
    console.log('\n--- 4. Student Standards Count & Sample ---');
    const standardsCount = await c.query(`
        SELECT 
            COUNT(CASE WHEN school_standard IS NOT NULL THEN 1 END) as school_count,
            COUNT(CASE WHEN madrassa_standard IS NOT NULL THEN 1 END) as madrassa_count,
            COUNT(CASE WHEN hifz_standard IS NOT NULL THEN 1 END) as hifz_count
        FROM students
    `);
    console.log(`Students with School Standard: ${standardsCount.rows[0].school_count}`);
    console.log(`Students with Madrasa Standard: ${standardsCount.rows[0].madrassa_count}`);
    console.log(`Students with Hifz Standard: ${standardsCount.rows[0].hifz_count}`);

    const studentsSample = await c.query(`
        SELECT adm_no, name, standard, school_standard, madrassa_standard, hifz_standard 
        FROM students 
        WHERE school_standard IS NOT NULL OR madrassa_standard IS NOT NULL OR hifz_standard IS NOT NULL 
        LIMIT 10
    `);
    studentsSample.rows.forEach(r => {
        console.log(`Adm: ${r.adm_no} | Name: ${r.name} | Std: ${r.standard} | School: ${r.school_standard} | Madrasa: ${r.madrassa_standard} | Hifz: ${r.hifz_standard}`);
    });

    // 5. Attendance Marks Counts
    console.log('\n--- 5. Attendance Marks Table Rows ---');
    const amCount = await c.query("SELECT COUNT(*) as count FROM attendance_marks");
    const samCount = await c.query("SELECT COUNT(*) as count FROM student_attendance_marks");
    const attCount = await c.query("SELECT COUNT(*) as count FROM attendance");
    console.log(`attendance_marks rows: ${amCount.rows[0].count}`);
    console.log(`student_attendance_marks rows: ${samCount.rows[0].count}`);
    console.log(`attendance (System B/new class overhaul) rows: ${attCount.rows[0].count}`);

    await c.end();
}

main().catch(console.error);
