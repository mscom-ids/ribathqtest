import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { supabaseAdmin } from '../config/supabase';
import { devLog } from '../utils/logger';
import { cachedResult, makeCacheKey } from '../utils/server-cache';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
}

const AUTH_PROVIDER_TIMEOUT_MS = 8_000;

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

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

    let authUserId: string | null = null;
    let staff = null;

    const localStaffResult = await db.query(
      'SELECT id, email, name, role, photo_url, profile_id, password_hash FROM staff WHERE LOWER(TRIM(email)) = $1 LIMIT 1',
      [email]
    );
    const localStaff = localStaffResult.rows[0] || null;

    const supabaseAuthPromise = withTimeout(supabaseAdmin.auth.signInWithPassword({
        email,
        password
    }), AUTH_PROVIDER_TIMEOUT_MS, 'Supabase Auth');

    const legacyPasswordPromise = localStaff?.password_hash
      ? bcrypt.compare(password, localStaff.password_hash)
      : Promise.resolve(false);

    let supabaseAuthError: string | undefined;
    let authenticated = false;

    const legacyMatched = await legacyPasswordPromise.catch((reason) => {
      devLog(`[AUTH] Legacy bcrypt check failed for "${email}":`, reason);
      return false;
    });

    if (legacyMatched) {
      authenticated = true;
      devLog(`[AUTH] Legacy bcrypt fallback succeeded for "${email}".`);
      supabaseAuthPromise.catch((reason) => {
        devLog(`[AUTH] Supabase login unavailable after legacy success for "${email}":`, reason);
      });
    } else {
      const supabaseAuthResult = await supabaseAuthPromise
        .then((value) => ({ status: 'fulfilled' as const, value }))
        .catch((reason) => ({ status: 'rejected' as const, reason }));

      if (supabaseAuthResult.status === 'fulfilled') {
        const { data: authData, error: authError } = supabaseAuthResult.value;
        if (!authError && authData.session) {
          authenticated = true;
          authUserId = authData.user.id;
        } else {
          supabaseAuthError = authError?.message || 'Invalid email or password';
          devLog(`[AUTH] Supabase login failed for "${email}":`, supabaseAuthError);
        }
      } else {
        supabaseAuthError = supabaseAuthResult.reason instanceof Error
          ? supabaseAuthResult.reason.message
          : 'Supabase Auth failed';
        devLog(`[AUTH] Supabase login unavailable for "${email}":`, supabaseAuthError);
      }
    }

    if (!authenticated) {
      return res.status(401).json({
        success: false,
        error: supabaseAuthError?.includes('timed out')
          ? 'Authentication provider timed out. Please try again.'
          : `Supabase Auth Error: ${supabaseAuthError || 'Invalid email or password'}`
      });
    }

    // 2. Query the staff table to get local application profile details
    // If authUserId is present, search by both. If fallback used, we only have email.
    if (localStaff && (localStaff.email?.trim().toLowerCase() === email || !authUserId || localStaff.profile_id === authUserId)) {
      staff = localStaff;
    } else {
      const staffResult = await db.query(
        'SELECT id, email, name, role, photo_url, profile_id FROM staff WHERE LOWER(TRIM(email)) = $1 OR (profile_id = $2 AND $2 IS NOT NULL) LIMIT 1',
        [email, authUserId]
      );
      staff = staffResult.rows[0] || null;
    }

    if (!staff) {
      devLog(`[AUTH] Authenticated successfully but no local staff record found for email: "${email}" or profile_id: "${authUserId}"`);
      return res.status(401).json({ success: false, error: 'Your account has not been fully provisioned. Please contact the administrator.' });
    }

    devLog(`[AUTH] Local staff record successfully mapped: id=${staff.id}, name=${staff.name}, role=${staff.role}`);

    // If profile_id is somehow missing on the staff record but they logged in via Supabase, self-heal:
    if (!staff.profile_id && authUserId) {
        try {
            await db.query('UPDATE staff SET profile_id = $1 WHERE id = $2', [authUserId, staff.id]);
            staff.profile_id = authUserId;
        } catch (e) {
            console.error('[AUTH] Failed to self-heal missing profile_id on staff record:', e);
        }
    }

    // Get role from profiles if profile_id exists, otherwise use staff.role
    let role = staff.role;
    if (staff.profile_id) {
      try {
        const profileResult = await db.query('SELECT role FROM profiles WHERE id = $1', [staff.profile_id]);
        if (profileResult.rows.length > 0) {
          role = profileResult.rows[0].role;
        }
      } catch (_) { /* profiles table may not be accessible, use staff.role */ }
    }

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
      30_000,
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
