"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const attendance_dashboard_controller_1 = require("../controllers/attendance_dashboard.controller");
const router = (0, express_1.Router)();
const ATTENDANCE_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
// Protect all routes
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
// Dashboard & Schedule Setup
router.get('/daily-stats', attendance_dashboard_controller_1.getDailyAttendanceStats);
router.get('/schedules', attendance_dashboard_controller_1.getSchedules);
router.get('/schedules-for-date', attendance_dashboard_controller_1.getSchedulesForDate);
router.post('/schedules', (0, auth_middleware_1.requireRole)(['admin', 'principal']), attendance_dashboard_controller_1.createSchedule);
router.post('/schedules/copy-day', (0, auth_middleware_1.requireRole)(['admin', 'principal']), attendance_dashboard_controller_1.copyScheduleDay);
router.delete('/schedules/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), attendance_dashboard_controller_1.deleteSchedule);
// Dashboard data fetches
router.get('/dashboard', attendance_dashboard_controller_1.getDashboardData);
router.get('/mentor-schedules', attendance_dashboard_controller_1.getMentorSchedules);
// Attendance marks
router.get('/students', attendance_dashboard_controller_1.getStudentsForSchedule);
router.get('/marks', attendance_dashboard_controller_1.getStudentMarksForSchedule);
router.post('/mark', attendance_dashboard_controller_1.markAttendance);
router.post('/cancel', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), attendance_dashboard_controller_1.cancelSession);
router.post('/restore', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), attendance_dashboard_controller_1.restoreSession);
// Breaks endpoints
router.get('/breaks', attendance_dashboard_controller_1.getBreaks);
router.post('/breaks/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), attendance_dashboard_controller_1.updateBreak);
exports.default = router;
