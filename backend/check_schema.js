require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    
    const tables = ['attendance_schedules', 'attendance_marks', 'student_attendance_marks', 'attendance_cancellations', 'academic_breaks', 'academic_years'];
    
    for (const t of tables) {
        console.log('');
        console.log('=== ' + t + ' ===');
        try {
            const r = await c.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [t]);
            if (r.rows.length === 0) { console.log('  TABLE DOES NOT EXIST'); continue; }
            r.rows.forEach(r => console.log('  ' + r.column_name + ' (' + r.data_type + ') nullable=' + r.is_nullable));
            
            const cnt = await c.query('SELECT COUNT(*) as cnt FROM ' + t);
            console.log('  rows: ' + cnt.rows[0].cnt);
        } catch(e) {
            console.log('  ERROR: ' + e.message);
        }
    }
    
    // Sample schedules
    console.log('');
    console.log('=== SAMPLE SCHEDULES ===');
    try {
        const r = await c.query('SELECT * FROM attendance_schedules LIMIT 5');
        r.rows.forEach(r => console.log('  ' + JSON.stringify(r)));
    } catch(e) {
        console.log('  ' + e.message);
    }
    
    await c.end();
}

main().catch(console.error);
