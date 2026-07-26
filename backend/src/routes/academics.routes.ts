import { Router } from 'express';
import {
    getAcademicSessions, getCalendarByDate,
    getStudentsForAttendance, getAttendance, upsertAttendance,
    createSession, updateSession, deleteSession,
    getAllCalendarPolicies, upsertCalendarPolicy, deleteCalendarPolicy,
    bulkUpsertCalendarPolicies, generateCalendarEntries
} from '../controllers/academics.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const ACADEMIC_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

// Protect all academics routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// ---- Sessions ----
router.get('/sessions', getAcademicSessions);
router.post('/sessions', requireRole(['admin', 'principal', 'vice_principal']), createSession);
router.put('/sessions/:id', requireRole(['admin', 'principal', 'vice_principal']), updateSession);
router.delete('/sessions/:id', requireRole(['admin', 'principal', 'vice_principal']), deleteSession);

// ---- Calendar ----
router.get('/calendar', getAllCalendarPolicies);
router.get('/calendar/:date', getCalendarByDate);
router.put('/calendar', requireRole(['admin', 'principal', 'vice_principal']), upsertCalendarPolicy);
router.delete('/calendar/:date', requireRole(['admin', 'principal', 'vice_principal']), deleteCalendarPolicy);
router.post('/calendar/bulk', requireRole(['admin', 'principal', 'vice_principal']), bulkUpsertCalendarPolicies);
router.post('/calendar/generate', requireRole(['admin', 'principal', 'vice_principal']), generateCalendarEntries);

// ---- Attendance ----
router.post('/attendance/students', requireRole(ACADEMIC_MANAGE_ROLES), getStudentsForAttendance);
// Allow staff/mentor to READ attendance (needed for Hifz progress modal)
router.get('/attendance', getAttendance);
router.post('/attendance', requireRole(ACADEMIC_MANAGE_ROLES), upsertAttendance);

export default router;
