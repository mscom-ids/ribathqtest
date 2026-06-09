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
    const studentsMadrassa = await client.query(
      `SELECT count(*) FROM students WHERE status='active' AND madrassa_standard IS NOT NULL AND madrassa_standard <> ''`
    );
    const snapshotsMadrassa = await client.query(
      `SELECT count(*) FROM student_year_snapshots WHERE academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6' AND madrasa_standard IS NOT NULL AND madrasa_standard <> ''`
    );
    console.log('Students with madrassa_standard in students table:', studentsMadrassa.rows[0]);
    console.log('Snapshots with madrasa_standard in snapshots table (2025-2026):', snapshotsMadrassa.rows[0]);
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
