const { db } = require('../backend/dist/config/db');
const { createCharge } = require('../backend/dist/modules/finance/finance.service');

async function testFullCharge() {
    try {
        // Let's get a staff ID from staff table
        const staffRes = await db.query("SELECT id, role FROM staff LIMIT 1");
        console.log('Sample Staff:', staffRes.rows[0]);
        const staff = staffRes.rows[0] || { id: '00000000-0000-0000-0000-000000000000', role: 'admin' };

        const actor = {
            staffId: staff.id,
            role: staff.role || 'admin',
            isSystemAdmin: true,
            ipAddress: '127.0.0.1'
        };

        const catRes = await db.query("SELECT id FROM charge_categories WHERE name ILIKE '%laundry%' LIMIT 1");
        const categoryId = catRes.rows[0]?.id;

        console.log('Calling createCharge with categoryId:', categoryId);

        const res = await createCharge(actor, {
            student_id: 'R292',
            category_id: categoryId,
            amount: 35,
            date: '2026-08-07',
            due_date: '2026-08-07',
            description: 'paisa thanitilla',
            idempotency_key: 'test-key-' + Date.now()
        });

        console.log('SUCCESS RESULT:', res);
    } catch (err) {
        console.error('FAILED WITH ERROR:');
        console.error(err);
    } finally {
        process.exit(0);
    }
}

testFullCharge();
