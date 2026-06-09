const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const connectionString = process.env.DATABASE_URL;

const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20260604010000_timetable_and_multiclass_hifz.sql'), 'utf8');

const client = new Client({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Applying migration...');
  try {
    await client.query(sql);
    console.log('Migration applied successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.end();
  }
}

run();
