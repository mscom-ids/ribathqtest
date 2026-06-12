import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getAcademicYearsWithSettings,
    getCurrentAcademicYear,
    getHistoryHealth,
    getMigrationReports,
    getStudentAcademicHistory,
    getYearSnapshots,
    upsertAcademicYearSettings,
} from '../controllers/academic_history.controller';


const router = Router();
const HISTORY_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const HISTORY_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(HISTORY_VIEW_ROLES));

router.get('/years', getAcademicYearsWithSettings);
router.get('/current', getCurrentAcademicYear);
router.get('/health', requireRole(HISTORY_MANAGE_ROLES), getHistoryHealth);
router.get('/migration-reports', requireRole(HISTORY_MANAGE_ROLES), getMigrationReports);
router.get('/snapshots', getYearSnapshots);
router.get('/students/:studentId', getStudentAcademicHistory);
router.post('/settings', requireRole(HISTORY_MANAGE_ROLES), upsertAcademicYearSettings);

export default router;
