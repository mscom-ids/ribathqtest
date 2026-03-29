"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academics_controller_1 = require("../controllers/academics.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Protect all academics routes
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
// ---- Sessions ----
router.get('/sessions', academics_controller_1.getAcademicSessions);
router.post('/sessions', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.createSession);
router.put('/sessions/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.updateSession);
router.delete('/sessions/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.deleteSession);
// ---- Calendar ----
router.get('/calendar', academics_controller_1.getAllCalendarPolicies);
router.get('/calendar-range', academics_controller_1.getCalendarRange);
router.get('/calendar/:date', academics_controller_1.getCalendarByDate);
router.put('/calendar', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.upsertCalendarPolicy);
router.delete('/calendar/:date', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.deleteCalendarPolicy);
router.post('/calendar/bulk', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.bulkUpsertCalendarPolicies);
router.post('/calendar/generate', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), academics_controller_1.generateCalendarEntries);
// ---- Attendance ----
router.post('/attendance/students', academics_controller_1.getStudentsForAttendance);
router.get('/attendance', academics_controller_1.getAttendance);
router.post('/attendance', academics_controller_1.upsertAttendance);
// ---- Disciplinary Records (via students route prefix to match frontend) ----
router.get('/disciplinary', academics_controller_1.getDisciplinaryRecords);
router.post('/disciplinary', academics_controller_1.createDisciplinaryRecord);
router.delete('/disciplinary/:id', academics_controller_1.deleteDisciplinaryRecord);
exports.default = router;
