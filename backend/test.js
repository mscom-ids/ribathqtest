const { db } = require('./dist/config/db');
db.query("SELECT count(*) FROM attendance_schedules WHERE academic_year_id = '5366c88b-859e-498c-8a0e-9463ab354b17'").then(res => { console.log("Count:", res.rows[0]); process.exit(0); });
