const { db } = require('./backend/dist/config/db');
db.query(`SELECT pg_get_constraintdef(c.oid) as def FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid WHERE t.relname = 'student_leaves' AND c.contype = 'c'`)
  .then(r => { r.rows.forEach(x => console.log(x.def)); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
