require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    const res = await client.query("SELECT id, name FROM institutional_leaves ORDER BY created_at DESC LIMIT 1");
    if(res.rows.length === 0) { console.log('none'); return client.end() }
    const leave = res.rows[0];
    console.log("Leave:", leave);
    
    const studentsRes = await client.query("SELECT id, status FROM student_leaves WHERE institutional_leave_id = $1 LIMIT 5", [leave.id]);
    console.log("Students:", studentsRes.rows);
    client.end();
}).catch(console.error);
