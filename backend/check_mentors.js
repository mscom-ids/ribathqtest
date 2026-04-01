const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query("SELECT id, name, role FROM staff WHERE role = 'mentor' OR role = 'usthad'");
        console.log("Mentors found:", JSON.stringify(res.rows, null, 2));
    } catch (err) { console.log('ERROR:', err.message); }
    finally { pool.end(); }
}
check();
