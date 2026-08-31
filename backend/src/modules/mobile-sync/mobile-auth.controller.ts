import { Request, Response } from 'express';
import { authenticateStaffCredentials, StaffAuthenticationError } from '../../services/staff-auth.service';
import { createMobileSession, MobileSessionError, revokeMobileSession, rotateMobileSession } from './mobile-auth.service';
import { parseMobileLoginInput, parseRefreshInput } from './mobile-sync.validation';

export async function mobileLogin(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const input = parseMobileLoginInput(req.body);
    if (!input) return res.status(400).json({ success: false, error: 'Invalid mobile login payload' });

    const staff = await authenticateStaffCredentials(input.email, input.password);
    const session = await createMobileSession(staff, input);
    return res.json({
      success: true,
      tokenType: 'Bearer',
      ...session,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: staff.role,
        photo_url: staff.photo_url,
      },
    });
  } catch (error) {
    if (error instanceof StaffAuthenticationError) {
      return res.status(401).json({ success: false, error: error.message });
    }
    console.error('[MOBILE AUTH] Login failed:', error);
    return res.status(500).json({ success: false, error: 'Mobile login failed' });
  }
}

export async function mobileRefresh(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const input = parseRefreshInput(req.body);
    if (!input) return res.status(400).json({ success: false, error: 'Invalid refresh payload' });
    const session = await rotateMobileSession(input.deviceId, input.refreshToken);
    return res.json({ success: true, tokenType: 'Bearer', ...session });
  } catch (error) {
    if (error instanceof MobileSessionError) {
      return res.status(401).json({ success: false, error: error.message, reason: error.reason });
    }
    console.error('[MOBILE AUTH] Refresh failed:', error);
    return res.status(500).json({ success: false, error: 'Session refresh failed' });
  }
}

export async function mobileLogout(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const input = parseRefreshInput(req.body);
    if (input) await revokeMobileSession(input.deviceId, input.refreshToken);
    return res.json({ success: true });
  } catch (error) {
    console.error('[MOBILE AUTH] Logout failed:', error);
    return res.status(500).json({ success: false, error: 'Mobile logout failed' });
  }
}
