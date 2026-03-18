const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const postgresUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: postgresUrl, ssl: { rejectUnauthorized: false } });

async function getConstraints() {
    try {
        const query = `
            SELECT pg_get_constraintdef(c.oid) AS constraint_def
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE c.conname = 'staff_role_check';
        `;
        const res = await pool.query(query);
        console.log("Constraint Definition:", res.rows[0]?.constraint_def || "Not found");
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        pool.end();
    }
}

getConstraints();
