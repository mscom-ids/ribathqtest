import { Router } from 'express';
import { getAllLeaves, createLeaveRequest, updateLeaveStatus, getEligibleStudents, recordMovement } from '../controllers/leaves.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

// GET /api/leaves/eligible-students
router.get('/eligible-students', getEligibleStudents);

// GET /api/leaves
router.get('/', getAllLeaves);

// POST /api/leaves (Request Leave)
router.post('/', createLeaveRequest);

// PUT /api/leaves/:id/status (Approve/Reject)
router.put('/:id/status', requireRole(['admin', 'principal', 'staff']), updateLeaveStatus);

// POST /api/leaves/:id/movement (Record Gate scan)
router.post('/:id/movement', requireRole(['admin', 'principal', 'staff']), recordMovement);

export default router;
