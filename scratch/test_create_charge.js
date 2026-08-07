const { db } = require('../backend/dist/config/db');

async function test() {
    try {
        console.log('1. Fetching Laundry category...');
        const catRes = await db.query("SELECT id, name, allocation_priority, requires_approval, allow_staff_entry FROM charge_categories WHERE name ILIKE '%laundry%' OR name ILIKE '%charge%'");
        console.log('Categories found:', catRes.rows);

        console.log('2. Fetching student R292...');
        const studRes = await db.query("SELECT adm_no, status, hifz_mentor_id, school_mentor_id, madrasa_mentor_id FROM students WHERE adm_no = 'R292'");
        console.log('Student found:', studRes.rows[0]);

        console.log('3. Checking staff permissions for charge:create...');
        const permRes = await db.query("SELECT * FROM finance_staff_permissions WHERE capability = 'charge:create'");
        console.log('Permissions found:', permRes.rows);

        console.log('4. Checking finance_obligations table structure / columns...');
        const colRes = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'finance_obligations'");
        console.log('Obligations columns:', colRes.rows.map(r => r.column_name));

        console.log('5. Checking finance_audit_events table structure / columns...');
        const auditColRes = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'finance_audit_events'");
        console.log('Audit columns:', auditColRes.rows.map(r => r.column_name));

    } catch (err) {
        console.error('Error during test:', err);
    } finally {
        process.exit(0);
    }
}

test();
