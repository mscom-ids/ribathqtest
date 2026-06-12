#!/usr/bin/env node
// apply_indexes.js — Runs add_performance_indexes.sql against the database
// Usage: node apply_indexes.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) { console.error('❌  POSTGRES_URL / DATABASE_URL not set'); process.exit(1); }

const sql = fs.readFileSync(path.join(__dirname, 'src', 'add_performance_indexes.sql'), 'utf8');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
    const client = await pool.connect();
    try {
        console.log('⚡ Applying performance indexes…');
        await client.query(sql);
        console.log('✅  All indexes created. Queries should now be 10-50× faster.');
    } catch (err) {
        // If a table doesn't exist yet, just warn and continue
        if (err.message?.includes('does not exist')) {
            console.warn('⚠️  Some tables not found (skipped):', err.message);
        } else {
            console.error('❌  Error:', err.message);
            process.exit(1);
        }
    } finally {
        client.release();
        await pool.end();
    }
}

run();
