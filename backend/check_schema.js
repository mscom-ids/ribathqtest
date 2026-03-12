const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'staff'").then(res => {
    fs.writeFileSync('staff_schema.json', JSON.stringify(res.rows.map(r => r.column_name)));
    return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles'");
}).then(res => {
    fs.writeFileSync('profiles_schema.json', JSON.stringify(res.rows.map(r => r.column_name)));
    pool.end();
}).catch(e => console.error(e));
