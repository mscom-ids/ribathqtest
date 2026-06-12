import { Router } from 'express';
import {
    getAcademicYears, upsertAcademicYear, deleteAcademicYear,
    getClasses, upsertClass, deleteClass,
    getClassStudents, getStudentClassAssignments, upsertStudentClassAssignment,
    getEnrollments, enrollStudent, deleteEnrollment,
    getWeeklySchedule, upsertWeeklySchedule, deleteWeeklySchedule,
    getClassEvents, generateDailyEvents, updateClassEventStatus, createManualClassEvent,
    bulkAssignHifzClass,
    getPromotionStudents, executePromotion
} from '../controllers/classes.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const CLASS_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

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
router.get('/student-assignments', getStudentClassAssignments);
router.post('/student-assignments', requireRole(['admin', 'principal', 'vice_principal']), upsertStudentClassAssignment);
router.get('/promotion/students', requireRole(CLASS_MANAGE_ROLES), getPromotionStudents);
router.post('/promotion/execute', requireRole(CLASS_MANAGE_ROLES), executePromotion);
router.get('/promotion-students', requireRole(CLASS_MANAGE_ROLES), getPromotionStudents);
router.post('/execute-promotion', requireRole(CLASS_MANAGE_ROLES), executePromotion);
router.post('/bulk-assign-hifz', requireRole(['admin', 'principal', 'vice_principal']), bulkAssignHifzClass);
router.get('/:id/students', getClassStudents);
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
router.post('/events/generate', requireRole(CLASS_MANAGE_ROLES), generateDailyEvents);
router.post('/events/manual', requireRole(CLASS_MANAGE_ROLES), createManualClassEvent);
router.patch('/events/:id/status', requireRole(CLASS_MANAGE_ROLES), updateClassEventStatus);

export default router;
