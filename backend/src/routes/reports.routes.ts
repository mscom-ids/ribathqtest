import { Router } from 'express';
import { getStudentReports, getMentorReports, getUnifiedStudentProgressReport } from '../controllers/reports.controller';

const router = Router();

router.get('/students', getStudentReports);
router.get('/mentors', getMentorReports);
router.get('/student-progress', getUnifiedStudentProgressReport);

export default router;
