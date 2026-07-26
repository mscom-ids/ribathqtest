require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Get all schedules
    const schedsRes = await client.query(`
        SELECT a.*, COALESCE(array_agg(asg.group_id ORDER BY asg.group_id) FILTER (WHERE asg.group_id IS NOT NULL), ARRAY[]::uuid[]) AS group_ids
        FROM attendance_schedules a
        LEFT JOIN attendance_schedule_groups asg ON asg.schedule_id = a.id
        GROUP BY a.id
    `);
    
    const schedules = schedsRes.rows;
    console.log("Total schedules in DB:", schedules.length);
    
    // Group them
    const groups = new Map();
    for (const s of schedules) {
        const key = [
            s.academic_year_id || 'null',
            s.class_type || 'null',
            s.name || 'null',
            s.mentor_id || 'null',
            s.class_id || 'null',
            JSON.stringify(s.standards || []),
            s.group_ids.join(',')
        ].join('|');
        
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(s);
    }
    
    console.log("Logical subjects created:", groups.size);
    
    // Print first few groups
    let i = 0;
    for (const [key, list] of groups.entries()) {
        if (i++ < 5) {
            console.log(`Subject Key: ${key}`);
            console.log(`  - Schedules count: ${list.length}`);
            console.log(`  - Sample schedule weekdays: ${list.map(s => s.day_of_week).join(', ')}`);
        }
    }
    
    await client.end();
}

run().catch(console.error);
