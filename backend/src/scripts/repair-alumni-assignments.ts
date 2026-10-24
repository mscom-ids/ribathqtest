import { db, closeDatabasePool } from '../config/db';
import { disconnectAlumniAssignments } from '../services/student-exit.service';

// Dry run by default; pass --apply only after reviewing the alumni count.
async function run() {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(`SELECT adm_no, COALESCE(exit_date, CURRENT_DATE)::text AS exit_date
            FROM students WHERE status IN ('completed', 'dropout', 'stopped', 'higher_education') FOR UPDATE`);
        console.log(`Alumni records to reconcile: ${result.rows.length}`);
        if (process.argv.includes('--apply')) {
            for (const student of result.rows) {
                await disconnectAlumniAssignments(client, student.adm_no, student.exit_date);
            }
            await client.query('COMMIT');
            console.log('Operational assignments closed; historical records retained. Restart the backend to clear roster caches.');
        } else {
            await client.query('ROLLBACK');
            console.log('Dry run only. No records changed.');
        }
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await closeDatabasePool();
    }
}
void run().catch(error => { console.error(error.message); process.exitCode = 1; });
