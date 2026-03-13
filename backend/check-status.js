const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
    const res = await client.query(
        "SELECT adm_no, name, status FROM students WHERE adm_no IN ('R013','R019','R020','R021') ORDER BY adm_no"
    );
    console.log(JSON.stringify(res.rows, null, 2));

    const countRes = await client.query(
        "SELECT status, COUNT(*) as cnt FROM students GROUP BY status ORDER BY status"
    );
    console.log('\nStatus counts:');
    console.log(JSON.stringify(countRes.rows, null, 2));

    client.end();
}).catch(e => { console.error(e); client.end(); });
