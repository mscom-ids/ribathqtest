import { Request, Response } from 'express';
import { db } from '../config/db';

export const getNextStudentId = async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT adm_no FROM students ORDER BY created_at DESC LIMIT 1`
        );
        let nextId = "R001";
        if (result.rows.length > 0 && result.rows[0].adm_no?.startsWith("R")) {
            const num = parseInt(result.rows[0].adm_no.substring(1));
            if (!isNaN(num)) {
                nextId = `R${String(num + 1).padStart(3, '0')}`;
            }
        }
        res.json({ success: true, nextId });
    } catch (err) {
        console.error('Error fetching next student id:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getStaff = async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT id, name FROM profiles WHERE role IN ('staff', 'vice_principal') ORDER BY name`
        );
        res.json({ success: true, staff: result.rows });
    } catch (err) {
        console.error('Error fetching staff:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
