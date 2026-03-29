const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='students'")
    .then(res => console.log(res.rows.map(r => r.column_name)))
    .catch(e => console.log('ERROR:', e.message))
    .finally(() => pool.end());
