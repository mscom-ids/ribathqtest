require('dotenv').config({ path: '../.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                title VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                event_for VARCHAR(50) NOT NULL,
                target_roles JSONB,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                message TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("Table 'events' created successfully.");
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await pool.end();
    }
}

migrate();
