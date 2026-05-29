import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getMyChildren, getParentDashboard, parentLogin, submitLeaveRequest } from '../controllers/parent.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

const parentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public parent login with admission number + DOB.
router.post('/login', parentLoginLimiter, parentLogin);

// All parent data routes need JWT auth.
router.use(verifyToken);
router.use(requireRole(['parent']));

// GET /api/parent/dashboard
router.get('/dashboard', getParentDashboard);

// GET /api/parent/children
router.get('/children', getMyChildren);

// POST /api/parent/leaves
router.post('/leaves', submitLeaveRequest);

export default router;
