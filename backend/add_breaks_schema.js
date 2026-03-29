require('dotenv').config();
const { Client } = require('pg');

const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });

async function upgrade() {
    await client.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS academic_breaks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL, -- 'morning', 'lunch', 'evening'
                name VARCHAR(100) NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(academic_year_id, type)
            );
        `);
        console.log('academic_breaks table created.');
        
        // Seed default breaks for all existing academic years if they don't have them
        const years = await client.query('SELECT id FROM academic_years');
        
        for (const year of years.rows) {
            await client.query(`
                INSERT INTO academic_breaks (academic_year_id, type, name, start_time, end_time) VALUES
                ($1, 'morning', 'Morning Break', '10:30:00', '10:45:00'),
                ($1, 'lunch', 'Lunch', '13:00:00', '13:30:00'),
                ($1, 'evening', 'Evening Break', '15:30:00', '15:45:00')
                ON CONFLICT (academic_year_id, type) DO NOTHING;
            `, [year.id]);
        }
        
        console.log('Default breaks populated for available academic years.');
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
upgrade();
