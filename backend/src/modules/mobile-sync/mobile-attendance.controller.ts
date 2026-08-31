import { Request, Response } from 'express';
import { getSchedulesForDate, getStudentsForSchedule } from '../../controllers/attendance_dashboard.controller';
import { saveMobileAttendance } from './mobile-attendance.service';
import { parseAttendanceDate, parseMobileAttendanceMutation } from './mobile-attendance.validation';
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
    res.status(403).json({ success: false, error: 'This mobile workspace is for mentor attendance.' });
    return null;
  }
  const device = await requireActiveMobileDevice(req, staffId);
  if (!device) {
    res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });
    return null;
  }
  return { staffId, role, device };
}

export async function mobileAttendanceDay(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    if (!await activeMentorDevice(req, res)) return;
    const date = parseAttendanceDate(req.query.date);
    if (!date) return res.status(400).json({ success: false, error: 'A valid date is required' });
    req.query.date = date;
    return getSchedulesForDate(req, res);
  } catch (error) {
    console.error('[MOBILE ATTENDANCE] Day load failed:', error);
    return res.status(500).json({ success: false, error: 'Attendance sessions could not be loaded' });
  }
}

export async function mobileAttendanceRoster(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    if (!await activeMentorDevice(req, res)) return;
    const date = parseAttendanceDate(req.query.date);
    const scheduleId = String(req.params.scheduleId || '');
    if (!date || !scheduleId) return res.status(400).json({ success: false, error: 'Schedule and date are required' });
    req.query.date = date;
    return getStudentsForSchedule(req, res);
  } catch (error) {
    console.error('[MOBILE ATTENDANCE] Roster load failed:', error);
    return res.status(500).json({ success: false, error: 'Attendance roster could not be loaded' });
  }
}

export async function mobileAttendanceMutation(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const auth = await activeMentorDevice(req, res);
    if (!auth) return;
    const parsed = parseMobileAttendanceMutation(req.body);
    if (!parsed.input) return res.status(400).json({ success: false, error: parsed.error });
    const result = await saveMobileAttendance({ ...auth, input: parsed.input });
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE ATTENDANCE] Mutation failed:', error);
    return res.status(500).json({ success: false, error: 'Attendance could not be saved' });
  }
}
