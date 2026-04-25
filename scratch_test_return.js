const { db } = require('./backend/dist/config/db');
async function test() {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query(`
            INSERT INTO student_movements (student_id, leave_id, direction, timestamp, is_late, recorded_by)
            VALUES ($1, $2, 'in', NOW(), false, $3)
        `, ['R341', '2a09c28e-a5a8-4baf-85ee-fb1b8c0cf228', 'f7668803-b5c4-4e1f-8d25-22aa97ae8a6b']);
        await client.query(`
            UPDATE student_leaves
            SET status = 'completed', actual_return_datetime = NOW(), return_status = 'late', updated_at = NOW()
            WHERE id = $1
        `, ['2a09c28e-a5a8-4baf-85ee-fb1b8c0cf228']);
        await client.query('ROLLBACK');
        console.log('SUCCESS');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('FAILED:', e.message);
    } finally {
        client.release();
        process.exit(0);
    }
}
test();
