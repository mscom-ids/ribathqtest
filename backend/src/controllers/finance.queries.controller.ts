import { Request, Response } from 'express';
import { db } from '../config/db';

export const addStudentCharge = async (req: Request, res: Response) => {
    try {
        const { student_id, category_id, amount, date, description } = req.body;
        await db.query(
            'INSERT INTO student_charges (student_id, category_id, amount, date, description) VALUES ($1, $2, $3, $4, $5)',
            [student_id, category_id, amount, date, description || null]
        );
        res.json({ success: true, message: 'Charge added successfully.' });
    } catch (error: any) {
        console.error('Error adding charge:', error);
        res.status(500).json({ success: false, error: 'Failed to add charge' });
    }
};

export const searchStudentLedger = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;
        if (!query) return res.json({ data: null });

        // 1. Search for student by name or admission number
        const studentQuery = await db.query(
            `SELECT adm_no, name FROM students WHERE status = 'active' AND (name ILIKE $1 OR adm_no ILIKE $1) LIMIT 1`,
            [`%${query}%`]
        );
        
        if (studentQuery.rows.length === 0) return res.json({ error: 'Student not found' });
        const student = studentQuery.rows[0];

        // 2. Get their monthly fees
        const monthlyFeesQuery = await db.query(
            `SELECT * FROM monthly_fees WHERE student_id = $1 ORDER BY month DESC`,
            [student.adm_no]
        );

        // 3. Get their additional charges
        const chargesQuery = await db.query(
            `SELECT sc.*, cc.name as category_name 
             FROM student_charges sc 
             LEFT JOIN charge_categories cc ON sc.category_id = cc.id 
             WHERE sc.student_id = $1 ORDER BY date DESC`,
            [student.adm_no]
        );

        // 4. Combine into a unified ledger timeline
        const ledger = [
            ...monthlyFeesQuery.rows.map(f => {
                const fDate = new Date(f.month);
                return {
                    id: f.id,
                    date: f.month,
                    description: `Monthly Fee - ${fDate.toLocaleString('default', { month: 'long' })} ${fDate.getFullYear()}`,
                    amount: f.final_fee,
                    paid: f.paid_amount || 0,
                    status: f.status,
                    type: 'monthly_fee'
                };
            }),
            ...chargesQuery.rows.map(c => ({
                id: c.id,
                date: c.date,
                description: c.category_name || c.description || 'Additional Charge',
                amount: c.amount,
                paid: c.paid_amount || 0,
                status: c.status,
                type: 'charge'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalPending = ledger.reduce((sum, item) => sum + (item.amount - item.paid), 0);

        res.json({
            success: true,
            data: { student, ledger, totalPending }
        });

    } catch (error: any) {
        console.error('Error searching ledger:', error);
        res.status(500).json({ success: false, error: 'Failed to load student ledger' });
    }
};

export const getMonthlyFeesForCurrentMonth = async (req: Request, res: Response) => {
    try {
        const now = new Date();
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        
        const result = await db.query(
            `SELECT mf.*, s.name as student_name 
             FROM monthly_fees mf 
             LEFT JOIN students s ON mf.student_id = s.adm_no 
             WHERE mf.month = $1 ORDER BY mf.student_id ASC`,
            [monthFirstDay]
        );

        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching monthly fees:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch monthly fees' });
    }
};

export const getActiveStudents = async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT adm_no, name, batch_year, standard, photo_url, dob as date_of_birth, status 
             FROM students WHERE status = 'active' ORDER BY adm_no ASC`
        );
        res.json({ success: true, data: result.rows });
    } catch (error: any) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};
