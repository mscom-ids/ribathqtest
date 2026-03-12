const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'students'")
  .then(r => fs.writeFileSync('students_cols.json', JSON.stringify(r.rows.map(row => row.column_name))))
  .finally(() => p.end());
