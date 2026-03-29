const { Client } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function reset() {
    await client.connect();
    const hash = await bcrypt.hash('password123', 10);
    const res = await client.query('UPDATE staff SET password_hash = $1 WHERE email = $2', [hash, 'zxc@gmail.com']);
    console.log('Updated rows:', res.rowCount);
    if (res.rowCount === 0) {
        // Maybe it's not under 'zxc@gmail.com'? Check everyone
        const all = await client.query('SELECT name, email FROM staff');
        console.log('Existing staff:', all.rows);
    }
    await client.end();
}

reset().catch(console.error);
