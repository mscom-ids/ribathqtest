import { Request, Response } from 'express';
import { loadMobileMentorWorkspace, saveMobileLeave } from './mobile-leaves.service';
import { parseMobileLeaveMutation } from './mobile-leaves.validation';
import { requireActiveMobileDevice } from './mobile-sync.service';

const MENTOR_ROLES = new Set(['staff', 'usthad', 'mentor']);

async function activeMentorDevice(req: Request, res: Response) {
  const staffId = String((req as any).user?.id || '');
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!staffId) {
    res.status(401).json({ success: false, error: 'Unauthenticated' });
    return null;
  }
  if (!MENTOR_ROLES.has(role)) {
    res.status(403).json({ success: false, error: 'This mobile workspace is for mentors.' });
    return null;
  }
  const device = await requireActiveMobileDevice(req, staffId);
  if (!device) {
    res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });
    return null;
  }
  return { staffId, role, device };
}

export async function mobileMentorWorkspace(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const auth = await activeMentorDevice(req, res);
    if (!auth) return;
    return res.json(await loadMobileMentorWorkspace(auth.staffId));
  } catch (error) {
    console.error('[MOBILE MENTOR] Workspace load failed:', error);
    return res.status(500).json({ success: false, error: 'Mentor workspace could not be loaded' });
  }
}

export async function mobileLeaveMutation(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const auth = await activeMentorDevice(req, res);
    if (!auth) return;
    const parsed = parseMobileLeaveMutation(req.body);
    if (!parsed.input) return res.status(400).json({ success: false, error: parsed.error });
    const result = await saveMobileLeave({ ...auth, input: parsed.input });
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE MENTOR] Leave mutation failed:', error);
    return res.status(500).json({ success: false, error: 'Leave change could not be saved' });
  }
}

