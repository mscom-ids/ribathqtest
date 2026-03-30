const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres'
});

async function run() {
  try {
    await client.connect();
    console.log('Connected. Running migration...');
    await client.query(`
      ALTER TABLE students 
      ADD COLUMN IF NOT EXISTS gender VARCHAR(50), 
      ADD COLUMN IF NOT EXISTS admission_date DATE, 
      ADD COLUMN IF NOT EXISTS nationality VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS pincode VARCHAR(20), 
      ADD COLUMN IF NOT EXISTS post VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS district VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS state VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS place VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS local_body VARCHAR(100), 
      ADD COLUMN IF NOT EXISTS aadhar VARCHAR(50), 
      ADD COLUMN IF NOT EXISTS id_mark VARCHAR(255), 
      ADD COLUMN IF NOT EXISTS country VARCHAR(100);
    `);
    
    // Also, migrate existing data from comprehensive_details safely!
    await client.query(`
      UPDATE students
      SET 
        gender = comprehensive_details->'basic'->>'gender',
        nationality = comprehensive_details->'basic'->>'nationality',
        pincode = comprehensive_details->'basic'->>'pincode',
        post = comprehensive_details->'basic'->>'post',
        district = comprehensive_details->'basic'->>'district',
        state = comprehensive_details->'basic'->>'state',
        place = comprehensive_details->'basic'->>'place',
        local_body = comprehensive_details->'basic'->>'local_body',
        aadhar = comprehensive_details->'basic'->>'aadhar',
        id_mark = comprehensive_details->'basic'->>'id_mark',
        country = comprehensive_details->'basic'->>'country'
      WHERE comprehensive_details IS NOT NULL AND comprehensive_details->'basic' IS NOT NULL;
    `);
    
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    await client.end();
  }
}

run();
