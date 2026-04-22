const { db } = require('./backend/dist/config/db');

async function run() {
    try {
        const dupes = await db.query("SELECT profile_id, count(*) FROM staff GROUP BY profile_id HAVING count(*) > 1");
        console.log('Duplicate profile_ids:', dupes.rows);
        
        const marks = await db.query("SELECT * FROM attendance_marks WHERE date = '2026-04-19'");
        console.log('Marks:', marks.rows);
        
        const marksProfileIds = marks.rows.map(m => m.marked_by);
        
        if (marksProfileIds.length > 0) {
           const staff = await db.query(`SELECT id, name, profile_id FROM staff WHERE id IN (${marksProfileIds.map(id => `'${id}'`).join(',')})`);
           console.log('Staff matching marks:', staff.rows);
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
