import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getSchedules,
    getSchedulesForDate,
    createSchedule,
    copyScheduleDay,
    deleteSchedule,
    getDashboardData,
    getMentorSchedules,
    markAttendance,
    cancelSession,
    restoreSession,
    getBreaks,
    updateBreak,
    getStudentsForSchedule,
    getStudentMarksForSchedule,
    getDailyAttendanceStats
} from '../controllers/attendance_dashboard.controller';

const router = Router();
const ATTENDANCE_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

// Protect all routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// Dashboard & Schedule Setup
router.get('/daily-stats', getDailyAttendanceStats);
router.get('/schedules', getSchedules);
router.get('/schedules-for-date', getSchedulesForDate);
router.post('/schedules', requireRole(['admin', 'principal']), createSchedule);
router.post('/schedules/copy-day', requireRole(['admin', 'principal']), copyScheduleDay);
router.delete('/schedules/:id', requireRole(['admin', 'principal']), deleteSchedule);

// Dashboard data fetches
router.get('/dashboard', getDashboardData);
router.get('/mentor-schedules', getMentorSchedules);

// Attendance marks
router.get('/students', getStudentsForSchedule);
router.get('/marks', getStudentMarksForSchedule);
router.post('/mark', markAttendance);
router.post('/cancel', requireRole(ATTENDANCE_MANAGE_ROLES), cancelSession);
router.post('/restore', requireRole(ATTENDANCE_MANAGE_ROLES), restoreSession);

// Breaks endpoints
router.get('/breaks', getBreaks);
router.post('/breaks/:id', requireRole(['admin', 'principal', 'vice_principal']), updateBreak);

export default router;
