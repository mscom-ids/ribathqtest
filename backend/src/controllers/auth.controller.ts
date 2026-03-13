import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Query the staff table which has email + role + password_hash
    const staffResult = await db.query(
      'SELECT id, email, name, role, photo_url, password_hash, profile_id FROM staff WHERE email = $1',
      [email]
    );

    if (staffResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const staff = staffResult.rows[0];

    if (!staff.password_hash) {
      return res.status(401).json({ 
        success: false, 
        error: 'Password not set. Please contact your administrator to set up your login.' 
      });
    }

    const isMatch = await bcrypt.compare(password, staff.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
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
  res.json({ success: true, message: 'Logged out successfully' });
};
