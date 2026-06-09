import { db } from './src/config/db';

async function run() {
    try {
        const res = await db.query("DELETE FROM attendance_schedules WHERE academic_year_id = '5366c88b-859e-498c-8a0e-9463ab354b17'");
        console.log("Deleted", res.rowCount);
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

run();
