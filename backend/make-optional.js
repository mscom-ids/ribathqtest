require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query('ALTER TABLE students ALTER COLUMN dob DROP NOT NULL');
    console.log('Successfully dropped NOT NULL constraint for dob');
  } catch(e) { console.error('Error dob:', e.message); }
  
  try {
    await pool.query('ALTER TABLE students ALTER COLUMN standard DROP NOT NULL');
    console.log('Successfully dropped NOT NULL constraint for standard');
  } catch(e) { console.error('Error standard:', e.message); }
  
  pool.end();
}
run();
