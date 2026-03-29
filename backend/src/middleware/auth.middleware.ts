import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Server cannot start without it.');
}

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  // 1. Try Authorization header first
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Fall back to httpOnly cookie
  if (!token && req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === 'string') {
      return res.status(401).json({ success: false, error: 'Invalid token format.' });
    }
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
  }
};

/**
 * Verify a delegation token from x-delegation-token header.
 * Must run AFTER verifyToken so req.user is available.
 * If present and valid, attaches delegation context to req.delegation.
 * If present and invalid, returns 403.
 * If absent, continues without delegation.
 */
export const verifyDelegation = (req: Request, res: Response, next: NextFunction) => {
  const delegationToken = req.headers['x-delegation-token'] as string;

  if (!delegationToken) {
    return next();
  }

  const user = (req as any).user;
  if (!user) {
    // No auth context yet — skip delegation check (verifyToken will reject if needed)
    return next();
  }

  try {
    const decoded = jwt.verify(delegationToken, JWT_SECRET) as any;

    if (decoded.type !== 'delegation') {
      return res.status(403).json({ success: false, error: 'Invalid delegation token type.' });
    }

    if (decoded.issuedTo !== user.id) {
      return res.status(403).json({ success: false, error: 'Delegation token does not belong to you.' });
    }

    (req as any).delegation = {
      actingAsStaffId: decoded.actingAs,
      delegationId: decoded.delegationId,
      studentId: decoded.studentId || null,
      issuedBy: decoded.issuedBy
    };
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Invalid or expired delegation token.' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user || (!roles.includes(user.role) && !roles.includes('all'))) {
      return res.status(403).json({ success: false, error: 'Forbidden. Insufficient permissions.' });
    }

    next();
  };
};
