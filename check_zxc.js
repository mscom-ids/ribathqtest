const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config({ path: '../backend/.env' });

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres.jbsirxvegnxsjqoeszdj:mscomdb%40224@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
});

async function check() {
    await client.connect();
    const res = await client.query('SELECT name, email, password_hash, role FROM staff WHERE email = $1', ['zxc@gmail.com']);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
