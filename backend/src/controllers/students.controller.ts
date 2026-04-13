import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { db } from '../config/db';

export const getAllStudents = async (req: Request, res: Response) => {
  try {
    const { search, class: className, status } = req.query;
    
    let query = 'SELECT adm_no, name, dob, standard, batch_year, phone, email, father_name, photo_url, status, address, gender, admission_date, nationality, pincode, post, district, state, place, local_body, aadhar, id_mark, comprehensive_details, hifz_mentor_id, school_mentor_id, madrasa_mentor_id, phone_number FROM students WHERE 1=1';
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

    // Check if student is currently outside (has active leave)
    const leaveRes = await db.query(
      `SELECT id FROM student_leaves WHERE student_id = $1 AND status = 'outside' LIMIT 1`,
      [id]
    );
    const is_outside = leaveRes.rows.length > 0;
    
    res.json({ success: true, student: { ...result.rows[0], is_outside } });
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
      comprehensive_details: data.comprehensive_details || {},
      gender: data.gender,
      admission_date: data.admission_date || data.date_of_join,
      nationality: data.nationality || 'Indian',
      pincode: data.pincode,
      post: data.post,
      district: data.district,
      state: data.state,
      place: data.place,
      local_body: data.local_body,
      aadhar: data.aadhar,
      id_mark: data.id_mark,
      country: data.country,
    };

    // We explicitly list the columns to avoid SQL injection
    const validColumns = [
      'adm_no', 'name', 'dob', 'address', 'father_name', 'phone',
      'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
      'photo_url', 'status', 'comprehensive_details',
      'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
      'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
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
    console.log('[updateStudent] id:', id, 'keys:', Object.keys(updateData));

    // Safety check - don't allow updating ID
    delete updateData.id;

    // Map legacy/frontend fields to db fields if they exist
    if ('assigned_usthad_id' in updateData) {
      updateData.hifz_mentor_id = updateData.assigned_usthad_id;
      delete updateData.assigned_usthad_id;
    }

    const validColumns = [
      'name', 'dob', 'address', 'father_name', 'phone',
      'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
      'photo_url', 'status', 'comprehensive_details',
      'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
      'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
    ];

    const keysToUpdate = Object.keys(updateData).filter(key => validColumns.includes(key));

    if (keysToUpdate.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid data provided for update' });
    }

    const setClauses = [];
    const values = [];
    let paramCount = 1;

    for (const key of keysToUpdate) {
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
    // Surface the PostgreSQL error detail so it's easier to diagnose (e.g. missing column)
    const detail = err.detail || err.hint || '';
    res.status(500).json({ success: false, error: `${err.message || 'Failed to update student'}${detail ? ` — ${detail}` : ''}` });
  }
};

// ── Export students as JSON ────────────────────────────────────
export const exportStudents = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT adm_no, name, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`
    );
    const data = result.rows.map((s: any) => ({
      rollNo: s.adm_no,
      name: s.name,
      phoneNumber: s.phone_number || ''
    }));
    res.json({ success: true, students: data });
  } catch (err) {
    console.error('Error exporting students:', err);
    res.status(500).json({ success: false, error: 'Failed to export students' });
  }
};

// ── Download students as Excel (.xlsx) ────────────────────────
export const downloadStudentsExcel = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT adm_no, name, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`
    );

    const rows = result.rows.map((s: any, i: number) => ({
      'S.No': i + 1,
      'Roll No': s.adm_no,
      'Student Name': s.name,
      'Phone Number': s.phone_number || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Error generating Excel:', err);
    res.status(500).json({ success: false, error: 'Failed to generate Excel file' });
  }
};
