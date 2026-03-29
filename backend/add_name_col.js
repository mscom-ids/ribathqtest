const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    try {
        await p.query(`ALTER TABLE attendance_schedules ADD COLUMN name VARCHAR(255)`);
        console.log("Column 'name' added successfully.");
    } catch (e) {
        if (e.code === '42701') { // column already exists
            console.log("Column 'name' already exists.");
        } else {
            console.error(e.message);
        }
    } finally {
        p.end();
    }
})();
