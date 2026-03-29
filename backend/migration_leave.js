require('dotenv').config();
const { Client } = require('pg');

async function migrate() {
    const client = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();

    try {
        console.log('--- STARTING LEAVE SYSTEM MIGRATION ---');

        // Drop existing tables to completely reset the system as per request
        await client.query(`DROP TABLE IF EXISTS student_movements CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS student_leaves CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS leave_exceptions CASCADE;`);
        await client.query(`DROP TABLE IF EXISTS institutional_leaves CASCADE;`);
        console.log('Dropped old leave-related tables.');

        // Recreate the new tables
        await client.query(`
            CREATE TABLE institutional_leaves (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                target_classes JSONB NOT NULL DEFAULT '[]',
                is_entire_institution BOOLEAN NOT NULL DEFAULT false,
                created_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE leave_exceptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                institutional_leave_id UUID REFERENCES institutional_leaves(id) ON DELETE CASCADE,
                student_id VARCHAR(50) NOT NULL,
                UNIQUE(institutional_leave_id, student_id)
            );

            CREATE TABLE student_leaves (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id VARCHAR(50) NOT NULL,
                institutional_leave_id UUID REFERENCES institutional_leaves(id) ON DELETE SET NULL,
                leave_type VARCHAR(50) NOT NULL CHECK (leave_type IN ('institutional', 'out-campus', 'on-campus')),
                start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                end_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
                status VARCHAR(50) NOT NULL CHECK (status IN ('outside', 'returned', 'cancelled', 'pending', 'rejected')),
                actual_return_datetime TIMESTAMP WITH TIME ZONE,
                return_status VARCHAR(50) CHECK (return_status IN ('normal', 'late') OR return_status IS NULL),
                reason TEXT,
                created_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE student_movements (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id VARCHAR(50) NOT NULL,
                leave_id UUID REFERENCES student_leaves(id) ON DELETE CASCADE,
                direction VARCHAR(10) NOT NULL CHECK (direction IN ('out', 'in')),
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                is_late BOOLEAN DEFAULT false,
                recorded_by UUID,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Created new leave tables: institutional_leaves, leave_exceptions, student_leaves, student_movements.');

        console.log('--- MIGRATION COMPLETE ---');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

migrate();
