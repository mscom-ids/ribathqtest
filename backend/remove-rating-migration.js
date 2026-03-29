const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Dropping column 'rating' from 'hifz_logs'...");
        await pool.query('ALTER TABLE hifz_logs DROP COLUMN IF EXISTS rating');
        console.log("Success.");

        console.log("Dropping column 'grade' from 'monthly_reports'...");
        await pool.query('ALTER TABLE monthly_reports DROP COLUMN IF EXISTS grade');
        console.log("Success.");
    } catch (e) {
        console.error("Migration Error:", e.message);
    } finally {
        pool.end();
    }
}

run();
