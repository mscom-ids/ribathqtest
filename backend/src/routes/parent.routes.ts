import { Router } from 'express';
import { getMyChildren, submitLeaveRequest } from '../controllers/parent.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All parent routes need JWT auth
router.use(verifyToken);
router.use(requireRole(['parent']));

// GET /api/parent/children
router.get('/children', getMyChildren);

// POST /api/parent/leaves
router.post('/leaves', submitLeaveRequest);

export default router;
