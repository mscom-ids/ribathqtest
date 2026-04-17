import { db } from './backend/src/config/db';

async function run() {
    try {
        const result = await db.query("SELECT mode, COUNT(*) FROM hifz_logs WHERE student_id = 'R263' GROUP BY mode");
        console.log("R263 logs by mode:", result.rows);
        
        const res2 = await db.query("SELECT * FROM hifz_logs WHERE student_id = 'R263' AND mode = 'New Verses' LIMIT 5");
        console.log("Sample New Verses:", res2.rows);

        const res3 = await db.query("SELECT count(*) as total_new FROM hifz_logs WHERE student_id = 'R263' AND mode = 'New Verses'");
        console.log("Total New Verses:", res3.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
