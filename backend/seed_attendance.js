require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });

async function seed() {
    await client.connect();
    try {
        await client.query(`
            INSERT INTO attendance_schedules (class_type, standards, day_of_week, start_time, end_time, duration_mins) VALUES 
            ('school', '["Class II", "Class III"]', 1, '09:00:00', '09:45:00', 45),
            ('hifz', '["All Standards"]', 1, '09:45:00', '10:30:00', 45),
            ('madrassa', '["Class IV"]', 1, '10:45:00', '11:30:00', 45),
            ('school', '["Class I"]', 2, '09:00:00', '10:00:00', 60),
            ('madrassa', '["Class V"]', 3, '11:00:00', '12:00:00', 60)
            ON CONFLICT DO NOTHING;
        `);
        console.log('Seeded successfully.');
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
seed();
