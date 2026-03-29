const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'madin_portal',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mentor_delegations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
        to_staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
        reason TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_delegations_from ON mentor_delegations(from_staff_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_delegations_to ON mentor_delegations(to_staff_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_delegations_status ON mentor_delegations(status);`);

    console.log("Migration successful: mentor_delegations table created.");
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    await pool.end();
  }
}

run();
