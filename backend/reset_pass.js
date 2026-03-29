require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    
    const hash = await bcrypt.hash('123456', 10);
    await c.query(`UPDATE staff SET password_hash = $1 WHERE email = 'adf@gmail.com'`, [hash]);
    
    console.log("Password for adf@gmail.com has been forcibly reset to '123456'!");
    
    await c.end();
}
main().catch(console.error);
