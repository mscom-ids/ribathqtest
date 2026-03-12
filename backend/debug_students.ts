import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'students'").then(res => {
    console.log("Columns:", res.rows.map(r => r.column_name));
    pool.end();
}).catch(e => console.error(e));
