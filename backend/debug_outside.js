require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    
    // Simulate options
    const options = {
        academicYearId: '47fc6ed9-75fa-4c40-965a-8b8243be44cb', // Just guessing or I'll get it from a query
        department: 'hifz',
        standard: '7th',
        division: 'C',
        startDate: '2026-07-01',
        endDate: '2026-07-15'
    };

    const studentLeavesResult = await client.query(`
        SELECT student_id, start_datetime, COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) as effective_end_datetime 
        FROM student_leaves 
        WHERE status = 'outside' 
        AND start_datetime < ($2::date + 1) 
        AND COALESCE(actual_return_datetime, end_datetime, 'infinity'::timestamptz) >= $1::date
    `, [options.startDate, options.endDate]);
    
    console.log("Outside leaves found:", studentLeavesResult.rows.length);
    if (studentLeavesResult.rows.length > 0) {
        console.log("First leave:", studentLeavesResult.rows[0]);
    }
    
    await client.end();
}

run().catch(console.error);
