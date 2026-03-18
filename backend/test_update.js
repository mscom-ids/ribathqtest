const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });

async function testUpdate() {
    try {
        const staffRes = await pool.query('SELECT * FROM staff LIMIT 1');
        if (staffRes.rows.length === 0) return;
        const staff = staffRes.rows[0];
        
        const updateData = {
            name: staff.name,
            role: staff.role,
            staff_id: staff.staff_id,
            phone: staff.phone,
            address: staff.address,
            place: staff.place,
            photo_url: staff.photo_url,
            phone_contacts: staff.phone_contacts
        };

        const allowedFields = ['name', 'role', 'phone', 'email', 'photo_url', 'address', 'place', 'phone_contacts', 'staff_id'];
        const setClauses = [];
        const values = [];
        let paramCount = 1;

        for (const key of Object.keys(updateData)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramCount}`);
                
                // If it's phone_contacts, test if we need JSON.stringify
                values.push(updateData[key]);
                paramCount++;
            }
        }
        
        values.push(staff.id);
        const query = `UPDATE staff SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`;
        console.log(JSON.stringify({ query, values }));
        
        const result = await pool.query(query, values);
        console.log(JSON.stringify({ success: result.rows[0].id }));
        
    } catch (err) {
        console.log("DB Error message:", err.message);
        console.log("DB Error code:", err.code);
        console.log("DB Error detail:", err.detail);
    } finally {
        pool.end();
    }
}

testUpdate();
