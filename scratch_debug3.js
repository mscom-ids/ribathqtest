const { db } = require('./backend/dist/config/db');

async function run() {
    try {
        console.log("Checking all marks for schedule '99160670-dda2-46de-9c30-47989504d715' (Hifz @ Subh for someone)");
        const marks1 = await db.query("SELECT * FROM attendance_marks");
        console.log(`Total marks in DB: ${marks1.rowCount}`);
        
        // Find staff id for Hafiz Muhammed Akbar
        const staffRes = await db.query("SELECT id FROM staff WHERE name ILIKE '%Hafiz Muhammed Akbar%'");
        const akbarId = staffRes.rows[0]?.id;
        
        console.log('Akbar staff ID:', akbarId);
        
        const akbarMarks = await db.query("SELECT * FROM attendance_marks WHERE marked_by = $1", [akbarId]);
        console.log('Marks by Akbar:', akbarMarks.rows);
        
        // Find marks by Siraj
        const sirajRes = await db.query("SELECT id FROM staff WHERE name ILIKE '%Hafiz Siraj Ahmad%'");
        const sirajId = sirajRes.rows[0]?.id;
        
        console.log('Siraj staff ID:', sirajId);
        
        const sirajMarks = await db.query("SELECT * FROM attendance_marks WHERE marked_by = $1", [sirajId]);
        console.log('Marks by Siraj:', sirajMarks.rows);
        
        // Let's also check schedule IDs
        const scheds = await db.query("SELECT id, name FROM attendance_schedules WHERE name ILIKE '%Subh%'");
        console.log('Schedules:', scheds.rows);
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
