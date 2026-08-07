import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { attachFinanceActor, rejectFinanceDelegation } from '../modules/finance/finance.auth';
import {
    financeErrorHandler, getAccounts, getActiveStudents, getCategories, getCurrentMonthlyFees,
    getDashboard, getFeeSchedulesCompatibility, getLedgerCompatibility, getPaymentFormData,
    getWorkspace, getAccount, postAccount, postCategory, postCharge, postFeeSchedule,
    postMonthlyGenerateCompatibility, postMonthlyPreview, postMonthlyPublish, postOpeningBalances,
    postPayment, postPaymentReverse, postObligationVoid, postPermission, postStudentAgreement, putAccountToggle, putCategoryToggle,
    putPermissionRevoke, rejectFeeScheduleDelete, rejectMonthlyDelete, searchLedgerCompatibility,
} from '../modules/finance/finance.controller';

const router = Router();
router.use(verifyToken);
router.use(attachFinanceActor);

router.get('/workspace', getWorkspace);
router.get('/students/:studentId/account', getAccount);

router.post('/charges', rejectFinanceDelegation, postCharge);
router.post('/payments', rejectFinanceDelegation, postPayment);
router.post('/payments/:id/reverse', rejectFinanceDelegation, postPaymentReverse);
router.post('/obligations/:id/void', rejectFinanceDelegation, postObligationVoid);
router.post('/opening-balances', rejectFinanceDelegation, postOpeningBalances);
router.post('/monthly-fees/preview', rejectFinanceDelegation, postMonthlyPreview);
router.post('/monthly-fees/publish', rejectFinanceDelegation, postMonthlyPublish);
router.post('/fee-schedules', rejectFinanceDelegation, postFeeSchedule);
router.post('/student-fee-agreements', rejectFinanceDelegation, postStudentAgreement);
router.post('/permissions', rejectFinanceDelegation, postPermission);
router.put('/permissions/:id/revoke', rejectFinanceDelegation, putPermissionRevoke);

router.get('/categories', getCategories);
router.post('/categories', rejectFinanceDelegation, postCategory);
router.put('/categories/:id/toggle', rejectFinanceDelegation, putCategoryToggle);
router.get('/accounts', getAccounts);
router.post('/accounts', rejectFinanceDelegation, postAccount);
router.put('/accounts/:id/toggle', rejectFinanceDelegation, putAccountToggle);

router.get('/dashboard', getDashboard);
router.get('/active-students', getActiveStudents);
router.get('/payment-form-data', getPaymentFormData);
router.get('/monthly-fees/current', getCurrentMonthlyFees);
router.post('/monthly-fees/generate', rejectFinanceDelegation, postMonthlyGenerateCompatibility);
router.delete('/monthly-fees/:yearMonth', rejectFinanceDelegation, rejectMonthlyDelete);
router.get('/ledger/:student_id', getLedgerCompatibility);
router.get('/ledger-search', searchLedgerCompatibility);
router.get('/fee-plans', getFeeSchedulesCompatibility);
router.post('/fee-plans', rejectFinanceDelegation, postFeeSchedule);
router.delete('/fee-plans/:id', rejectFinanceDelegation, rejectFeeScheduleDelete);

router.use(financeErrorHandler);
export default router;