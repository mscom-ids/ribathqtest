const { db } = require('./backend/dist/config/db');

async function check() {
    try {
        const res = await db.query(`
            SELECT id, name, length(name) as len 
            FROM attendance_schedules 
            WHERE name ILIKE '%Morning%' OR name ILIKE '%Subh%'
        `);
        console.table(res.rows.map(r => ({...r, hex: Buffer.from(r.name).toString('hex')})));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
