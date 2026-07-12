import { Router } from 'express';
import { getStudentReports, getMentorReports, getUnifiedStudentProgressReport } from '../controllers/reports.controller';
import { verifyToken, verifyDelegation, requireRole } from '../middleware/auth.middleware';

const router = Router();

const REPORT_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'mentor', 'usthad', 'staff', 'teacher'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(REPORT_ROLES));

router.get('/students', getStudentReports);
router.get('/mentors', getMentorReports);
router.get('/student-progress', getUnifiedStudentProgressReport);

export default router;
