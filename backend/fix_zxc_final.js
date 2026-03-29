const { Client } = require('pg'); 
require('dotenv').config(); 
const bcrypt = require('bcrypt');

async function run() {
    const client = new Client({ 
        connectionString: process.env.DATABASE_URL, 
        ssl: { rejectUnauthorized: false } 
    });
    try {
        await client.connect();
        const hash = await bcrypt.hash('password123', 10);
        const res = await client.query('UPDATE staff SET email = $1, password_hash = $2 WHERE id = $3', ['zxc@gmail.com', hash, 'c55bde4e-5395-412d-8347-439e7a284f5a']);
        console.log(`Update successful: ${res.rowCount} row(s) updated.`);
    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        await client.end();
    }
}
run();
