require('dotenv').config();
const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    
    // Hash the password '123456'
    const hash = await bcrypt.hash('123456', 10);
    
    // Apply it to all non-admin staff just to ensure there are no login credential mismatches
    await c.query(`UPDATE staff SET password_hash = $1 WHERE role IN ('usthad', 'mentor', 'staff')`, [hash]);
    
    console.log("Passwords for all staff/usthad/mentors forcefully reset to '123456'");
    
    await c.end();
}
main().catch(console.error);
