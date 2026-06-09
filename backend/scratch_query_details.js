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
    const school = await client.query(
      `SELECT DISTINCT school_standard, school_section 
       FROM student_school_enrollments 
       WHERE academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'`
    );
    const madrasa = await client.query(
      `SELECT DISTINCT madrasa_standard, madrasa_section 
       FROM student_madrasa_enrollments 
       WHERE academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'`
    );
    console.log('School standard/sections for 2025-2026:', school.rows);
    console.log('Madrasa standard/sections for 2025-2026:', madrasa.rows);
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
