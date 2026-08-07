import { NextFunction, Request, Response } from 'express';
import { db } from '../../config/db';
import { requireFinanceManager } from './finance.auth';
import { generateCurrentMonthlyFees, previewMonthlyFees, publishMonthlyFees } from './finance.billing';
import {
    activeStudents,
    addOpeningBalances,
    createAccount,
    createCategory,
    createCharge,
    createFeeSchedule,
    createStudentFeeAgreement,
    currentMonthlyFees,
    financeDashboard,
    getStudentAccount,
    grantPermissions,
    listAccounts,
    listCategories,
    recordPayment,
    reversePayment,
    requestActor,
    revokePermission,
    toggleAccount,
    toggleCategory,
    voidObligation,
    workspace,
} from './finance.service';
import { FinanceError } from './finance.types';
import { requiredText } from './finance.validation';

type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;

export function financeHandler(handler: AsyncHandler) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try { await handler(req, res); } catch (error) { next(error); }
    };
}

export function financeErrorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
    if (error instanceof FinanceError) {
        return res.status(error.status).json({ success: false, error: error.message, code: error.code, details: error.details });
    }
    if (error instanceof Error) {
        console.error('[FINANCE]', error);
        return res.status(500).json({ success: false, error: 'Finance operation failed.', code: 'FINANCE_INTERNAL_ERROR' });
    }
    next(error);
}

export const getWorkspace = financeHandler(async (req, res) => {
    res.json(await workspace(requestActor(req), req.query));
});
export const getAccount = financeHandler(async (req, res) => {
    res.json({ success: true, account: await getStudentAccount(requestActor(req), req.params.studentId) });
});
export const postCharge = financeHandler(async (req, res) => {
    const result = await createCharge(requestActor(req), req.body);
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: result.duplicate ? 'Charge was already recorded.' : 'Charge added.', ...result });
});
export const postPayment = financeHandler(async (req, res) => {
    const result = await recordPayment(requestActor(req), req.body);
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: result.duplicate ? 'Payment was already recorded.' : 'Payment recorded.', ...result });
});
export const postPaymentReverse = financeHandler(async (req, res) => {
    const result = await reversePayment(requestActor(req), req.params.id, req.body);
    res.json({ success: true, message: result.duplicate ? 'Payment was already reversed.' : 'Payment reversed.', ...result });
});
export const postObligationVoid = financeHandler(async (req, res) => {
    const result = await voidObligation(requestActor(req), req.params.id, req.body);
    res.json({ success: true, message: result.duplicate ? 'Item was already voided.' : 'Finance item voided.', ...result });
});export const postOpeningBalances = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Opening balances processed.', ...await addOpeningBalances(requestActor(req), req.body) });
});
export const postMonthlyPreview = financeHandler(async (req, res) => {
    res.json({ success: true, preview: await previewMonthlyFees(requestActor(req), req.body?.month) });
});
export const postMonthlyPublish = financeHandler(async (req, res) => {
    const result = await publishMonthlyFees(requestActor(req), req.body);
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: 'Monthly fees published.', ...result });
});
export const postMonthlyGenerateCompatibility = financeHandler(async (req, res) => {
    const result = await generateCurrentMonthlyFees(requestActor(req), req.body);
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: 'Monthly fees published.', ...result });
});
export const rejectMonthlyDelete = financeHandler(async () => {
    throw new FinanceError(409, 'Published finance history cannot be deleted. Use an audited void or reversal workflow.', 'FINANCE_HISTORY_IMMUTABLE');
});
export const postFeeSchedule = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Fee schedule created.', ...await createFeeSchedule(requestActor(req), req.body) });
});
export const postStudentAgreement = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Student fee agreement created.', ...await createStudentFeeAgreement(requestActor(req), req.body) });
});
export const postPermission = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, message: 'Finance permission granted.', ...await grantPermissions(requestActor(req), req.body) });
});
export const putPermissionRevoke = financeHandler(async (req, res) => {
    res.json({ success: true, message: 'Finance permission revoked.', ...await revokePermission(requestActor(req), req.params.id) });
});
export const getCategories = financeHandler(async (req, res) => {
    res.json({ success: true, data: await listCategories(requestActor(req)) });
});
export const postCategory = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await createCategory(requestActor(req), req.body) });
});
export const putCategoryToggle = financeHandler(async (req, res) => {
    res.json({ success: true, data: await toggleCategory(requestActor(req), req.params.id, req.body?.is_active) });
});
export const getAccounts = financeHandler(async (req, res) => {
    res.json({ success: true, data: await listAccounts(requestActor(req)) });
});
export const postAccount = financeHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await createAccount(requestActor(req), req.body) });
});
export const putAccountToggle = financeHandler(async (req, res) => {
    res.json({ success: true, data: await toggleAccount(requestActor(req), req.params.id, req.body?.is_active) });
});
export const getActiveStudents = financeHandler(async (req, res) => {
    res.json({ success: true, data: await activeStudents(requestActor(req)) });
});
export const getPaymentFormData = financeHandler(async (req, res) => {
    const actor = requestActor(req);
    const [students, categories, accounts] = await Promise.all([activeStudents(actor), listCategories(actor), listAccounts(actor).catch(() => [])]);
    res.json({ success: true, students, categories, accounts });
});
export const getDashboard = financeHandler(async (req, res) => {
    const summary = await financeDashboard(requestActor(req));
    res.json({ success: true, ...summary, expected: Number(summary.expected || 0), collected: Number(summary.collected || 0), pending: Number(summary.pending || summary.outstanding || 0), cashCollected: 0, upiCollected: 0, bankCollected: 0 });
});
export const getCurrentMonthlyFees = financeHandler(async (req, res) => {
    res.json({ success: true, data: await currentMonthlyFees(requestActor(req)) });
});
export const getLedgerCompatibility = financeHandler(async (req, res) => {
    const account = await getStudentAccount(requestActor(req), req.params.student_id);
    res.json({ success: true, account, ledger: account });
});
export const searchLedgerCompatibility = financeHandler(async (req, res) => {
    const query = requiredText(req.query.query, 'Search', 100);
    const student = await db.query(`SELECT adm_no FROM students WHERE name ILIKE $1 OR adm_no ILIKE $1 ORDER BY name LIMIT 1`, [`%${query}%`]);
    if (!student.rows[0]) throw new FinanceError(404, 'Student not found.', 'STUDENT_NOT_FOUND');
    const account = await getStudentAccount(requestActor(req), student.rows[0].adm_no);
    res.json({ success: true, data: { student: account.student, ledger: account.open_items, totalPending: account.summary.total_due } });
});
export const getFeeSchedulesCompatibility = financeHandler(async (req, res) => {
    const actor = requestActor(req); requireFinanceManager(actor);
    const result = await db.query(`SELECT id, name, name AS label, amount, effective_from, effective_until, scope_type, standard, division, status, (status = 'active') AS is_active FROM finance_fee_schedules ORDER BY effective_from DESC, created_at DESC`);
    res.json({ success: true, feePlans: result.rows, data: result.rows });
});
export const rejectFeeScheduleDelete = financeHandler(async () => {
    throw new FinanceError(409, 'Fee schedules are versioned and cannot be deleted. Create a new effective-dated schedule.', 'FINANCE_HISTORY_IMMUTABLE');
});