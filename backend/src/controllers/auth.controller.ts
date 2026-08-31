import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { devLog } from '../utils/logger';
import { cachedResult, makeCacheKey } from '../utils/server-cache';
import { authenticateStaffCredentials, StaffAuthenticationError } from '../services/staff-auth.service';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;
    const startedAt = Date.now();
    devLog(`[AUTH] Login attempt for email: "${rawEmail}"`);

    if (!rawEmail || !password) {
      devLog(`[AUTH] Missing email or password`);
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const staff = await authenticateStaffCredentials(email, password);

    // `staff.role` is the authoritative, admin-managed role (edited via the
    // Mentors admin UI) and is what GET /auth/me and every backend requireRole
    // check against. The legacy `profiles.role` (Supabase) is NOT kept in sync
    // when an admin changes a role, so preferring it here made the JWT disagree
    // with /auth/me — e.g. a promoted Vice Principal still carried `usthad` in
    // their token and was denied supervisor access. Always trust staff.role.
    const role = staff.role;

    // Generate JWT with 7-day expiry (not 365d)
    const token = jwt.sign(
      {
        id: staff.id,
        profile_id: staff.profile_id,
        email: staff.email,
        role: role,
        name: staff.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure httpOnly cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/'
    });

    res.json({
      success: true,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: role,
        photo_url: staff.photo_url
      }
    });
    devLog(`[AUTH] Login completed for "${email}" in ${Date.now() - startedAt}ms`);

  } catch (err: any) {
    if (err instanceof StaffAuthenticationError) {
      return res.status(401).json({ success: false, error: err.message });
    }
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const me = async (req: Request, res: Response) => {
  try {
    const userContext = (req as any).user;
    
    if (!userContext) {
      return res.status(401).json({ success: false, error: 'Unauthenticated' });
    }

    const user = await cachedResult(
      makeCacheKey('auth:me', { id: userContext.id }),
      5 * 60_000,  // 5 min — staff role/name rarely changes mid-session
      async () => {
        const result = await db.query(
          'SELECT id, email, name, role, photo_url FROM staff WHERE id = $1',
          [userContext.id]
        );
        return result.rows[0] || null;
      }
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Me endpoint error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    path: '/'
  });
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
};
