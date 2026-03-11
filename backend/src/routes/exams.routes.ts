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
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff']));

// GET /api/exams
router.get('/', getExams);

// POST /api/exams
router.post('/', createExam);

// GET /api/exams/students
router.get('/students', getStudentsForExamMarks);

// GET /api/exams/:id
router.get('/:id', getExamDetails);

// PATCH /api/exams/:id/status
router.patch('/:id/status', updateExamStatus);

// POST /api/exams/:id/subjects
router.post('/:id/subjects', addSubject);

// DELETE /api/exams/subjects/:subject_id
router.delete('/subjects/:subject_id', deleteSubject);

// GET /api/exams/:id/marks
router.get('/:id/marks', getExamMarks);

// POST /api/exams/:id/marks
router.post('/:id/marks', upsertExamMarks);

export default router;
