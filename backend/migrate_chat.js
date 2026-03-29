const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Conversations table
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_conversations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type VARCHAR(10) NOT NULL CHECK (type IN ('private', 'group')),
                name VARCHAR(255),
                created_by UUID REFERENCES staff(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ chat_conversations created');

        // 2. Participants table
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_participants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
                staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
                last_read_at TIMESTAMPTZ DEFAULT NOW(),
                joined_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(conversation_id, staff_id)
            )
        `);
        console.log('✅ chat_participants created');

        // 3. Messages table
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
                sender_id UUID REFERENCES staff(id),
                content TEXT,
                image_url VARCHAR(500),
                is_deleted BOOLEAN DEFAULT FALSE,
                deleted_by UUID REFERENCES staff(id),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ chat_messages created');

        // 4. Indexes
        await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at DESC)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_participants_staff ON chat_participants(staff_id)`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_chat_participants_conv ON chat_participants(conversation_id)`);
        console.log('✅ Indexes created');

        await client.query('COMMIT');
        console.log('✅ Migration complete!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
