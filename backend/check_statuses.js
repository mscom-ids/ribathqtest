require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    const res = await client.query("SELECT DISTINCT status FROM student_attendance_marks");
    console.log("Distinct statuses in DB:", res.rows);
    await client.end();
}

run().catch(console.error);
