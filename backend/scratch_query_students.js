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
    const stds = await client.query('SELECT DISTINCT standard FROM students');
    const madrasaStds = await client.query('SELECT DISTINCT madrassa_standard FROM students');
    const hifzStds = await client.query('SELECT DISTINCT hifz_standard FROM students');
    console.log('Students standard:', stds.rows);
    console.log('Students madrassa_standard:', madrasaStds.rows);
    console.log('Students hifz_standard:', hifzStds.rows);
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
