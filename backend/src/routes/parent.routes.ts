import { Router } from 'express';
import { getMyChildren, submitLeaveRequest } from '../controllers/parent.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

// All parent routes need JWT auth
router.use(verifyToken);

// GET /api/parent/children
router.get('/children', getMyChildren);

// POST /api/parent/leaves
router.post('/leaves', submitLeaveRequest);

export default router;
