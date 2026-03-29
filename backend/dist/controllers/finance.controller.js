"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPayment = exports.getStudentLedger = exports.getFeePlans = void 0;
const db_1 = require("../config/db");
const getFeePlans = async (req, res) => {
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM fee_plans WHERE 1=1';
        const params = [];
        if (status) {
            query += ' AND is_active = $1';
            params.push(status === 'active');
        }
        query += ' ORDER BY created_at DESC';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, feePlans: result.rows });
    }
    catch (err) {
        console.error('Error fetching fee plans:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch fee plans' });
    }
};
exports.getFeePlans = getFeePlans;
const getStudentLedger = async (req, res) => {
    try {
        const { student_id } = req.params;
        // Get all fee records for the student
        const feeRecordsQuery = `
      SELECT id, student_id, type, amount, status, due_date, created_at, month, year, amount_paid, fee_plan_id 
      FROM fees 
      WHERE student_id = $1 
      ORDER BY due_date DESC
    `;
        const feeRecords = await db_1.db.query(feeRecordsQuery, [student_id]);
        // Get all actual payments made
        const paymentsQuery = `
      SELECT id, student_id, amount, payment_method, reference_number, notes, status, created_at, fee_id
      FROM fee_payments
      WHERE student_id = $1
      ORDER BY created_at DESC
    `;
        const payments = await db_1.db.query(paymentsQuery, [student_id]);
        res.json({
            success: true,
            ledger: {
                fees: feeRecords.rows,
                payments: payments.rows
            }
        });
    }
    catch (err) {
        console.error('Error fetching student ledger:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch student ledger' });
    }
};
exports.getStudentLedger = getStudentLedger;
const recordPayment = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        await client.query('BEGIN'); // Start Transaction
        const { student_id, fee_id, amount, payment_method, reference_number, notes } = req.body;
        const user = req.user;
        // 1. Insert into fee_payments
        const insertPaymentQuery = `
      INSERT INTO fee_payments (student_id, fee_id, amount, payment_method, reference_number, notes, status, processed_by)
      VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)
      RETURNING *
    `;
        const paymentValues = [student_id, fee_id, amount, payment_method, reference_number, notes, user.id];
        const paymentResult = await client.query(insertPaymentQuery, paymentValues);
        // 2. If fee_id is provided, update the specific fee record
        if (fee_id) {
            // First check current amount paid
            const feeCheck = await client.query('SELECT amount, amount_paid FROM fees WHERE id = $1', [fee_id]);
            if (feeCheck.rows.length > 0) {
                const fee = feeCheck.rows[0];
                const newAmountPaid = Number(fee.amount_paid || 0) + Number(amount);
                const newStatus = newAmountPaid >= Number(fee.amount) ? 'paid' : 'partial';
                await client.query(`UPDATE fees SET amount_paid = $1, status = $2 WHERE id = $3`, [newAmountPaid, newStatus, fee_id]);
            }
        }
        await client.query('COMMIT'); // Commit Transaction
        res.status(201).json({ success: true, payment: paymentResult.rows[0] });
    }
    catch (err) {
        await client.query('ROLLBACK'); // Rollback on error
        console.error('Error recording payment:', err);
        res.status(500).json({ success: false, error: 'Failed to record payment' });
    }
    finally {
        client.release();
    }
};
exports.recordPayment = recordPayment;
