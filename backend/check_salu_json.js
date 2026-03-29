const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' });
client.connect().then(() => client.query("SELECT id, email, length(email) as len, password_hash, role, is_active FROM staff WHERE email ILIKE '%salu%'"))
.then(res => { console.log(JSON.stringify(res.rows, null, 2)); client.end(); })
.catch(err => { console.error(err); client.end(); });
