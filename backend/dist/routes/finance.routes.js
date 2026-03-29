"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const finance_controller_1 = require("../controllers/finance.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Protect all finance routes
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'controller']));
// GET /api/finance/fee-plans
router.get('/fee-plans', finance_controller_1.getFeePlans);
// GET /api/finance/ledger/:student_id
router.get('/ledger/:student_id', finance_controller_1.getStudentLedger);
// POST /api/finance/payments
router.post('/payments', finance_controller_1.recordPayment);
// Implemented from financeActions
const finance_actions_1_1 = require("../controllers/finance.actions.1");
const finance_admin_controller_1 = require("../controllers/finance.admin.controller");
const finance_queries_controller_1 = require("../controllers/finance.queries.controller");
// Dashboard
router.get('/dashboard', finance_admin_controller_1.getFinanceDashboardData);
// Monthly Fees
router.post('/monthly-fees/generate', finance_actions_1_1.generateMonthlyFees);
router.delete('/monthly-fees/:yearMonth', finance_actions_1_1.deleteMonthlyFeesForMonth);
router.get('/monthly-fees/current', finance_queries_controller_1.getMonthlyFeesForCurrentMonth);
// Charges & Ledger
router.post('/charges', finance_queries_controller_1.addStudentCharge);
router.get('/ledger-search', finance_queries_controller_1.searchStudentLedger);
// Settings - Categories
router.get('/categories', finance_admin_controller_1.getChargeCategories);
router.post('/categories', finance_admin_controller_1.addChargeCategory);
router.put('/categories/:id/toggle', finance_admin_controller_1.toggleChargeCategory);
// Settings - Accounts
router.get('/accounts', finance_admin_controller_1.getPaymentAccounts);
router.post('/accounts', finance_admin_controller_1.addPaymentAccount);
router.put('/accounts/:id/toggle', finance_admin_controller_1.togglePaymentAccount);
// Settings - Fee Plans
router.post('/fee-plans', finance_admin_controller_1.addFeePlan);
router.delete('/fee-plans/:id', finance_admin_controller_1.deleteFeePlan);
// Helper queries
router.get('/active-students', finance_queries_controller_1.getActiveStudents);
router.get('/payment-form-data', finance_admin_controller_1.getPaymentFormData);
exports.default = router;
