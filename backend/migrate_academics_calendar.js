const { Client } = require('pg');
require('dotenv').config({ path: '../.env.local' });

const client = new Client({ 
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, 
    ssl: { rejectUnauthorized: false } 
});

async function run() {
    await client.connect();
    try {
        console.log('--- MIGRATING ACADEMIC CALENDAR ---');
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS academic_calendar (
                date DATE PRIMARY KEY,
                is_holiday BOOLEAN DEFAULT false,
                description TEXT,
                day_mode VARCHAR(50) DEFAULT 'Normal',
                effective_day_of_week INT,
                allowed_session_types JSONB,
                allowed_standards JSONB,
                session_overrides JSONB,
                cancelled_sessions JSONB DEFAULT '{}',
                leave_standards VARCHAR(255) DEFAULT '[]',
                cancellation_reason_type VARCHAR(50),
                cancellation_reason_text TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Created academic_calendar table.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS academic_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                start_time TIME,
                end_time TIME,
                days_of_week JSONB,
                is_active BOOLEAN DEFAULT true,
                standards JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Created academic_sessions table.');

        console.log('--- MIGRATION COMPLETE ---');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

run();
