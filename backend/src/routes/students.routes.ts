import { Router } from 'express';
import { getAllStudents, getStudentById, createStudent, updateStudent } from '../controllers/students.controller';
import { getNextStudentId, getStaff } from '../controllers/students.helpers';
import { getDisciplinaryRecords, createDisciplinaryRecord, deleteDisciplinaryRecord } from '../controllers/academics.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Protect all student routes
router.use(verifyToken);

// GET /api/students/next-id (Helper)
router.get('/next-id', requireRole(['admin', 'principal', 'staff', 'usthad', 'mentor']), getNextStudentId);

// GET /api/students/staff (Helper)
router.get('/staff', requireRole(['admin', 'principal']), getStaff);

// GET /api/students
router.get('/', requireRole(['admin', 'staff', 'principal', 'usthad', 'mentor']), getAllStudents);

// GET /api/students/:id
router.get('/:id', requireRole(['admin', 'staff', 'principal', 'usthad', 'mentor']), getStudentById);

// POST /api/students (Only Admins/Principals)
router.post('/', requireRole(['admin', 'principal']), createStudent);

// PUT /api/students/:id (Only Admins/Principals)
router.put('/:id', requireRole(['admin', 'principal']), updateStudent);

// Disciplinary Records
router.get('/disciplinary', getDisciplinaryRecords);
router.post('/disciplinary', createDisciplinaryRecord);
router.delete('/disciplinary/:id', deleteDisciplinaryRecord);

export default router;
