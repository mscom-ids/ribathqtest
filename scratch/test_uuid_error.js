const { db } = require('../backend/dist/config/db');

async function testQuery() {
    try {
        console.log('Testing query with non-uuid string in $1::uuid...');
        const res = await db.query(
            `SELECT id, role, name, email, is_active
             FROM staff
             WHERE id = $1::uuid
                OR ($2::uuid IS NOT NULL AND profile_id = $2::uuid)
                OR ($3::text IS NOT NULL AND lower(email) = lower($3::text))
             ORDER BY CASE WHEN id = $1::uuid THEN 0 ELSE 1 END
             LIMIT 1`,
            ['admin', null, 'admin@example.com']
        );
        console.log('Result:', res.rows);
    } catch (err) {
        console.error('Postgres error:', err);
    } finally {
        process.exit(0);
    }
}

testQuery();
