const { db } = require('./dist/config/db');
db.query("SELECT id, name, effective_from, class_id FROM attendance_schedules WHERE academic_year_id = '5366c88b-859e-498c-8a0e-9463ab354b17' LIMIT 5").then(res => { console.log(res.rows); process.exit(0); });
