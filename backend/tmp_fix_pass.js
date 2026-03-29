const { Client } = require('pg'); 
require('dotenv').config(); 
const bcrypt = require('bcrypt');

async function fix() {
    const client = new Client({ 
        connectionString: process.env.DATABASE_URL, 
        ssl: { rejectUnauthorized: false } 
    });
    try {
        await client.connect();
        const hash = await bcrypt.hash('password123', 10);
        const res = await client.query('UPDATE staff SET password_hash = $1 WHERE email = $2', [hash, 'zxc@gmail.com']);
        console.log(`Updated ${res.rowCount} row(s). Password for zxc@gmail.com is now password123`);
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
fix();
