const { Client } = require('pg');
require('dotenv').config();

const connString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';

async function main() {
    const c = new Client({ connectionString: connString, ssl: { rejectUnauthorized: false } });
    await c.connect();
    console.log('Connected.');

    const totStudents = await c.query("SELECT COUNT(*) FROM students");
    console.log(`Total students in DB: ${totStudents.rows[0].count}`);

    const uniqueStds = await c.query("SELECT DISTINCT standard FROM students");
    console.log('\n--- Unique values in students.standard ---');
    uniqueStds.rows.forEach(r => console.log(`Standard: "${r.standard}"`));

    const samples = await c.query("SELECT adm_no, name, standard, hifz_mentor_id, school_mentor_id, madrasa_mentor_id FROM students LIMIT 5");
    console.log('\n--- Sample students ---');
    samples.rows.forEach(r => {
        console.log(`Adm: ${r.adm_no} | Name: ${r.name} | Standard: "${r.standard}" | Mentors (Hifz: ${r.hifz_mentor_id}, School: ${r.school_mentor_id}, Madrasa: ${r.madrasa_mentor_id})`);
    });

    await c.end();
}

main().catch(console.error);
