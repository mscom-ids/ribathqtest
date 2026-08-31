import { Request, Response } from 'express';
import { resolveFinanceActor } from '../finance/finance.auth';
import { createCharge, getStudentAccount, recordPayment, workspace } from '../finance/finance.service';
import { FinanceError } from '../finance/finance.types';
import { requireActiveMobileDevice } from './mobile-sync.service';

async function activeFinanceActor(req: Request, res: Response) {
  const staffId = String((req as any).user?.id || '');
  if (!staffId) { res.status(401).json({ success: false, error: 'Unauthenticated' }); return null; }
  const device = await requireActiveMobileDevice(req, staffId);
  if (!device) { res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' }); return null; }
  return resolveFinanceActor(req);
}

function financeFailure(res: Response, error: unknown) {
  if (error instanceof FinanceError) {
    return res.status(error.status).json({ success: false, error: error.message, code: error.code, details: error.details });
  }
  console.error('[MOBILE FINANCE]', error);
  return res.status(500).json({ success: false, error: 'Finance operation failed.', code: 'FINANCE_INTERNAL_ERROR' });
}

export async function mobileFinanceWorkspace(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const actor = await activeFinanceActor(req, res); if (!actor) return;
    return res.json(await workspace(actor, req.query));
  } catch (error) {
    return financeFailure(res, error);
  }
}

export async function mobileFinanceAccount(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const actor = await activeFinanceActor(req, res); if (!actor) return;
    return res.json({ success: true, account: await getStudentAccount(actor, req.params.studentId) });
  } catch (error) {
    return financeFailure(res, error);
  }
}

export async function mobileFinanceCharge(req: Request, res: Response) {
  try {
    const actor = await activeFinanceActor(req, res); if (!actor) return;
    const result = await createCharge(actor, req.body);
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'Charge was already recorded.' : 'Charge added.',
      ...result,
    });
  } catch (error) {
    return financeFailure(res, error);
  }
}

export async function mobileFinancePayment(req: Request, res: Response) {
  try {
    const actor = await activeFinanceActor(req, res); if (!actor) return;
    const result = await recordPayment(actor, req.body);
    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      message: result.duplicate ? 'Payment was already recorded.' : 'Payment recorded.',
      ...result,
    });
  } catch (error) {
    return financeFailure(res, error);
  }
}
