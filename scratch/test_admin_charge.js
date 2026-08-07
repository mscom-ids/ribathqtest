const { db } = require('../backend/dist/config/db');
const { createCharge } = require('../backend/dist/modules/finance/finance.service');
const { resolveFinanceActor } = require('../backend/dist/modules/finance/finance.auth');

async function testAdminCharge() {
    try {
        const adminStaffRes = await db.query("SELECT id, role, email FROM staff WHERE role IN ('admin', 'principal', 'vice_principal', 'controller') LIMIT 1");
        const adminStaff = adminStaffRes.rows[0];
        console.log('Admin staff found:', adminStaff);

        if (adminStaff) {
            const actor = await resolveFinanceActor({ user: { id: adminStaff.id, role: adminStaff.role, email: adminStaff.email } });
            console.log('Resolved admin actor:', actor);

            const catRes = await db.query("SELECT id FROM charge_categories WHERE name ILIKE '%laundry%' LIMIT 1");
            const categoryId = catRes.rows[0]?.id;

            const key = 'test-key-admin-' + Date.now();
            console.log('Creating charge with key:', key);

            const result = await createCharge(actor, {
                student_id: 'R292',
                category_id: categoryId,
                amount: 35,
                date: '2026-08-07',
                due_date: '2026-08-07',
                description: 'paisa thanitilla test',
                idempotency_key: key
            });

            console.log('ADMIN CHARGE SUCCESS:', result.obligation.id, 'Amount:', result.obligation.amount);

            // Clean up test obligation
            await db.query("DELETE FROM finance_obligations WHERE idempotency_key = $1", [key]);
            await db.query("DELETE FROM finance_audit_events WHERE entity_id = $1", [result.obligation.id]);
            console.log('Test charge cleaned up.');
        } else {
            console.log('No admin staff found in database.');
        }
    } catch (err) {
        console.error('ADMIN CHARGE ERROR:', err);
    } finally {
        process.exit(0);
    }
}

testAdminCharge();
