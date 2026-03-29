require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });

async function update() {
    await client.connect();
    try {
        await client.query(`
            TRUNCATE TABLE attendance_marks CASCADE;
            TRUNCATE TABLE attendance_cancellations CASCADE;
            TRUNCATE TABLE attendance_schedules CASCADE;
            
            ALTER TABLE attendance_schedules ADD COLUMN IF NOT EXISTS academic_year_id UUID REFERENCES academic_years(id);
        `);
        console.log('Tables truncated and academic_year_id added.');
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
update();
