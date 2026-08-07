const { db } = require('../backend/dist/config/db');

async function testStandards() {
    console.log('--- Checking attendance_schedules standards column data ---');
    const res = await db.query(`SELECT id, name, standards, pg_typeof(standards) as pg_type FROM attendance_schedules`);
    let badRows = 0;
    for (const r of res.rows) {
        let stds = r.standards;
        if (typeof stds === 'string') {
            try {
                stds = JSON.parse(stds || '[]');
            } catch (e) {
                console.error(`Row ${r.id} (${r.name}): Invalid JSON string -> ${r.standards}`);
                badRows++;
                continue;
            }
        }
        if (!Array.isArray(stds)) {
            console.error(`Row ${r.id} (${r.name}): Not an array! Value:`, r.standards, 'Type:', typeof r.standards);
            badRows++;
        }
    }
    console.log(`Total rows checked: ${res.rows.length}. Bad standards rows: ${badRows}`);
    process.exit(0);
}

testStandards();
