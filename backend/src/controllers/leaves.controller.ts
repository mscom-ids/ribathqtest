import { Request, Response } from 'express';
import { db } from '../config/db';

export const getAllLeaves = async (req: Request, res: Response) => {
  try {
    const { status, type } = req.query;
    const user = (req as any).user;
    
    let query = `
      SELECT sl.*, s.name as student_name, s.school_standard, s.adm_no as student_adm_no
      FROM student_leaves sl
      JOIN students s ON sl.student_id = s.adm_no
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 1;

    // Based on role matching
    // If parent/student, only show their own leaves
    if (user.role === 'parent' || user.role === 'student') {
        const studentQuery = await db.query('SELECT id FROM students WHERE parent_id = $1', [user.id]);
        if(studentQuery.rows.length > 0) {
           query += ` AND sl.student_id = $${paramCount}`;
           params.push(studentQuery.rows[0].adm_no);
           paramCount++;
        }
    }

    if (status) {
      query += ` AND sl.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (type) {
        query += ` AND sl.type = $${paramCount}`;
        params.push(type);
        paramCount++;
    }
    
    // Support filtering by multiple students for attendance grids
    let studentIdsFilter = req.query.student_ids;
    if (studentIdsFilter && typeof studentIdsFilter === 'string') {
        const ids = studentIdsFilter.split(',');
        if (ids.length > 0) {
            const placeholders = ids.map((_, i) => `$${paramCount + i}`).join(',');
            query += ` AND sl.student_id IN (${placeholders})`;
            params.push(...ids);
            paramCount += ids.length;
        }
    }

    query += ' ORDER BY sl.created_at DESC';

    const result = await db.query(query, params);
    
    // Map the flat SQL results to the nested object format expected by the frontend
    const leaves = result.rows.map(row => {
        const { student_name, school_standard, student_adm_no, ...rest } = row;
        return {
            ...rest,
            student: {
                name: student_name,
                standard: school_standard || '',
                adm_no: student_adm_no
            }
        };
    });

    res.json({ success: true, leaves });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaves' });
  }
};

export const createLeaveRequest = async (req: Request, res: Response) => {
    try {
      const { student_id, student_ids, type, start_date, end_date, reason, status } = req.body;
      const user = (req as any).user;
      
      const targetStatus = status || 'pending';
      const targetIds = student_ids || (student_id ? [student_id] : []);

      if (targetIds.length === 0) {
          return res.status(400).json({ success: false, error: 'No students provided' });
      }

      const client = await db.getClient();
      try {
          await client.query('BEGIN');
          
          for (const s_id of targetIds) {
              await client.query(`
                INSERT INTO student_leaves (student_id, type, start_date, end_date, reason, status, user_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `, [s_id, type, start_date, end_date, reason, targetStatus, user.id]);
          }

          await client.query('COMMIT');
          res.status(201).json({ success: true, count: targetIds.length });
      } catch (e) {
          await client.query('ROLLBACK');
          throw e;
      } finally {
          client.release();
      }
    } catch (err) {
      console.error('Error creating leave:', err);
      res.status(500).json({ success: false, error: 'Failed to create leave request' });
    }
  };

export const updateLeaveStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const user = (req as any).user;

    const query = `
      UPDATE student_leaves 
      SET status = $1, resolution_notes = $2, resolved_by = $3, resolved_at = NOW()
      WHERE id = $4 
      RETURNING *
    `;

    const values = [status, resolution_notes || null, user.id, id];
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }

    res.json({ success: true, leave: result.rows[0] });
  } catch (err) {
    console.error('Error updating leave status:', err);
    res.status(500).json({ success: false, error: 'Failed to update leave request' });
  }
};

export const getEligibleStudents = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        let query = "SELECT adm_no, name, school_standard, hifz_standard, madrassa_standard FROM students WHERE status = 'active'";
        const params: any[] = [];
        let paramCount = 1;

        if (user.role === 'staff') {
            const staffRes = await db.query('SELECT id FROM staff WHERE profile_id = $1', [user.id]);
            if (staffRes.rows.length > 0) {
                query += ` AND assigned_usthad_id = $${paramCount}`;
                params.push(staffRes.rows[0].id);
                paramCount++;
            }
        } else if (user.role === 'parent' || user.role === 'student') {
            const parentRes = await db.query('SELECT parent_id FROM profiles WHERE id = $1', [user.id]);
            if (parentRes.rows.length > 0) {
               query += ` AND parent_id = $${paramCount}`;
               params.push(parentRes.rows[0].parent_id);
               paramCount++;
            }
        }

        query += " ORDER BY name";

        const result = await db.query(query, params);
        
        const students = result.rows.map(s => ({
            adm_no: s.adm_no,
            name: s.name,
            standard: s.school_standard || s.hifz_standard || s.madrassa_standard || "Common"
        }));

        res.json({ success: true, students });
    } catch (err) {
        console.error("Error fetching eligible students:", err);
        res.status(500).json({ success: false, error: "Failed to load students" });
    }
};

export const recordMovement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // leave ID
        const { direction, is_late, timestamp } = req.body;
        const user = (req as any).user;

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            const leaveRes = await client.query('SELECT student_id FROM student_leaves WHERE id = $1', [id]);
            if (leaveRes.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Leave not found' });
            }
            const student_id = leaveRes.rows[0].student_id;
            
            // 1. Record the movement audit log
            await client.query(`
                INSERT INTO student_movements (student_id, leave_id, direction, is_late, recorded_by)
                VALUES ($1, $2, $3, $4, $5)
            `, [student_id, id, direction, is_late, user.id]);

            // 2. Update the main leave record
            const newStatus = direction === 'exit' ? 'outside' : 'completed';
            let updateQuery = `UPDATE student_leaves SET status = $1, updated_at = $2`;
            const params: any[] = [newStatus, timestamp];
            
            if (direction === 'exit') {
                updateQuery += `, actual_exit_datetime = $3 WHERE id = $4`;
                params.push(timestamp, id);
            } else {
                updateQuery += `, actual_return_datetime = $3 WHERE id = $4`;
                params.push(timestamp, id);
            }

            const updateRes = await client.query(updateQuery, params);

            await client.query('COMMIT');
            if (updateRes.rows.length > 0) {
                res.json({ success: true, leave: updateRes.rows[0] });
            } else {
                res.json({ success: true });
            }
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error recording movement:', err);
        res.status(500).json({ success: false, error: 'Failed to record movement' });
    }
};
