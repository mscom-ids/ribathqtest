#!/usr/bin/env node
// Phase 2 performance indexes.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
if (!url) {
    console.error('POSTGRES_URL / DATABASE_URL is not set');
    process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, 'src', 'add_performance_indexes2.sql'), 'utf8');
const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

function splitStatements(source) {
    // Remove full-line comments before splitting. The previous parser filtered
    // every chunk beginning with a comment, which silently skipped most indexes.
    return source
        .replace(/^\s*--.*$/gm, '')
        .split(';')
        .map(statement => statement.trim())
        .filter(Boolean);
}

async function run() {
    const client = await pool.connect();
    let exitCode = 0;
    try {
        const statements = splitStatements(sql);
        console.log(`Applying Phase 2 performance indexes (${statements.length} statements)...`);
        let applied = 0;
        let skipped = 0;

        for (const statement of statements) {
            try {
                await client.query(statement);
                applied++;
            } catch (error) {
                if (['42P01', '42703', '42P07'].includes(error.code) || error.message?.includes('does not exist') || error.message?.includes('already exists')) {
                    console.warn(`Skipped: ${statement.slice(0, 80)}...`);
                    skipped++;
                    continue;
                }
                throw error;
            }
        }

        console.log(`Done. ${applied} applied, ${skipped} skipped.`);
    } catch (error) {
        console.error('Index migration failed:', error.message);
        exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
    process.exitCode = exitCode;
}

void run();