#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) { console.error('❌  POSTGRES_URL / DATABASE_URL not set'); process.exit(1); }

const sql = fs.readFileSync(path.join(__dirname, 'src', 'add_performance_indexes3.sql'), 'utf8');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function run() {
    const client = await pool.connect();
    try {
        console.log('⚡ Applying Phase 3 performance indexes…');
        const statements = sql.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
        let ok = 0, skipped = 0;
        for (const stmt of statements) {
            try {
                await client.query(stmt);
                ok++;
            } catch (err) {
                if (err.message?.includes('does not exist') || err.message?.includes('already exists')) {
                    console.warn(`  ⚠️  Skipped: ${stmt.slice(0, 70)}…`);
                    skipped++;
                } else {
                    throw err;
                }
            }
        }
        console.log(`✅  Done. ${ok} applied, ${skipped} skipped.`);
    } catch (err) {
        console.error('❌  Error:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}
run();
