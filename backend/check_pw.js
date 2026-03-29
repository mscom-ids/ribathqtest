const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({
  connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  // Get ALL staff password hashes
  const r = await pool.query("SELECT email, password_hash, role FROM staff ORDER BY name");
  
  console.log('\n=== ALL STAFF PASSWORD HASHES ===\n');
  const hashes = new Set();
  for (const row of r.rows) {
    hashes.add(row.password_hash);
    console.log(`${row.email.padEnd(25)} | ${row.role.padEnd(10)} | ${row.password_hash || 'NULL'}`);
  }
  
  console.log(`\nUnique hashes: ${hashes.size} (total staff: ${r.rows.length})`);
  
  // Test login with a known staff member - try common passwords
  const testEmail = 'hamid@gmail.com';
  const testPasswords = ['123456', 'password', 'test123', '12345678', 'mentor123', 'admin123', 'Mentor@123'];
  
  const staffRow = r.rows.find(r => r.email === testEmail);
  if (staffRow && staffRow.password_hash) {
    console.log(`\n=== Testing passwords for ${testEmail} ===\n`);
    console.log(`Hash: ${staffRow.password_hash}`);
    for (const pw of testPasswords) {
      const match = await bcrypt.compare(pw, staffRow.password_hash);
      console.log(`  "${pw}" => ${match ? '✅ MATCH!' : '❌ no match'}`);
    }
  }
  
  await pool.end();
}
check().catch(e => { console.error(e); pool.end(); });
