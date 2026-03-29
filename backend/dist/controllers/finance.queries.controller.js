"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveStudents = exports.getMonthlyFeesForCurrentMonth = exports.searchStudentLedger = exports.addStudentCharge = void 0;
const db_1 = require("../config/db");
const addStudentCharge = async (req, res) => {
    try {
        const { student_id, category_id, amount, date, description } = req.body;
        await db_1.db.query('INSERT INTO student_charges (student_id, category_id, amount, date, description) VALUES ($1, $2, $3, $4, $5)', [student_id, category_id, amount, date, description || null]);
        res.json({ success: true, message: 'Charge added successfully.' });
    }
    catch (error) {
        console.error('Error adding charge:', error);
        res.status(500).json({ success: false, error: 'Failed to add charge' });
    }
};
exports.addStudentCharge = addStudentCharge;
const searchStudentLedger = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query)
            return res.json({ data: null });
        // 1. Search for student by name or admission number
        const studentQuery = await db_1.db.query(`SELECT adm_no, name FROM students WHERE status = 'active' AND (name ILIKE $1 OR adm_no ILIKE $1) LIMIT 1`, [`%${query}%`]);
        if (studentQuery.rows.length === 0)
            return res.json({ error: 'Student not found' });
        const student = studentQuery.rows[0];
        // 2. Get their monthly fees
        const monthlyFeesQuery = await db_1.db.query(`SELECT * FROM monthly_fees WHERE student_id = $1 ORDER BY month DESC`, [student.adm_no]);
        // 3. Get their additional charges
        const chargesQuery = await db_1.db.query(`SELECT sc.*, cc.name as category_name 
             FROM student_charges sc 
             LEFT JOIN charge_categories cc ON sc.category_id = cc.id 
             WHERE sc.student_id = $1 ORDER BY date DESC`, [student.adm_no]);
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
    }
    catch (error) {
        console.error('Error searching ledger:', error);
        res.status(500).json({ success: false, error: 'Failed to load student ledger' });
    }
};
exports.searchStudentLedger = searchStudentLedger;
const getMonthlyFeesForCurrentMonth = async (req, res) => {
    try {
        const now = new Date();
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const result = await db_1.db.query(`SELECT mf.*, s.name as student_name 
             FROM monthly_fees mf 
             LEFT JOIN students s ON mf.student_id = s.adm_no 
             WHERE mf.month = $1 ORDER BY mf.student_id ASC`, [monthFirstDay]);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        console.error('Error fetching monthly fees:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch monthly fees' });
    }
};
exports.getMonthlyFeesForCurrentMonth = getMonthlyFeesForCurrentMonth;
const getActiveStudents = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT s.adm_no, s.name, s.batch_year, s.standard, s.photo_url, s.dob as date_of_birth, s.status,
                    s.hifz_mentor_id, s.school_mentor_id, s.madrasa_mentor_id,
                    h.name as hifz_mentor_name, sc.name as school_mentor_name, m.name as madrasa_mentor_name
             FROM students s
             LEFT JOIN staff h ON s.hifz_mentor_id = h.id
             LEFT JOIN staff sc ON s.school_mentor_id = sc.id
             LEFT JOIN staff m ON s.madrasa_mentor_id = m.id
             WHERE s.status = 'active' ORDER BY s.adm_no ASC`);
        const formattedData = result.rows.map(row => ({
            ...row,
            hifz_mentor: row.hifz_mentor_name ? { name: row.hifz_mentor_name } : null,
            school_mentor: row.school_mentor_name ? { name: row.school_mentor_name } : null,
            madrasa_mentor: row.madrasa_mentor_name ? { name: row.madrasa_mentor_name } : null,
            // Kept for backward compatibility if any component hasn't migrated yet
            assigned_usthad: row.hifz_mentor_name ? { name: row.hifz_mentor_name } : null
        }));
        res.json({ success: true, data: formattedData });
    }
    catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};
exports.getActiveStudents = getActiveStudents;
