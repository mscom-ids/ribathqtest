const { db } = require('./backend/dist/config/db');
async function fix() {
    try {
        await db.query(`UPDATE student_leaves SET status = 'approved' WHERE leave_type IN ('on-campus', 'internal') AND status = 'pending'`);
        console.log('Fixed pending on-campus leaves');
    } catch(e) {
        console.error(e.message);
    } finally {
        process.exit(0);
    }
}
fix();
