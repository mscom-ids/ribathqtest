import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, me, logout } from '../controllers/auth.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// POST /api/auth/login
router.post('/login', loginLimiter, login);

// GET /api/auth/me (Protected Route to get current user session)
router.get('/me', verifyToken, me);

// POST /api/auth/logout
router.post('/logout', logout);

export default router;
