const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres'
});

client.connect()
  .then(() => client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'students'"))
  .then(res => {
    console.log(res.rows.map(r => r.column_name).join(', '));
    return client.end();
  })
  .catch(console.error);
