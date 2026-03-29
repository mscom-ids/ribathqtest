import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getSchedules,
    getSchedulesForDate,
    createSchedule,
    deleteSchedule,
    getDashboardData,
    getMentorSchedules,
    markAttendance,
    cancelSession,
    getBreaks,
    updateBreak,
    getStudentsForSchedule,
    getDailyAttendanceStats
} from '../controllers/attendance_dashboard.controller';

const router = Router();

// Protect all routes
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// Dashboard & Schedule Setup
router.get('/daily-stats', getDailyAttendanceStats);
router.get('/schedules', getSchedules);
router.get('/schedules-for-date', getSchedulesForDate);
router.post('/schedules', requireRole(['admin', 'principal']), createSchedule);
router.delete('/schedules/:id', requireRole(['admin', 'principal']), deleteSchedule);

// Dashboard data fetches
router.get('/dashboard', getDashboardData);
router.get('/mentor-schedules', getMentorSchedules);

// Attendance & Cancelling Status
router.get('/students', getStudentsForSchedule);
router.post('/mark', markAttendance);
router.post('/cancel', cancelSession);

// Breaks endpoints
router.get('/breaks', getBreaks);
router.post('/breaks/:id', requireRole(['admin', 'principal', 'vice_principal']), updateBreak);

export default router;
