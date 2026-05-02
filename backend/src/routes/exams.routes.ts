import { Router } from 'express';
import { 
    getExams, 
    createExam, 
    getExamDetails, 
    updateExamStatus, 
    addSubject, 
    deleteSubject,
    getExamMarks,
    upsertExamMarks,
    getStudentsForExamMarks
} from '../controllers/exams.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const EXAM_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const EXAM_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(EXAM_VIEW_ROLES));

// GET /api/exams
router.get('/', getExams);

// POST /api/exams
router.post('/', requireRole(EXAM_MANAGE_ROLES), createExam);

// GET /api/exams/students
router.get('/students', getStudentsForExamMarks);

// GET /api/exams/:id
router.get('/:id', getExamDetails);

// PATCH /api/exams/:id/status
router.patch('/:id/status', requireRole(EXAM_MANAGE_ROLES), updateExamStatus);

// POST /api/exams/:id/subjects
router.post('/:id/subjects', requireRole(EXAM_MANAGE_ROLES), addSubject);

// DELETE /api/exams/subjects/:subject_id
router.delete('/subjects/:subject_id', requireRole(EXAM_MANAGE_ROLES), deleteSubject);

// GET /api/exams/:id/marks
router.get('/:id/marks', getExamMarks);

// POST /api/exams/:id/marks
router.post('/:id/marks', requireRole(EXAM_MANAGE_ROLES), upsertExamMarks);

export default router;
