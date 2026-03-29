import { db } from './config/db';

async function run() {
  try {
    await db.query(`
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
    await db.query(`CREATE INDEX IF NOT EXISTS idx_delegations_from ON mentor_delegations(from_staff_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_delegations_to ON mentor_delegations(to_staff_id);`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_delegations_status ON mentor_delegations(status);`);

    console.log("Migration successful: mentor_delegations table created.");
    process.exit(0);
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  }
}

run();
