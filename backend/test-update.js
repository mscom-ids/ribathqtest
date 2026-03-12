require('dotenv').config();
const { Pool } = require('pg');

async function testUpdate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const updateData = {
    name: "TEST",
    dob: "2010-01-01",
    address: null,
    father_name: null,
    email: null,
    batch_year: null,
    standard: "Hifz",
    assigned_usthad_id: null,
    comprehensive_details: { basic: { nationality: "Other", country: "UAE" } }
  };
  
  const id = "R001";
  const keys = Object.keys(updateData);
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  for (const key of keys) {
    if (key === 'comprehensive_details') {
      setClauses.push(`${key} = COALESCE(students.${key}, '{}'::jsonb) || $${paramCount}::jsonb`);
    } else {
      setClauses.push(`${key} = $${paramCount}`);
    }
    values.push(updateData[key]);
    paramCount++;
  }
  values.push(id);
  
  const query = `
    UPDATE students 
    SET ${setClauses.join(', ')} 
    WHERE adm_no = $${paramCount} 
    RETURNING *
  `;
  
  console.log('Query:', query);
  console.log('Values:', values);
  
  try {
    const res = await pool.query(query, values);
    console.log('Success:', res.rows[0]);
  } catch(e) {
    console.error('SQL Error:', e.message);
  } finally {
    await pool.end();
  }
}

testUpdate();
