const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const result = await p.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'students'");
  fs.writeFileSync('nulls.json', JSON.stringify(result.rows, null, 2), 'utf8');
  p.end();
}
check();
