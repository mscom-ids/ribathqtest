import { Router } from 'express';
import { getStudentReports, getMentorReports } from '../controllers/reports.controller';

const router = Router();

router.get('/students', getStudentReports);
router.get('/mentors', getMentorReports);

export default router;
