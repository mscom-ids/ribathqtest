import { Router } from 'express';
import {
    getAcademicYears, upsertAcademicYear, deleteAcademicYear,
    getClasses, upsertClass, deleteClass,
    getEnrollments, enrollStudent, deleteEnrollment,
    getWeeklySchedule, upsertWeeklySchedule, deleteWeeklySchedule,
    getClassEvents, generateDailyEvents, updateClassEventStatus, createManualClassEvent
} from '../controllers/classes.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();

// Protect all class routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// Academic Years
router.get('/academic-years', getAcademicYears);
router.post('/academic-years', requireRole(['admin', 'principal']), upsertAcademicYear);
router.delete('/academic-years/:id', requireRole(['admin', 'principal']), deleteAcademicYear);

// Classes
router.get('/', getClasses);
router.post('/', requireRole(['admin', 'principal']), upsertClass);
router.delete('/:id', requireRole(['admin', 'principal']), deleteClass);

// Enrollments
router.get('/enrollments', getEnrollments);
router.post('/enrollments', requireRole(['admin', 'principal', 'vice_principal']), enrollStudent);
router.delete('/enrollments/:id', requireRole(['admin', 'principal', 'vice_principal']), deleteEnrollment);

// Weekly Schedule
router.get('/schedule', getWeeklySchedule);
router.post('/schedule', requireRole(['admin', 'principal', 'vice_principal']), upsertWeeklySchedule);
router.delete('/schedule/:id', requireRole(['admin', 'principal', 'vice_principal']), deleteWeeklySchedule);

// Class Events
router.get('/events', getClassEvents);
router.post('/events/generate', generateDailyEvents);
router.post('/events/manual', createManualClassEvent);
router.patch('/events/:id/status', updateClassEventStatus);

export default router;
