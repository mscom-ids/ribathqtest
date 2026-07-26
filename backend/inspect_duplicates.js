require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Inspect current subjects
    const subjectsRes = await client.query(`
        SELECT id, academic_year_id, department, name, mentor_id, class_id, division
        FROM attendance_subjects
    `);
    
    console.log(`Total subjects currently in table: ${subjectsRes.rows.length}`);
    
    // Find duplicate groups
    const dupRes = await client.query(`
        SELECT academic_year_id, department, LOWER(name) as name_lower, mentor_id, class_id, division, COUNT(*)::int as cnt, array_agg(id) as ids
        FROM attendance_subjects
        GROUP BY academic_year_id, department, LOWER(name), mentor_id, class_id, division
        HAVING COUNT(*) > 1
    `);
    
    console.log(`Duplicate subject groups: ${dupRes.rows.length}`);
    dupRes.rows.forEach((r, i) => {
        console.log(`[Group ${i+1}] Name: "${r.name_lower}", Dept: "${r.department}", Count: ${r.cnt}`);
        console.log(`  IDs: ${r.ids.join(', ')}`);
    });

    await client.end();
}

run().catch(console.error);
