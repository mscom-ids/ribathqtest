import { Router } from 'express';
import { getFeePlans, getStudentLedger, recordPayment } from '../controllers/finance.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Protect all finance routes
router.use(verifyToken);
router.use(requireRole(['admin', 'principal', 'controller']));

// GET /api/finance/fee-plans
router.get('/fee-plans', getFeePlans);
// GET /api/finance/ledger/:student_id
router.get('/ledger/:student_id', getStudentLedger);
// POST /api/finance/payments
router.post('/payments', recordPayment);

// Implemented from financeActions
import { generateMonthlyFees, deleteMonthlyFeesForMonth } from '../controllers/finance.actions.1';
import { getFinanceDashboardData, getPaymentFormData, getChargeCategories, addChargeCategory, toggleChargeCategory, getPaymentAccounts, addPaymentAccount, togglePaymentAccount, addFeePlan, deleteFeePlan } from '../controllers/finance.admin.controller';
import { addStudentCharge, searchStudentLedger, getMonthlyFeesForCurrentMonth, getActiveStudents } from '../controllers/finance.queries.controller';

// Dashboard
router.get('/dashboard', getFinanceDashboardData);

// Monthly Fees
router.post('/monthly-fees/generate', generateMonthlyFees);
router.delete('/monthly-fees/:yearMonth', deleteMonthlyFeesForMonth);
router.get('/monthly-fees/current', getMonthlyFeesForCurrentMonth);

// Charges & Ledger
router.post('/charges', addStudentCharge);
router.get('/ledger-search', searchStudentLedger);

// Settings - Categories
router.get('/categories', getChargeCategories);
router.post('/categories', addChargeCategory);
router.put('/categories/:id/toggle', toggleChargeCategory);

// Settings - Accounts
router.get('/accounts', getPaymentAccounts);
router.post('/accounts', addPaymentAccount);
router.put('/accounts/:id/toggle', togglePaymentAccount);

// Settings - Fee Plans
router.post('/fee-plans', addFeePlan);
router.delete('/fee-plans/:id', deleteFeePlan);

// Helper queries
router.get('/active-students', getActiveStudents);
router.get('/payment-form-data', getPaymentFormData);

export default router;
