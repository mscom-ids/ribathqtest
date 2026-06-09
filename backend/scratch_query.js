const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const postgresUrl = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: postgresUrl,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 15000,
});

async function run() {
  const client = await pool.connect();
  try {
    const sessions = await client.query('SELECT * FROM hifz_sessions');
    const rules = await client.query('SELECT * FROM hifz_session_rules');
    console.log('Hifz Sessions:', sessions.rows);
    console.log('Hifz Rules:', rules.rows);
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
