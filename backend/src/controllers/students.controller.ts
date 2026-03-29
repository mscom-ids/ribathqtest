import { Request, Response } from 'express';
import { db } from '../config/db';

export const getAllStudents = async (req: Request, res: Response) => {
  try {
    const { search, class: className, status } = req.query;
    
    let query = 'SELECT adm_no, name, dob, standard, batch_year, phone, email, father_name, photo_url, status, address, comprehensive_details, hifz_mentor_id, school_mentor_id, madrasa_mentor_id FROM students WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR adm_no ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (className && className !== 'all') {
      query += ` AND standard = $${paramCount}`;
      params.push(className);
      paramCount++;
    }

    if (status) {
      if (status === 'alumni') {
         query += ` AND status IN ('completed', 'dropout', 'stopped', 'higher_education')`;
      } else if (status !== 'all') {
         query += ` AND status = $${paramCount}`;
         params.push(status);
         paramCount++;
      }
    } else {
      query += ` AND status = 'active'`;
    }

    query += ' ORDER BY name ASC';

    const result = await db.query(query, params);
    res.json({ success: true, students: result.rows });

  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM students WHERE adm_no = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    res.json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch student' });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    // Map the incoming frontend fields to the actual database columns.
    // Ensure we handle both legacy/frontend keys AND verbatim backend keys just in case.
    const mappedStudent = {
      adm_no: data.admission_number || data.adm_no,
      name: data.full_name || data.name,
      dob: data.date_of_birth || data.dob,
      address: data.address_line || data.address,
      father_name: data.parent_name || data.father_name,
      phone: data.parent_phone || data.phone,
      email: data.email,
      batch_year: data.batch_year,
      standard: data.class || data.standard,
      hifz_mentor_id: data.hifz_mentor_id === "unassigned" ? null : data.hifz_mentor_id,
      school_mentor_id: data.school_mentor_id === "unassigned" ? null : data.school_mentor_id,
      madrasa_mentor_id: data.madrasa_mentor_id === "unassigned" ? null : data.madrasa_mentor_id,
      photo_url: data.photo_url,
      status: data.status || 'active',
      comprehensive_details: data.comprehensive_details || {}
    };
    
    // We explicitly list the columns to avoid SQL injection
    const validColumns = [
      'adm_no', 'name', 'dob', 'address', 'father_name', 'phone', 
      'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id', 
      'photo_url', 'status', 'comprehensive_details'
    ];
    
    const values: any[] = [];
    const placeholders: string[] = [];
    const insertCols: string[] = [];
    
    let paramCount = 1;
    for (const col of validColumns) {
      // Use standard Object mapping, allowing nulls but excluding undefined mapping
      if (mappedStudent[col as keyof typeof mappedStudent] !== undefined) {
        insertCols.push(col);
        values.push(mappedStudent[col as keyof typeof mappedStudent]);
        placeholders.push(`$${paramCount}`);
        paramCount++;
      }
    }

    const query = `
      INSERT INTO students (${insertCols.join(', ')}) 
      VALUES (${placeholders.join(', ')}) 
      RETURNING *
    `;

    const result = await db.query(query, values);
    
    res.status(201).json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ success: false, error: 'Failed to create student' });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Student ID is required' });
    }
    const updateData = req.body;
    
    // Safety check - don't allow updating ID
    delete updateData.id;
    
    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      return res.status(400).json({ success: false, error: 'No data provided for update' });
    }

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const key of keys) {
      if (key === 'comprehensive_details') {
        // Deep merge the new JSON inside Postgres so we don't accidentally overwrite other saved tabs
        setClauses.push(`${key} = COALESCE(students.${key}, '{}'::jsonb) || $${paramCount}::jsonb`);
      } else {
        setClauses.push(`${key} = $${paramCount}`);
      }
      values.push(updateData[key]);
      paramCount++;
    }

    // Add exactly one more parameter for the ID
    values.push(id);
    
    const query = `
      UPDATE students 
      SET ${setClauses.join(', ')} 
      WHERE adm_no = $${paramCount} 
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    res.json({ success: true, student: result.rows[0] });
  } catch (err: any) {
    console.error('Error updating student:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update student' });
  }
};
