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
    const res = await client.query(
      `SELECT academic_year_id, school_standard, school_section, count(*) 
       FROM student_school_enrollments 
       GROUP BY academic_year_id, school_standard, school_section 
       ORDER BY academic_year_id, school_standard, school_section`
    );
    console.log('School enrollments grouping:', res.rows);
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
