import { Request, Response } from 'express';
import { requireActiveMobileDevice } from './mobile-sync.service';
import { createMobileHifzEntry } from './mobile-hifz.service';
import { parseMobileHifzMutation } from './mobile-hifz.validation';

export async function createHifzEntryMutation(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const staffId = String((req as any).user?.id || '');
    const role = String((req as any).user?.role || '');
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });

    const device = await requireActiveMobileDevice(req, staffId);
    if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });

    const parsed = parseMobileHifzMutation(req.body);
    if (!parsed.input) return res.status(400).json({ success: false, error: parsed.error });

    const result = await createMobileHifzEntry({ staffId, role, device, input: parsed.input });
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE HIFZ] Mutation failed:', error);
    return res.status(500).json({ success: false, error: 'Hifz entry could not be saved' });
  }
}
