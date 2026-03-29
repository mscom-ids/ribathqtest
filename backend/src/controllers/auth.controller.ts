import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';
import { supabaseAdmin } from '../config/supabase';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';

export const login = async (req: Request, res: Response) => {
  try {
    const { email: rawEmail, password } = req.body;
    console.log(`[AUTH] Login attempt for email: "${rawEmail}"`);

    if (!rawEmail || !password) {
      console.log(`[AUTH] Missing email or password`);
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const email = String(rawEmail).trim().toLowerCase();

    let authUserId: string | null = null;
    let authDataSession = null;

    // 1. Authenticate with Supabase as the source of truth
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
    });

    if (authError || !authData.session) {
        console.log(`[AUTH] Supabase login failed for "${email}":`, authError?.message);
        console.log(`[AUTH] Attempting legacy bcrypt fallback...`);

        // FALLBACK FOR LEGACY UNMIGRATED ACCOUNTS (Like 'admin')
        const legacyCheck = await db.query(
            'SELECT id, email, password_hash, profile_id FROM staff WHERE LOWER(TRIM(email)) = $1',
            [email]
        );

        let legacyMatched = false;
        if (legacyCheck.rows.length > 0 && legacyCheck.rows[0].password_hash) {
            legacyMatched = await bcrypt.compare(password, legacyCheck.rows[0].password_hash);
        }

        if (!legacyMatched) {
            return res.status(401).json({ success: false, error: `Supabase Auth Error: ${authError?.message || 'Invalid email or password'}` });
        } else {
            console.log(`[AUTH] Legacy bcrypt fallback SUCCEEDED for "${email}". Letting them in.`);
            // Since they matched via legacy, their authUserId isn't available from Supabase (null is fine).
        }
    } else {
        authUserId = authData.user.id;
        authDataSession = authData.session;
    }

    // 2. Query the staff table to get local application profile details
    // If authUserId is present, search by both. If fallback used, we only have email.
    const staffResult = await db.query(
      'SELECT id, email, name, role, photo_url, profile_id FROM staff WHERE LOWER(TRIM(email)) = $1 OR (profile_id = $2 AND $2 IS NOT NULL)',
      [email, authUserId]
    );

    if (staffResult.rows.length === 0) {
      console.log(`[AUTH] Authenticated successfully but no local staff record found for email: "${email}" or profile_id: "${authUserId}"`);
      return res.status(401).json({ success: false, error: 'Your account has not been fully provisioned. Please contact the administrator.' });
    }

    const staff = staffResult.rows[0];
    console.log(`[AUTH] Local staff record successfully mapped: id=${staff.id}, name=${staff.name}, role=${staff.role}`);

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

    // Generate JWT
    const token = jwt.sign(
      { 
        id: staff.id,
        profile_id: staff.profile_id,
        email: staff.email,
        role: role,
        name: staff.name
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        role: role,
        photo_url: staff.photo_url
      }
    });

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

    const result = await db.query(
      'SELECT id, email, name, role, photo_url FROM staff WHERE id = $1',
      [userContext.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    console.error('Me endpoint error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response) => {
  // Clear the auth cookie if set
  res.clearCookie('token');
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true, message: 'Logged out successfully' });
};
