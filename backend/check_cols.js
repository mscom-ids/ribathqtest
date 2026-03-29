require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
   const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'students'");
   console.log(res.rows.map(r=>r.column_name).join(', '));
   client.end();
});
