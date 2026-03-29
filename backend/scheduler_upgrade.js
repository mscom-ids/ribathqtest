require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });

async function upgrade() {
    await client.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS student_attendance_marks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id UUID REFERENCES attendance_schedules(id) ON DELETE CASCADE,
                student_id VARCHAR(50) REFERENCES students(adm_no) ON DELETE CASCADE,
                date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'present',
                marked_by UUID REFERENCES staff(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(schedule_id, student_id, date)
            );
        `);
        console.log('student_attendance_marks table ready.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS staff_attendance (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                status VARCHAR(20) DEFAULT 'present',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(staff_id, date)
            );
        `);
        console.log('staff_attendance table ready.');

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
upgrade();
