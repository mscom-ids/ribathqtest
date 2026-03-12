const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/rqp_erp'
  });
  try {
    await client.connect();
    await client.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS comprehensive_details JSONB DEFAULT \'{}\'::jsonb');
    console.log('Successfully added comprehensive_details column to students table (or it already existed)');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

run();
