import { db } from './src/config/db';

async function check() {
    try {
        const res = await db.query("SELECT email, password_hash, role FROM staff WHERE email = 'mswabeehcom@gmail.com'");
        console.log("Database result:", res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
check();
