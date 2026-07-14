import { Router } from 'express';
import {
    getAcademicYears, upsertAcademicYear, deleteAcademicYear, getEnrollments,
    getWeeklySchedule, upsertWeeklySchedule, deleteWeeklySchedule,
    getClassEvents, generateDailyEvents, updateClassEventStatus, createManualClassEvent,
} from '../controllers/classes.controller';
import { copyPreviousYearPlacements } from '../controllers/academic-year-copy.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const ATTENDANCE_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

// Legacy attendance schedules/events remain available while attendance is redesigned.
// Dynamic class creation, class membership, and class placement routes are intentionally retired.
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

router.get('/academic-years', getAcademicYears);
router.post('/academic-years', requireRole(['admin', 'principal']), upsertAcademicYear);
router.delete('/academic-years/:id', requireRole(['admin', 'principal']), deleteAcademicYear);
router.post('/academic-years/:id/copy-placements', requireRole(['admin', 'principal']), copyPreviousYearPlacements);

// Read-only legacy enrollment lookup is retained only for existing attendance history.
router.get('/enrollments', getEnrollments);

router.get('/schedule', getWeeklySchedule);
router.post('/schedule', requireRole(ATTENDANCE_MANAGE_ROLES), upsertWeeklySchedule);
router.delete('/schedule/:id', requireRole(ATTENDANCE_MANAGE_ROLES), deleteWeeklySchedule);
router.get('/events', getClassEvents);
router.post('/events/generate', requireRole(ATTENDANCE_MANAGE_ROLES), generateDailyEvents);
router.post('/events/manual', requireRole(ATTENDANCE_MANAGE_ROLES), createManualClassEvent);
router.patch('/events/:id/status', requireRole(ATTENDANCE_MANAGE_ROLES), updateClassEventStatus);

export default router;