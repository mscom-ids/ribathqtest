"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMonthlyFeesForMonth = exports.generateMonthlyFees = void 0;
const db_1 = require("../config/db");
const generateMonthlyFees = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT adm_no, custom_monthly_fee FROM students WHERE status = 'active'`);
        const students = result.rows;
        if (students.length === 0) {
            return res.json({ success: false, error: 'No active students found' });
        }
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const feePlanResult = await db_1.db.query(`SELECT amount FROM fee_plans WHERE effective_from <= $1 ORDER BY effective_from DESC LIMIT 1`, [today]);
        if (feePlanResult.rows.length === 0) {
            return res.json({ success: false, error: 'No fee plan found.' });
        }
        const defaultFee = Number(feePlanResult.rows[0].amount);
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const existingFeesResult = await db_1.db.query(`SELECT student_id FROM monthly_fees WHERE month = $1`, [monthFirstDay]);
        const existingStudentIds = new Set(existingFeesResult.rows.map(f => f.student_id));
        const studentsToBill = students.filter(s => !existingStudentIds.has(s.adm_no));
        if (studentsToBill.length === 0) {
            return res.json({ success: true, message: 'Fees already generated for all active students this month.' });
        }
        const feesToInsert = studentsToBill.map(student => {
            const baseFee = student.custom_monthly_fee ? Number(student.custom_monthly_fee) : defaultFee;
            return [student.adm_no, monthFirstDay, baseFee, baseFee, baseFee, 'pending'];
        });
        // Bulk insert
        const insertValues = feesToInsert.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ');
        const flatValues = feesToInsert.flat();
        await db_1.db.query(`INSERT INTO monthly_fees (student_id, month, base_fee, final_fee, balance, status) VALUES ${insertValues}`, flatValues);
        res.json({ success: true, message: `Successfully generated fees for ${feesToInsert.length} students.` });
    }
    catch (error) {
        console.error('Error generating monthly fees:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to generate monthly fees' });
    }
};
exports.generateMonthlyFees = generateMonthlyFees;
const deleteMonthlyFeesForMonth = async (req, res) => {
    try {
        const { yearMonth } = req.params;
        const now = new Date();
        const ym = yearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [y, m] = String(ym).split('-');
        const targetMonth = `${y}-${m}-01`;
        const result = await db_1.db.query(`DELETE FROM monthly_fees WHERE month = $1 AND status IN ('pending', 'partial') RETURNING id`, [targetMonth]);
        res.json({ success: true, message: `Deleted ${result.rows.length} fee records for ${ym}.` });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteMonthlyFeesForMonth = deleteMonthlyFeesForMonth;
