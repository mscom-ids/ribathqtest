import { Request, Response } from 'express';
import { getUnifiedStudentProgressReport } from '../../controllers/reports.controller';
import { requireActiveMobileDevice } from './mobile-sync.service';

const MENTOR_ROLES = new Set(['staff', 'usthad', 'mentor', 'teacher']);

export async function mobileStudentProgressReport(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  const staffId = String((req as any).user?.id || '');
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
  if (!MENTOR_ROLES.has(role)) {
    return res.status(403).json({ success: false, error: 'This mobile report is for mentors.' });
  }
  const device = await requireActiveMobileDevice(req, staffId);
  if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });

  // The shared report handler performs the canonical academic-year and mentor-roster
  // authorization checks and calculates the same figures used by the web portal.
  return getUnifiedStudentProgressReport(req, res);
}
