import { db } from './backend/src/config/db';

async function run() {
    try {
        console.log("Dropping existing mode check constraint...");
        await db.query(`ALTER TABLE hifz_logs DROP CONSTRAINT IF EXISTS hifz_logs_mode_check`);
        console.log("Constraint dropped.");

        console.log("Adding new mode check constraint...");
        await db.query(`
            ALTER TABLE hifz_logs ADD CONSTRAINT hifz_logs_mode_check 
            CHECK (mode = ANY (ARRAY['New Verses', 'Recent Revision', 'Juz Revision', 'Juz Revision (New)', 'Juz Revision (Old)']::text[]))
        `);
        console.log("Constraint added successfully.");
        
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

run();
