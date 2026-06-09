import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getStudentYearlyReport,
  getClassYearlyReport,
  getAvailableClasses,
} from '../controllers/yearly_report.controller';

const router = Router();

// All roles can view yearly reports (admin, principal, vice_principal, staff, usthad, mentor, controller, parent)
router.use(verifyToken);

// GET /api/yearly-report/classes — list available classes/standards for a year
router.get('/classes', requireRole(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), getAvailableClasses);

// GET /api/yearly-report/student/:studentId — full yearly report for one student
router.get('/student/:studentId', requireRole(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), getStudentYearlyReport);

// GET /api/yearly-report/class/:classType — summary report for all students in a class
router.get('/class/:classType', requireRole(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), getClassYearlyReport);

export default router;
