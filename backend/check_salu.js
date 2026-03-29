const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' });

async function check() {
  await client.connect();
  let res = await client.query("SELECT id, email, password_hash, role, is_active FROM staff WHERE email ILIKE '%salu%' OR name ILIKE '%salu%' ORDER BY created_at DESC LIMIT 5");
  console.log("Found staff:", res.rows);
  await client.end();
}
check().catch(console.error);
