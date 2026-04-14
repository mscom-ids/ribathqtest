const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://rqp_db:rqpadmindb@localhost:5432/rqp_db'
});

async function main() {
  try {
    await client.connect();
    console.log("Connected");
    const test1 = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'hifz_logs' AND column_name = 'student_id'`);
    console.log("hifz_logs.student_id type:", test1.rows);
    
    const test2 = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'adm_no'`);
    console.log("students.adm_no type:", test2.rows);
  } catch (err) {
    console.log(err);
  } finally {
    client.end();
  }
}
main();
