import { Request, Response } from 'express';
import { db } from '../config/db';

// GET /api/parent/children — returns students whose parent_email matches logged-in user's email
export const getMyChildren = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user?.email) {
            return res.status(401).json({ success: false, error: 'Unauthorized: no email in token' });
        }

        // Students linked to this parent by email field
        const result = await db.query(
            `SELECT adm_no, name, photo_url, batch_year, standard, dob
             FROM students WHERE email = $1 ORDER BY name`,
            [user.email]
        );

        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching parent children:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch children' });
    }
};

// POST /api/parent/leaves — parent submits a leave request for their child
export const submitLeaveRequest = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { student_id, leave_type, start_datetime, end_datetime, reason, status } = req.body;

        if (!student_id || !leave_type || !start_datetime || !end_datetime) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Verify this student actually belongs to this parent
        const checkResult = await db.query(
            'SELECT adm_no FROM students WHERE adm_no = $1 AND email = $2',
            [student_id, user.email]
        );

        if (checkResult.rows.length === 0) {
            return res.status(403).json({ success: false, error: 'Not authorized to submit leave for this student' });
        }

        const result = await db.query(
            `INSERT INTO student_leaves (student_id, leave_type, start_datetime, end_datetime, reason, status)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [student_id, leave_type, start_datetime, end_datetime, reason || null, status || 'pending']
        );

        res.json({ success: true, leave: result.rows[0] });
    } catch (err) {
        console.error('Error submitting leave request:', err);
        res.status(500).json({ success: false, error: 'Failed to submit leave request' });
    }
};
