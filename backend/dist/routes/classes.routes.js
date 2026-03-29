"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const classes_controller_1 = require("../controllers/classes.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Protect all class routes
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
// Academic Years
router.get('/academic-years', classes_controller_1.getAcademicYears);
router.post('/academic-years', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.upsertAcademicYear);
router.delete('/academic-years/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.deleteAcademicYear);
// Classes
router.get('/', classes_controller_1.getClasses);
router.post('/', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.upsertClass);
router.delete('/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), classes_controller_1.deleteClass);
// Enrollments
router.get('/enrollments', classes_controller_1.getEnrollments);
router.post('/enrollments', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), classes_controller_1.enrollStudent);
router.delete('/enrollments/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), classes_controller_1.deleteEnrollment);
// Weekly Schedule
router.get('/schedule', classes_controller_1.getWeeklySchedule);
router.post('/schedule', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), classes_controller_1.upsertWeeklySchedule);
router.delete('/schedule/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), classes_controller_1.deleteWeeklySchedule);
// Class Events
router.get('/events', classes_controller_1.getClassEvents);
router.post('/events/generate', classes_controller_1.generateDailyEvents);
router.post('/events/manual', classes_controller_1.createManualClassEvent);
router.patch('/events/:id/status', classes_controller_1.updateClassEventStatus);
exports.default = router;
