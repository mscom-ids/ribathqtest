// One-shot script to add performance indexes to the database.
// Usage: node src/run_indexes.mjs

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = fs.readFileSync(path.join(__dirname, 'add_leave_indexes.sql'), 'utf-8');

// Strip line comments, then split on semicolons
const statements = sql
  .split('\n')
  .map(line => line.replace(/--.*$/, '').trim())
  .join('\n')
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0);

console.log(`Running ${statements.length} index statements...`);

for (const stmt of statements) {
  const shortName = stmt.match(/idx_\w+/)?.[0] || stmt.slice(0, 60);
  try {
    const start = Date.now();
    await pool.query(stmt);
    console.log(`  ✓ ${shortName} (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`  ✗ ${shortName}: ${err.message}`);
  }
}

console.log('Done.');
await pool.end();
