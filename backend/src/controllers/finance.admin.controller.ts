import { Request, Response } from 'express';
import { db } from '../config/db';

// ===== DASHBOARD & REPORTING =====
export const getFinanceDashboardData = async (req: Request, res: Response) => {
    try {
        const now = new Date()
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

        // 1. Get Monthly Fees metrics for current month
        const feesQuery = await db.query(
            `SELECT final_fee, paid_amount, status FROM monthly_fees WHERE month = $1`,
            [monthFirstDay]
        )

        const expected = feesQuery.rows.reduce((s, f) => s + Number(f.final_fee || 0), 0)
        const collected = feesQuery.rows.reduce((s, f) => s + Number(f.paid_amount || 0), 0)
        const pending = expected - collected

        // 2. Get Payments
        const paymentsQuery = await db.query(
            `SELECT amount, payment_method FROM payments WHERE created_at >= $1`,
            [monthFirstDay]
        )

        const cashCollected = paymentsQuery.rows.filter(p => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0)
        const upiCollected = paymentsQuery.rows.filter(p => p.payment_method === 'upi').reduce((s, p) => s + Number(p.amount), 0)
        const bankCollected = paymentsQuery.rows.filter(p => p.payment_method === 'bank').reduce((s, p) => s + Number(p.amount), 0)

        res.json({ success: true, expected, collected, pending, cashCollected, upiCollected, bankCollected })
    } catch (error: any) {
        console.error('Error fetching dashboard data:', error)
        res.status(500).json({ success: false, error: 'Failed to load metrics' })
    }
}

export const getPaymentFormData = async (req: Request, res: Response) => {
    try {
        const studentData = await db.query(
            `SELECT adm_no as id, adm_no as admission_number, name FROM students WHERE status = 'active' ORDER BY name`
        );
        const categoryData = await db.query(
            `SELECT id, name, is_active FROM charge_categories WHERE is_active = true`
        );
        const accountData = await db.query(
            `SELECT id, account_holder, account_type, is_active FROM payment_accounts WHERE is_active = true`
        );

        res.json({
            success: true,
            students: studentData.rows,
            categories: categoryData.rows,
            accounts: accountData.rows.map(a => ({ ...a, account_name: `${a.account_holder} (${a.account_type})` }))
        })
    } catch (error: any) {
        console.error('Error fetching form data:', error)
        res.status(500).json({ success: false, error: 'Failed to fetch form data' })
    }
}

// ===== SETTINGS ACTIONS =====

// Charge Categories
export const getChargeCategories = async (req: Request, res: Response) => {
    try {
        const result = await db.query('SELECT * FROM charge_categories ORDER BY name')
        res.json({ success: true, data: result.rows })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

export const addChargeCategory = async (req: Request, res: Response) => {
    try {
        const { name, description } = req.body;
        await db.query('INSERT INTO charge_categories (name, description) VALUES ($1, $2)', [name, description])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

export const toggleChargeCategory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db.query('UPDATE charge_categories SET is_active = $1 WHERE id = $2', [is_active, id])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

// Payment Accounts
export const getPaymentAccounts = async (req: Request, res: Response) => {
    try {
        const result = await db.query('SELECT * FROM payment_accounts ORDER BY account_holder')
        res.json({ success: true, data: result.rows })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

export const addPaymentAccount = async (req: Request, res: Response) => {
    try {
        const { account_holder, account_type, details } = req.body;
        await db.query('INSERT INTO payment_accounts (account_holder, account_type, details) VALUES ($1, $2, $3)', [account_holder, account_type, details])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

export const togglePaymentAccount = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db.query('UPDATE payment_accounts SET is_active = $1 WHERE id = $2', [is_active, id])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

// Fee Plans
export const addFeePlan = async (req: Request, res: Response) => {
    try {
        const { amount, effective_from, label } = req.body;
        await db.query('INSERT INTO fee_plans (amount, effective_from, label) VALUES ($1, $2, $3)', [amount, effective_from, label])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}

export const deleteFeePlan = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM fee_plans WHERE id = $1', [id])
        res.json({ success: true })
    } catch (error: any) { res.status(500).json({ success: false, error: error.message }) }
}
