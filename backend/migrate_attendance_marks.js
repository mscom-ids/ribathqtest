const { db } = require('./dist/config/db');

async function run() {
    try {
        console.log('Starting migration...');
        
        // Find staff members with profile_id
        const staffRes = await db.query('SELECT id, profile_id FROM staff WHERE profile_id IS NOT NULL');
        let count = 0;
        
        for (const s of staffRes.rows) {
            if (s.id === s.profile_id) continue; // If they are the same, no need to update
            
            // Update attendance_marks
            const res1 = await db.query('UPDATE attendance_marks SET marked_by = $1 WHERE marked_by = $2', [s.id, s.profile_id]);
            
            // Update student_attendance_marks
            const res2 = await db.query('UPDATE student_attendance_marks SET marked_by = $1 WHERE marked_by = $2', [s.id, s.profile_id]);
            
            if (res1.rowCount > 0 || res2.rowCount > 0) {
                console.log(`Updated for staff ${s.id} (from profile ${s.profile_id}): ${res1.rowCount} marks, ${res2.rowCount} student marks`);
                count++;
            }
        }
        
        console.log(`Migration complete. Updated records for ${count} staff members.`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit(0);
    }
}

run();
