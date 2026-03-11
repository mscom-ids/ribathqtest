import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_here';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  // Check headers for 'Authorization: Bearer <token>'
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach the decoded payload (user id, role, email) to the request object
    (req as any).user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token.' });
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
