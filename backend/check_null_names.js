const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    const res = await pool.query(`SELECT COUNT(*) as bad_count FROM students WHERE status IN ('completed', 'dropout', 'stopped', 'higher_education') AND (name IS NULL OR name = '');`);
    console.log("Students with bad names:", res.rows[0].bad_count);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
