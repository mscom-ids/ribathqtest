require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();

    console.log("Checking MUHAMMED ABLAJ M (R370) Hifz logs...");
    const logs = await client.query(
        `SELECT hl.*, recorder.name AS recorded_by_name
         FROM hifz_logs hl
         LEFT JOIN staff recorder ON recorder.id = hl.created_by
         WHERE hl.student_id = 'R370'
         ORDER BY hl.entry_date, hl.created_at`
    );
    console.log(`Found ${logs.rows.length} logs:`);
    for (const log of logs.rows) {
        console.log(`- ID: ${log.id}, Date: ${log.entry_date.toISOString().slice(0, 10)}, Mode: ${log.mode}, Surah: ${log.surah_name}, Verses: ${log.start_v}-${log.end_v}, Deleted: ${log.deleted_at}`);
    }

    await client.end();
}

run().catch(console.error);
