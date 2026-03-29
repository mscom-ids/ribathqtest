require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });

async function migrate() {
    await client.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS attendance_schedules (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                class_type VARCHAR(50) NOT NULL,
                standards JSONB NOT NULL DEFAULT '[]',
                day_of_week INT NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                duration_mins INT,
                mentor_id UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS attendance_cancellations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id UUID REFERENCES attendance_schedules(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                reason TEXT NOT NULL,
                cancelled_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(schedule_id, date)
            );

            CREATE TABLE IF NOT EXISTS attendance_marks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id UUID REFERENCES attendance_schedules(id) ON DELETE CASCADE,
                date DATE NOT NULL,
                marked_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(schedule_id, date)
            );
        `);
        console.log('Migration successful.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}
migrate();
