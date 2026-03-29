require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const c = new Client({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    
    console.log('--- FINDING LEAVE TABLES ---');
    const r = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name ILIKE '%leave%' OR table_name ILIKE '%movement%')`);
    const tables = r.rows.map(row => row.table_name);
    
    for (const t of tables) {
        console.log('');
        console.log('=== ' + t + ' ===');
        const r2 = await c.query('SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position', [t]);
        r2.rows.forEach(col => console.log('  ' + col.column_name + ' (' + col.data_type + ') nullable=' + col.is_nullable));
    }
    
    await c.end();
}
main().catch(console.error);
