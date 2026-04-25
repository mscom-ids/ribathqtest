const { db } = require('./backend/dist/config/db');
async function run() {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE student_leaves DROP CONSTRAINT student_leaves_status_check');
        await client.query(`ALTER TABLE student_leaves ADD CONSTRAINT student_leaves_status_check CHECK (status::text = ANY (ARRAY['outside'::character varying, 'returned'::character varying, 'cancelled'::character varying, 'pending'::character varying, 'rejected'::character varying, 'approved'::character varying, 'completed'::character varying]::text[]))`);
        await client.query('COMMIT');
        console.log('Constraint updated successfully');
        process.exit(0);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e.message);
        process.exit(1);
    } finally {
        client.release();
    }
}
run();
