const { db } = require('../backend/dist/config/db');

async function testFixed() {
    try {
        console.log('Testing query with userId=null, profileId=null, email="test@example.com"...');
        const res1 = await db.query(
            `SELECT id, role, name, email, is_active
             FROM staff
             WHERE ($1::text IS NOT NULL AND id::text = $1::text)
                OR ($2::text IS NOT NULL AND profile_id::text = $2::text)
                OR ($3::text IS NOT NULL AND lower(email) = lower($3::text))
             ORDER BY CASE WHEN id::text = $1::text THEN 0 ELSE 1 END
             LIMIT 1`,
            [null, null, 'test@example.com']
        );
        console.log('Res1 success:', res1.rows);

        console.log('\nTesting with UUID userId...');
        const res2 = await db.query(
            `SELECT id, role, name, email, is_active
             FROM staff
             WHERE ($1::text IS NOT NULL AND id::text = $1::text)
                OR ($2::text IS NOT NULL AND profile_id::text = $2::text)
                OR ($3::text IS NOT NULL AND lower(email) = lower($3::text))
             ORDER BY CASE WHEN id::text = $1::text THEN 0 ELSE 1 END
             LIMIT 1`,
            ['a7f16768-e654-425f-ac56-77541f6331c4', null, null]
        );
        console.log('Res2 success:', res2.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

testFixed();
