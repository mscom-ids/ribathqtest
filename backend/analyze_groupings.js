require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Group schedules by logical subject key to see what combinations we get
    const groupRes = await client.query(`
        SELECT 
            academic_year_id,
            class_type,
            name as class_name,
            mentor_id,
            standards,
            class_id,
            COUNT(*) as schedule_count
        FROM attendance_schedules
        WHERE is_deleted = false OR is_deleted IS NULL
        GROUP BY academic_year_id, class_type, name, mentor_id, standards, class_id
    `);
    
    console.log(`Unique combinations: ${groupRes.rows.length}`);
    groupRes.rows.slice(0, 15).forEach((r, i) => {
        console.log(`[${i+1}] Name: "${r.class_name}", Dept: "${r.class_type}", Standards: ${JSON.stringify(r.standards)}, Count: ${r.schedule_count}`);
    });
    
    await client.end();
}

run().catch(console.error);
