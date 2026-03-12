const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.local' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const staffInsert = await client.query(
            'INSERT INTO staff (name, email, role, phone) VALUES ($1, $2, $3, $4) RETURNING id',
            ['unais adany', 'unad@gmail.com', 'staff', '+91 8921551686']
        );
        console.log("Staff inserted:", staffInsert.rows[0].id);

        try {
            const userInsert = await client.query(
                'INSERT INTO users (email, password_hash, full_name, role, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                ['unad@gmail.com', 'fakehash', 'unais adany', 'staff', '+91 8921551686']
            );
            console.log("User inserted:", userInsert.rows[0].id);
        } catch (err) {
            console.log("Users insert failed:", err.code, err.message);
            if (err.code === '42P01') {
                const profileInsert = await client.query(
                    'INSERT INTO profiles (id, full_name, role, password_hash) VALUES (uuid_generate_v4(), $1, $2, $3) RETURNING id',
                    ['unais adany', 'staff', 'fakehash']
                );
                console.log("Profile inserted:", profileInsert.rows[0].id);
            } else {
                throw err;
            }
        }

        await client.query('ROLLBACK');
        console.log("Success (rolled back)");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Test Error:", err.message);
    } finally {
        client.release();
        pool.end();
    }
}
test();
