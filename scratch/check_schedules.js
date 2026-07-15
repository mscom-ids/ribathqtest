const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    password: 'password', // Assuming default or I'll check my previous scripts
    host: 'localhost',
    port: 5432,
    database: 'rqp_dev'
});

async function run() {
    await client.connect();
    
    // Check schedules
    const res = await client.query(`
        SELECT a.id, a.name, a.class_type, a.standards, a.day_of_week, a.effective_from, a.effective_until
        FROM attendance_schedules a
        WHERE LOWER(a.class_type) = 'hifz'
    `);
    console.log("Schedules:", JSON.stringify(res.rows, null, 2));

    // Check groups
    const res2 = await client.query(`
        SELECT id, department, standard, division
        FROM attendance_groups
        WHERE LOWER(department) = 'hifz'
    `);
    console.log("Groups:", JSON.stringify(res2.rows, null, 2));
    
    await client.end();
}

run().catch(console.error);
