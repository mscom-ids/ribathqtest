"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFeePlan = exports.addFeePlan = exports.togglePaymentAccount = exports.addPaymentAccount = exports.getPaymentAccounts = exports.toggleChargeCategory = exports.addChargeCategory = exports.getChargeCategories = exports.getPaymentFormData = exports.getFinanceDashboardData = void 0;
const db_1 = require("../config/db");
// ===== DASHBOARD & REPORTING =====
const getFinanceDashboardData = async (req, res) => {
    try {
        const now = new Date();
        const monthFirstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        // 1. Get Monthly Fees metrics for current month
        const feesQuery = await db_1.db.query(`SELECT final_fee, paid_amount, status FROM monthly_fees WHERE month = $1`, [monthFirstDay]);
        const expected = feesQuery.rows.reduce((s, f) => s + Number(f.final_fee || 0), 0);
        const collected = feesQuery.rows.reduce((s, f) => s + Number(f.paid_amount || 0), 0);
        const pending = expected - collected;
        // 2. Get Payments
        const paymentsQuery = await db_1.db.query(`SELECT amount, payment_method FROM payments WHERE created_at >= $1`, [monthFirstDay]);
        const cashCollected = paymentsQuery.rows.filter(p => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
        const upiCollected = paymentsQuery.rows.filter(p => p.payment_method === 'upi').reduce((s, p) => s + Number(p.amount), 0);
        const bankCollected = paymentsQuery.rows.filter(p => p.payment_method === 'bank').reduce((s, p) => s + Number(p.amount), 0);
        res.json({ success: true, expected, collected, pending, cashCollected, upiCollected, bankCollected });
    }
    catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ success: false, error: 'Failed to load metrics' });
    }
};
exports.getFinanceDashboardData = getFinanceDashboardData;
const getPaymentFormData = async (req, res) => {
    try {
        const studentData = await db_1.db.query(`SELECT adm_no as id, adm_no as admission_number, name FROM students WHERE status = 'active' ORDER BY name`);
        const categoryData = await db_1.db.query(`SELECT id, name, is_active FROM charge_categories WHERE is_active = true`);
        const accountData = await db_1.db.query(`SELECT id, account_holder, account_type, is_active FROM payment_accounts WHERE is_active = true`);
        res.json({
            success: true,
            students: studentData.rows,
            categories: categoryData.rows,
            accounts: accountData.rows.map(a => ({ ...a, account_name: `${a.account_holder} (${a.account_type})` }))
        });
    }
    catch (error) {
        console.error('Error fetching form data:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch form data' });
    }
};
exports.getPaymentFormData = getPaymentFormData;
// ===== SETTINGS ACTIONS =====
// Charge Categories
const getChargeCategories = async (req, res) => {
    try {
        const result = await db_1.db.query('SELECT * FROM charge_categories ORDER BY name');
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getChargeCategories = getChargeCategories;
const addChargeCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        await db_1.db.query('INSERT INTO charge_categories (name, description) VALUES ($1, $2)', [name, description]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.addChargeCategory = addChargeCategory;
const toggleChargeCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db_1.db.query('UPDATE charge_categories SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.toggleChargeCategory = toggleChargeCategory;
// Payment Accounts
const getPaymentAccounts = async (req, res) => {
    try {
        const result = await db_1.db.query('SELECT * FROM payment_accounts ORDER BY account_holder');
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getPaymentAccounts = getPaymentAccounts;
const addPaymentAccount = async (req, res) => {
    try {
        const { account_holder, account_type, details } = req.body;
        await db_1.db.query('INSERT INTO payment_accounts (account_holder, account_type, details) VALUES ($1, $2, $3)', [account_holder, account_type, details]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.addPaymentAccount = addPaymentAccount;
const togglePaymentAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await db_1.db.query('UPDATE payment_accounts SET is_active = $1 WHERE id = $2', [is_active, id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.togglePaymentAccount = togglePaymentAccount;
// Fee Plans
const addFeePlan = async (req, res) => {
    try {
        const { amount, effective_from, label } = req.body;
        await db_1.db.query('INSERT INTO fee_plans (amount, effective_from, label) VALUES ($1, $2, $3)', [amount, effective_from, label]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.addFeePlan = addFeePlan;
const deleteFeePlan = async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.db.query('DELETE FROM fee_plans WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.deleteFeePlan = deleteFeePlan;
