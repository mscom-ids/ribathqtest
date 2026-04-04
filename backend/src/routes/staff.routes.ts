import { Router } from 'express';
import { getMyStaffProfile, getMyAssignedStudents, getStaffStudents, assignStudentsToMentor, unassignStudentFromMentor, cancelSession, getAllStaff, getStaffById, createStaffLogin, archiveStaff, restoreStaff, updateStaffProfile, createStaff, getMyStudentsWithStats, getMyLeaves } from '../controllers/staff.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();

// Protect all staff routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// GET /api/staff/me
router.get('/me', getMyStaffProfile);

// GET /api/staff/me/students (with today's stats)
router.get('/me/students', getMyStudentsWithStats);

// GET /api/staff/me/leaves
router.get('/me/leaves', getMyLeaves);

// POST /api/staff/cancel-session
router.post('/cancel-session', cancelSession);

// GET /api/staff/:id/students
router.get('/:id/students', getStaffStudents);

// POST /api/staff/:id/assign
router.post('/:id/assign', assignStudentsToMentor);

// POST /api/staff/:id/unassign
router.post('/:id/unassign', unassignStudentFromMentor);

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

// GET /api/staff/:id
router.get('/:id', getStaffById);

// PUT /api/staff/:id
router.put('/:id', updateStaffProfile);

export default router;
