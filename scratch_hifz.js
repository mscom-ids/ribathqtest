const { db } = require('./backend/dist/config/db');

async function run() {
    try {
        const today = new Date().toISOString().split('T')[0];
        console.log('Today:', today);

        // Get hifz logs for today
        const logs = await db.query(
            `SELECT hl.student_id, hl.mode, hl.start_page, hl.end_page, hl.start_v, hl.end_v, 
                    hl.juz_portion, hl.entry_date, s.name as student_name
             FROM hifz_logs hl
             JOIN students s ON hl.student_id = s.adm_no
             WHERE hl.entry_date = $1
             ORDER BY s.name`,
            [today]
        );
        console.log(`Hifz logs for ${today} (${logs.rowCount} entries):`);
        logs.rows.forEach(r => {
            console.log(`  ${r.student_name} | mode: ${r.mode} | start_page: ${r.start_page} | end_page: ${r.end_page} | start_v: ${r.start_v} | end_v: ${r.end_v}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
