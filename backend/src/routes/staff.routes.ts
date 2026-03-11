import { Router } from 'express';
import { getMyStaffProfile, getMyAssignedStudents, cancelSession, getAllStaff, createStaffLogin, archiveStaff, restoreStaff, updateStaffProfile, createStaff, getMyStudentsWithStats, getMyLeaves } from '../controllers/staff.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Protect all staff routes
router.use(verifyToken);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff']));

// GET /api/staff/me
router.get('/me', getMyStaffProfile);

// GET /api/staff/me/students (with today's stats)
router.get('/me/students', getMyStudentsWithStats);

// GET /api/staff/me/leaves
router.get('/me/leaves', getMyLeaves);

// POST /api/staff/cancel-session
router.post('/cancel-session', cancelSession);

// GET /api/staff
router.get('/', getAllStaff);

// POST /api/staff
router.post('/', createStaff);

// POST /api/staff/:id/login
router.post('/:id/login', createStaffLogin);

// PUT /api/staff/:id/archive
router.put('/:id/archive', archiveStaff);

// PUT /api/staff/:id/restore
router.put('/:id/restore', restoreStaff);

// PUT /api/staff/:id
router.put('/:id', updateStaffProfile);

export default router;
