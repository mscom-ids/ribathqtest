"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const classes_controller_1 = require("../controllers/classes.controller");
const academic_year_copy_controller_1 = require("../controllers/academic-year-copy.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const ATTENDANCE_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
// Legacy attendance schedules/events remain available while attendance is redesigned.
// Dynamic class creation, class membership, and class placement routes are intentionally retired.
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
router.get('/academic-years', classes_controller_1.getAcademicYears);
router.post('/academic-years', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.upsertAcademicYear);
router.delete('/academic-years/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.deleteAcademicYear);
router.post('/academic-years/:id/copy-placements', (0, auth_middleware_1.requireRole)(['admin', 'principal']), academic_year_copy_controller_1.copyPreviousYearPlacements);
// Read-only legacy enrollment lookup is retained only for existing attendance history.
router.get('/enrollments', classes_controller_1.getEnrollments);
router.get('/schedule', classes_controller_1.getWeeklySchedule);
router.post('/schedule', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), classes_controller_1.upsertWeeklySchedule);
router.delete('/schedule/:id', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), classes_controller_1.deleteWeeklySchedule);
router.get('/events', classes_controller_1.getClassEvents);
router.post('/events/generate', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), classes_controller_1.generateDailyEvents);
router.post('/events/manual', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), classes_controller_1.createManualClassEvent);
router.patch('/events/:id/status', (0, auth_middleware_1.requireRole)(ATTENDANCE_MANAGE_ROLES), classes_controller_1.updateClassEventStatus);
exports.default = router;
