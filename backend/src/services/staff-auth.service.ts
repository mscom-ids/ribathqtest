import bcrypt from 'bcrypt';
import { db } from '../config/db';
import { supabaseAdmin } from '../config/supabase';
import { devLog } from '../utils/logger';

const AUTH_PROVIDER_TIMEOUT_MS = 8_000;

export class StaffAuthenticationError extends Error {
  constructor(
    message: string,
    public readonly reason: 'invalid_credentials' | 'provider_timeout' | 'not_provisioned'
  ) {
    super(message);
    this.name = 'StaffAuthenticationError';
  }
}

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export async function authenticateStaffCredentials(rawEmail: unknown, rawPassword: unknown) {
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  if (!email || !password) {
    throw new StaffAuthenticationError('Email and password are required', 'invalid_credentials');
  }

  const localStaffResult = await db.query(
    `SELECT id, email, name, role, photo_url, profile_id, password_hash
     FROM staff
     WHERE LOWER(TRIM(email)) = $1
     LIMIT 1`,
    [email]
  );
  const localStaff = localStaffResult.rows[0] || null;

  const supabaseAuthPromise = withTimeout(
    supabaseAdmin.auth.signInWithPassword({ email, password }),
    AUTH_PROVIDER_TIMEOUT_MS,
    'Supabase Auth'
  );
  const legacyPasswordPromise = localStaff?.password_hash
    ? bcrypt.compare(password, localStaff.password_hash)
    : Promise.resolve(false);

  let authUserId: string | null = null;
  let providerError = 'Invalid email or password';
  const legacyMatched = await legacyPasswordPromise.catch((error) => {
    devLog(`[AUTH] Legacy bcrypt check failed for "${email}":`, error);
    return false;
  });

  if (legacyMatched) {
    supabaseAuthPromise.catch((error) => {
      devLog(`[AUTH] Supabase login unavailable after legacy success for "${email}":`, error);
    });
  } else {
    const authResult = await supabaseAuthPromise
      .then((value) => ({ status: 'fulfilled' as const, value }))
      .catch((reason) => ({ status: 'rejected' as const, reason }));

    if (authResult.status === 'fulfilled') {
      const { data, error } = authResult.value;
      if (!error && data.session) {
        authUserId = data.user.id;
      } else {
        providerError = error?.message || providerError;
      }
    } else {
      providerError = authResult.reason instanceof Error
        ? authResult.reason.message
        : 'Supabase Auth failed';
    }

    if (!authUserId) {
      const timedOut = providerError.includes('timed out');
      throw new StaffAuthenticationError(
        timedOut ? 'Authentication provider timed out. Please try again.' : 'Invalid email or password',
        timedOut ? 'provider_timeout' : 'invalid_credentials'
      );
    }
  }

  let staff = localStaff;
  if (!staff || (authUserId && staff.profile_id !== authUserId && staff.email?.trim().toLowerCase() !== email)) {
    const staffResult = await db.query(
      `SELECT id, email, name, role, photo_url, profile_id
       FROM staff
       WHERE LOWER(TRIM(email)) = $1 OR (profile_id = $2 AND $2 IS NOT NULL)
       LIMIT 1`,
      [email, authUserId]
    );
    staff = staffResult.rows[0] || null;
  }

  if (!staff) {
    throw new StaffAuthenticationError(
      'Your account has not been fully provisioned. Please contact the administrator.',
      'not_provisioned'
    );
  }

  if (!staff.profile_id && authUserId) {
    try {
      await db.query('UPDATE staff SET profile_id = $1 WHERE id = $2', [authUserId, staff.id]);
      staff.profile_id = authUserId;
    } catch (error) {
      console.error('[AUTH] Failed to self-heal missing profile_id:', error);
    }
  }

  return staff;
}

