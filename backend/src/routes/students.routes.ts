import { Router } from 'express';
import { getAllStudents, getStudentById, getStudentCounts, getStudentInsideOutsideSummary, createStudent, updateStudent, exportStudents, downloadStudentsExcel } from '../controllers/students.controller';
import { getNextStudentId, getStaff } from '../controllers/students.helpers';
import { getDisciplinaryRecords, createDisciplinaryRecord, deleteDisciplinaryRecord } from '../controllers/academics.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const STUDENT_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const STUDENT_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

// Protect all student routes
router.use(verifyToken);
router.use(verifyDelegation);

// GET /api/students/next-id (Helper)
router.get('/next-id', requireRole(STUDENT_MANAGE_ROLES), getNextStudentId);

// GET /api/students/counts (Lightweight aggregation for the admin dashboard)
router.get('/counts', requireRole(STUDENT_MANAGE_ROLES), getStudentCounts);

// GET /api/students/staff (Helper)
router.get('/staff', requireRole(STUDENT_MANAGE_ROLES), getStaff);

// GET /api/students/export (JSON)
router.get('/export', requireRole(STUDENT_MANAGE_ROLES), exportStudents);

// GET /api/students/download-excel
router.get('/download-excel', requireRole(STUDENT_MANAGE_ROLES), downloadStudentsExcel);

// GET /api/students/inside-outside-summary
router.get('/inside-outside-summary', requireRole(STUDENT_MANAGE_ROLES), getStudentInsideOutsideSummary);

// GET /api/students
router.get('/', requireRole(STUDENT_VIEW_ROLES), getAllStudents);

// Disciplinary Records
router.get('/disciplinary', requireRole(STUDENT_VIEW_ROLES), getDisciplinaryRecords);
router.post('/disciplinary', requireRole(STUDENT_MANAGE_ROLES), createDisciplinaryRecord);
router.delete('/disciplinary/:id', requireRole(STUDENT_MANAGE_ROLES), deleteDisciplinaryRecord);

// GET /api/students/:id
router.get('/:id', requireRole(STUDENT_VIEW_ROLES), getStudentById);

// POST /api/students (Only Admins/Principals)
router.post('/', requireRole(STUDENT_MANAGE_ROLES), createStudent);

// PUT /api/students/:id (Only Admins/Principals)
router.put('/:id', requireRole(STUDENT_MANAGE_ROLES), updateStudent);

export default router;
