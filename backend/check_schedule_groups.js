require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Check schedules with group_ids
    const res = await client.query(`
        SELECT a.id, a.name, a.class_type, a.standards, a.day_of_week, 
               COALESCE(array_agg(DISTINCT asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids 
        FROM attendance_schedules a 
        LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id 
        WHERE LOWER(a.class_type) = 'hifz'
        GROUP BY a.id
    `);
    console.log("Schedules with group_ids:", JSON.stringify(res.rows, null, 2));

    await client.end();
}

run().catch(console.error);
