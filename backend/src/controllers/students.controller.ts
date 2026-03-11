import { Request, Response } from 'express';
import { db } from '../config/db';

export const getAllStudents = async (req: Request, res: Response) => {
  try {
    const { search, class: className, status } = req.query;
    
    let query = 'SELECT adm_no, name, dob, standard, batch_year, phone, email, father_name, mother_name, photo_url FROM students WHERE 1=1';
    const params: any[] = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR adm_no ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (className && className !== 'all') {
      // The schema only has a single "standard" column
      query += ` AND standard = $${paramCount}`;
      params.push(className);
      paramCount++;
    }

    // Since the schema doesn't have a 'status' column, we ignore the status filter for now
    // (If user wants status filtering later, they need to add 'status' to the students table)

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
    const studentData = req.body;
    
    // We explicitly list the columns to avoid SQL injection via object mapping
    const columns = ['adm_no', 'name', 'date_of_birth', 'gender', 'school_standard', 'hifz_standard', 'madrassa_standard', 'status', 'parent_name', 'parent_phone', 'address_line', 'assigned_usthad_id'];
    
    const values = [];
    const placeholders = [];
    const insertCols = [];
    
    let paramCount = 1;
    for (const col of columns) {
      if (studentData[col] !== undefined) {
        insertCols.push(col);
        values.push(studentData[col]);
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
      setClauses.push(`${key} = $${paramCount}`);
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
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ success: false, error: 'Failed to update student' });
  }
};
