const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });

async function testInsert() {
    try {
        const payload = {
            name: "Test Mentor Post",
            role: "usthad",
            phone: "1234567890",
            address: "Test Address",
            place: "Test Place",
            photo_url: null,
            phone_contacts: [{ number: "1234567890", relation: "Personal" }],
        };
        
        const selectedRole = payload.role || 'usthad';
        let finalStaffId = 'SR99-2024-04'; // Simulated
        
        const columns = ['name', 'role', 'staff_id'];
        const values = [payload.name.trim(), selectedRole, finalStaffId];
        let paramCount = 4;

        const optionalFields = {
            phone: payload.phone || null,
            address: payload.address || null,
            place: payload.place || null,
            phone_contacts: payload.phone_contacts || [],
        };

        for (const [col, val] of Object.entries(optionalFields)) {
            if (val !== null && val !== undefined) {
                columns.push(col);
                
                let insertVal = val;
                if (col === 'phone_contacts' && Array.isArray(insertVal)) {
                    insertVal = JSON.stringify(insertVal);
                }
                
                values.push(insertVal);
                paramCount++;
            }
        }
        
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO staff (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        console.log(JSON.stringify({ query, values }));
        
        const result = await pool.query(query, values);
        console.log("Success Insert:", result.rows[0].id);
        
        // Clean up text mentor
        await pool.query('DELETE FROM staff WHERE id = $1', [result.rows[0].id]);
        
    } catch (err) {
        console.log("DB Error message:", err.message);
        console.log("DB Error code:", err.code);
        console.log("DB Error detail:", err.detail);
    } finally {
        pool.end();
    }
}

testInsert();
