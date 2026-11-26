import { Router } from 'express';
import { 
    getExams, 
    createExam, 
    getExamDetails, 
    deleteExam,
    updateExamStatus, 
    addSubject, 
    deleteSubject,
    getExamMarks,
    upsertExamMarks,
    getStudentsForExamMarks
} from '../controllers/exams.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import multer from 'multer';
import { adminPortalData, updatePortal, importRoster, updateCenter, createCenter, deleteCenter, configureSubject, reopenValuation, moveStudent, resetStudentMarks, editValuation, exportPortal, exportValuationSheets } from '../controllers/exam-portal.controller';
import { getAdministrationPasscode, setAdministrationPasscode } from '../controllers/exam-administration.controller';

const router = Router();
const EXAM_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const EXAM_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(EXAM_VIEW_ROLES));

// Examiner administration always requires an existing institution administrator.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.use('/:id/portal', (_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
router.get('/:id/portal', requireRole(EXAM_MANAGE_ROLES), adminPortalData);
router.get('/:id/portal/admin-passcode', requireRole(EXAM_MANAGE_ROLES), getAdministrationPasscode);
router.post('/:id/portal/admin-passcode', requireRole(EXAM_MANAGE_ROLES), setAdministrationPasscode);
router.post('/:id/portal/reset-student', requireRole(EXAM_MANAGE_ROLES), resetStudentMarks);
router.post('/:id/portal/edit-valuation', requireRole(EXAM_MANAGE_ROLES), editValuation);
router.patch('/:id/portal', requireRole(EXAM_MANAGE_ROLES), updatePortal);
router.post('/:id/portal/import', requireRole(EXAM_MANAGE_ROLES), (req, res, next) => upload.single('workbook')(req, res, err => err ? res.status(400).json({success:false,error:'Upload one Excel workbook smaller than 5 MB.'}) : next()), importRoster);
router.patch('/:id/portal/centers/:centerId', requireRole(EXAM_MANAGE_ROLES), updateCenter);
router.post('/:id/portal/centers', requireRole(EXAM_MANAGE_ROLES), createCenter);
router.delete('/:id/portal/centers/:centerId', requireRole(EXAM_MANAGE_ROLES), deleteCenter);
router.post('/:id/portal/subjects', requireRole(EXAM_MANAGE_ROLES), configureSubject);
router.post('/:id/portal/reopen', requireRole(EXAM_MANAGE_ROLES), reopenValuation);
router.post('/:id/portal/move', requireRole(EXAM_MANAGE_ROLES), moveStudent);
router.get('/:id/portal/valuation-sheets', requireRole(EXAM_MANAGE_ROLES), exportValuationSheets);
router.get('/:id/portal/export', requireRole(EXAM_MANAGE_ROLES), exportPortal);

// GET /api/exams
router.get('/', getExams);

// POST /api/exams
router.post('/', requireRole(EXAM_MANAGE_ROLES), createExam);

// DELETE /api/exams/:id (cascades to subjects and results)
router.delete('/:id', requireRole(EXAM_MANAGE_ROLES), deleteExam);

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
