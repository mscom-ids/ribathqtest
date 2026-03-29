const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

async function check() {
    try {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='students'");
        const cols = res.rows.map(r => r.column_name);
        console.log("COLUMNS:", cols.join(", "));
        
        // try to drop if assigned_usthad_id is there
        if (cols.includes("assigned_usthad_id")) {
           console.log("Renaming assigned_usthad_id to prevent view drop errors...");
           // We'll rename it to assigned_usthad_id_old or something if we really need to drop it.
           // Actually, since we updated hifz_mentor_id with it, we can just leave it there securely, or rename it.
           // Let's just rename it so we don't accidentally query it.
           await pool.query("ALTER TABLE students RENAME COLUMN assigned_usthad_id TO _legacy_usthad_id");
           console.log("Renamed to _legacy_usthad_id");
        }
    } catch (err) { console.log('ERROR:', err.message); }
    finally { pool.end(); }
}
check();
