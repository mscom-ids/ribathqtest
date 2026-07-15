require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    const res = await client.query("SELECT id, name, standards, class_type FROM attendance_schedules WHERE class_type='hifz'");
    console.log("Hifz schedules:", res.rows);
    await client.end();
}

run().catch(console.error);
