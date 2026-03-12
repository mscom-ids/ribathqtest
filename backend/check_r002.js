const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT dob, date_of_birth FROM students WHERE adm_no = 'R002'").then(res => {
    console.log(res.rows[0]);
    pool.end();
}).catch(e => console.error(e));
