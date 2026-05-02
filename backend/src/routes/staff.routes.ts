import { Router } from 'express';
import { getMyStaffProfile, getMyAssignedStudents, getStaffStudents, assignStudentsToMentor, unassignStudentFromMentor, cancelSession, getAllStaff, getStaffById, createStaffLogin, archiveStaff, restoreStaff, updateStaffProfile, createStaff, getMyStudentsWithStats, getMyLeaves } from '../controllers/staff.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const STAFF_PORTAL_ROLES = ['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller'];
const STAFF_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

// Protect all staff routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(STAFF_PORTAL_ROLES));

// GET /api/staff/me
router.get('/me', getMyStaffProfile);

// GET /api/staff/me/students (with today's stats)
router.get('/me/students', getMyStudentsWithStats);

// GET /api/staff/me/leaves
router.get('/me/leaves', getMyLeaves);

// POST /api/staff/cancel-session
router.post('/cancel-session', requireRole(STAFF_MANAGE_ROLES), cancelSession);

// GET /api/staff/:id/students
router.get('/:id/students', requireRole(STAFF_MANAGE_ROLES), getStaffStudents);

// POST /api/staff/:id/assign
router.post('/:id/assign', requireRole(STAFF_MANAGE_ROLES), assignStudentsToMentor);

// POST /api/staff/:id/unassign
router.post('/:id/unassign', requireRole(STAFF_MANAGE_ROLES), unassignStudentFromMentor);

// GET /api/staff
router.get('/', requireRole(STAFF_MANAGE_ROLES), getAllStaff);

// POST /api/staff
router.post('/', requireRole(STAFF_MANAGE_ROLES), createStaff);

// POST /api/staff/:id/login
router.post('/:id/login', requireRole(STAFF_MANAGE_ROLES), createStaffLogin);

// PUT /api/staff/:id/archive
router.put('/:id/archive', requireRole(STAFF_MANAGE_ROLES), archiveStaff);

// PUT /api/staff/:id/restore
router.put('/:id/restore', requireRole(STAFF_MANAGE_ROLES), restoreStaff);

// GET /api/staff/:id
router.get('/:id', requireRole(STAFF_MANAGE_ROLES), getStaffById);

// PUT /api/staff/:id
router.put('/:id', requireRole(STAFF_MANAGE_ROLES), updateStaffProfile);

export default router;
