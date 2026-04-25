const { db } = require('./backend/dist/config/db');

async function debug() {
    try {
        // 1. Check all on-campus leaves and who the student is assigned to
        const oncampus = await db.query(`
            SELECT sl.id, sl.leave_type, sl.status, sl.start_datetime, sl.end_datetime,
                   s.adm_no, s.name as student_name,
                   s.hifz_mentor_id, s.school_mentor_id, s.madrasa_mentor_id,
                   (SELECT name FROM staff WHERE id = s.hifz_mentor_id) as hifz_mentor,
                   (SELECT name FROM staff WHERE id = s.school_mentor_id) as school_mentor,
                   (SELECT name FROM staff WHERE id = s.madrasa_mentor_id) as madrasa_mentor
            FROM student_leaves sl
            JOIN students s ON sl.student_id = s.adm_no
            WHERE sl.leave_type IN ('on-campus', 'internal')
            ORDER BY sl.created_at DESC
            LIMIT 10
        `);
        console.log('\n=== ON-CAMPUS / INTERNAL LEAVES ===');
        console.table(oncampus.rows.map(r => ({
            student: r.student_name,
            adm_no: r.adm_no,
            type: r.leave_type,
            status: r.status,
            hifz_mentor: r.hifz_mentor || 'NONE',
            school_mentor: r.school_mentor || 'NONE',
            madrasa_mentor: r.madrasa_mentor || 'NONE',
        })));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
debug();
