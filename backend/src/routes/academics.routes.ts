import { Router } from 'express';
import {
    getAcademicSessions, getCalendarByDate, getCalendarRange,
    getStudentsForAttendance, getAttendance, upsertAttendance,
    createSession, updateSession, deleteSession,
    getAllCalendarPolicies, upsertCalendarPolicy, deleteCalendarPolicy,
    bulkUpsertCalendarPolicies, generateCalendarEntries,
    getDisciplinaryRecords, createDisciplinaryRecord, deleteDisciplinaryRecord
} from '../controllers/academics.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();

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
router.get('/calendar-range', getCalendarRange);
router.get('/calendar/:date', getCalendarByDate);
router.put('/calendar', requireRole(['admin', 'principal', 'vice_principal']), upsertCalendarPolicy);
router.delete('/calendar/:date', requireRole(['admin', 'principal', 'vice_principal']), deleteCalendarPolicy);
router.post('/calendar/bulk', requireRole(['admin', 'principal', 'vice_principal']), bulkUpsertCalendarPolicies);
router.post('/calendar/generate', requireRole(['admin', 'principal', 'vice_principal']), generateCalendarEntries);

// ---- Attendance ----
router.post('/attendance/students', getStudentsForAttendance);
router.get('/attendance', getAttendance);
router.post('/attendance', upsertAttendance);

// ---- Disciplinary Records (via students route prefix to match frontend) ----
router.get('/disciplinary', getDisciplinaryRecords);
router.post('/disciplinary', createDisciplinaryRecord);
router.delete('/disciplinary/:id', deleteDisciplinaryRecord);

export default router;
