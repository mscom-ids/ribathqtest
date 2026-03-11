import { Router } from 'express';
import { login, me, logout } from '../controllers/auth.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me (Protected Route to get current user session)
router.get('/me', verifyToken, me);

// POST /api/auth/logout
router.post('/logout', logout);

export default router;
