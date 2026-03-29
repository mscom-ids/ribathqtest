const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({ connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' });
client.connect()
.then(async () => {
   const salt = await bcrypt.genSalt(10);
   const hash = await bcrypt.hash('123456', salt);
   await client.query("UPDATE staff SET password_hash = $1 WHERE email = 'salu@gmail.com'", [hash]);
   console.log('Password reset successfully to 123456');
   client.end();
})
.catch(err => { console.error(err); client.end(); });
