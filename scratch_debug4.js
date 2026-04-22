const { db } = require('./backend/dist/config/db');

async function run() {
    try {
        const staff = await db.query("SELECT id, name, email FROM staff WHERE name ILIKE '%Hafiz Muhammed Akbar%' OR name ILIKE '%Hafiz Siraj Ahmad%'");
        console.log('Staff:', staff.rows);
        
        // Find which users map to these staff
        for (const s of staff.rows) {
             const user = await db.query("SELECT * FROM auth.users WHERE email = $1", [s.email]);
             console.log(`User for ${s.name}:`, user.rows.map(u => ({ id: u.id, email: u.email })));
        }
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
