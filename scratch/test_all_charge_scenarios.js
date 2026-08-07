const { db } = require('../backend/dist/config/db');
const { createCharge } = require('../backend/dist/modules/finance/finance.service');
const { resolveFinanceActor } = require('../backend/dist/modules/finance/finance.auth');

async function runTests() {
    try {
        console.log('--- TEST 1: resolveFinanceActor with user.id="admin" ---');
        try {
            await resolveFinanceActor({ user: { id: 'admin', role: 'admin' } });
        } catch (e) {
            console.error('TEST 1 ERROR:', e);
        }

        console.log('\n--- TEST 2: resolveFinanceActor with valid staff UUID ---');
        const staffRes = await db.query("SELECT id, role, email FROM staff WHERE is_active = true LIMIT 1");
        const realStaff = staffRes.rows[0];
        console.log('Real staff found:', realStaff);

        if (realStaff) {
            try {
                const actor = await resolveFinanceActor({ user: { id: realStaff.id, role: realStaff.role, email: realStaff.email } });
                console.log('Resolved actor:', actor);

                console.log('\n--- TEST 3: createCharge with resolved actor ---');
                const catRes = await db.query("SELECT id FROM charge_categories WHERE name ILIKE '%laundry%' LIMIT 1");
                const categoryId = catRes.rows[0]?.id;

                const result = await createCharge(actor, {
                    student_id: 'R292',
                    category_id: categoryId,
                    amount: 35,
                    date: '2026-08-07',
                    due_date: '2026-08-07',
                    description: 'paisa thanitilla',
                    idempotency_key: 'test-key-' + Date.now()
                });
                console.log('TEST 3 SUCCESS:', result);
            } catch (e) {
                console.error('TEST 3 ERROR:', e);
            }
        }

    } catch (err) {
        console.error('General error:', err);
    } finally {
        process.exit(0);
    }
}

runTests();
