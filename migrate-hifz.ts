import { db } from './backend/src/config/db';
import { countCompletedJuz } from './backend/src/utils/quran-juz';

async function run() {
    try {
        console.log("Fetching progress summary...");
        const result = await db.query(`
            SELECT student_id, surah_name, start_v, end_v
            FROM hifz_logs
            WHERE mode = 'New Verses'
              AND surah_name IS NOT NULL
              AND start_v IS NOT NULL
              AND end_v IS NOT NULL
        `);

        const byStudent: Record<string, any[]> = {};
        for (const row of result.rows) {
            if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
            byStudent[row.student_id].push(row);
        }

        const hafizStudentIds: string[] = [];
        for (const [studentId, logs] of Object.entries(byStudent)) {
            if (countCompletedJuz(logs) >= 30) {
                hafizStudentIds.push(studentId);
            }
        }

        console.log(`Found ${hafizStudentIds.length} Hafiz students.`);

        if (hafizStudentIds.length > 0) {
            console.log("Updating their old 'Juz Revision' entries to 'Juz Revision (New)'...");
            const updateRes = await db.query(
                `UPDATE hifz_logs
                 SET mode = 'Juz Revision (New)'
                 WHERE mode = 'Juz Revision'
                   AND student_id = ANY($1::varchar[])`,
                [hafizStudentIds]
            );
            console.log(`Updated ${updateRes.rowCount} rows successfully.`);
        } else {
            console.log("No Hafiz students found. Nothing to update.");
        }
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        process.exit();
    }
}

run();
