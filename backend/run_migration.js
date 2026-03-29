const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });

async function runMigration() {
    try {
        const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260327000000_multi_mentor_system.sql'), 'utf-8');
        console.log("Running migration...");
        await pool.query(sql);
        console.log("Migration successful!");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        pool.end();
    }
}

runMigration();
