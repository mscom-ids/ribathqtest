require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    const res = await client.query(`
        SELECT sub.id as subject_id, sub.name as subject_name, sub.mentor_id, st.name as mentor_name, sub.division,
               count(sch.id) as schedule_count,
               array_agg(sch.day_of_week) as weekdays
        FROM attendance_subjects sub
        LEFT JOIN staff st ON st.id = sub.mentor_id
        LEFT JOIN attendance_schedules sch ON sch.subject_id = sub.id
        GROUP BY sub.id, sub.name, sub.mentor_id, st.name, sub.division
        ORDER BY sub.name, st.name
    `);
    
    console.log("ALL SUBJECTS AND LINKED SCHEDULES:");
    res.rows.forEach(r => {
        console.log(`- Subject: "${r.subject_name}" (ID: ${r.subject_id}), Mentor: "${r.mentor_name}", Division: "${r.division}"`);
        console.log(`  Schedules Count: ${r.schedule_count}, Weekdays: ${r.weekdays.join(', ')}`);
    });
    
    await client.end();
}

run().catch(console.error);
