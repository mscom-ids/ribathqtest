const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        // Check how many students have hifz_standard set
        const hifzStudents = await pool.query(`
            SELECT adm_no, name, status, hifz_standard, school_standard, madrassa_standard
            FROM students 
            WHERE status = 'active'
            LIMIT 10;
        `);
        console.log("ACTIVE STUDENTS (first 10):");
        hifzStudents.rows.forEach(r => console.log("  ", r.adm_no, r.name, "hifz:", r.hifz_standard, "school:", r.school_standard, "madrassa:", r.madrassa_standard));

        const hifzCount = await pool.query(`
            SELECT COUNT(*) as cnt FROM students WHERE status = 'active' AND hifz_standard IS NOT NULL;
        `);
        console.log("\nStudents with hifz_standard NOT NULL:", hifzCount.rows[0].cnt);

        const totalActive = await pool.query(`
            SELECT COUNT(*) as cnt FROM students WHERE status = 'active';
        `);
        console.log("Total active students:", totalActive.rows[0].cnt);

    } catch (e) {
        console.error("DB Error:", e.message);
    } finally {
        pool.end();
    }
}

run();
