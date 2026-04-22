const { db } = require('./backend/dist/config/db');

async function run() {
    try {
        const staff = await db.query("SELECT * FROM staff WHERE id = 'fadf0a2b-e0dc-44ba-ac50-4bfdedb5954c' OR profile_id = 'fadf0a2b-e0dc-44ba-ac50-4bfdedb5954c'");
        console.log('Staff:', staff.rows);
        
        // Let's check who the current logged in user might be if they are Hafiz
        const profile = await db.query("SELECT * FROM profiles WHERE id = 'fadf0a2b-e0dc-44ba-ac50-4bfdedb5954c' OR id = 'fdc01161-33cf-4541-8d6d-11d8d7c09b5b'");
        console.log('Profiles:', profile.rows);
        
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
