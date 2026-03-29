"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hifz_controller_1 = require("../controllers/hifz.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor']));
// GET /api/hifz/progress-summary
router.get('/progress-summary', hifz_controller_1.getProgressSummary);
// GET /api/hifz/students
router.get('/students', hifz_controller_1.getHifzStudents);
// GET /api/hifz/logs
router.get('/logs', hifz_controller_1.getHifzLogsList);
// POST /api/hifz/logs/bulk  (must be before /:id to avoid conflict)
router.post('/logs/bulk', hifz_controller_1.bulkCreateHifzLogs);
// GET /api/hifz/logs/max-juz/:student_id
router.get('/logs/max-juz/:student_id', hifz_controller_1.getMaxJuzForStudent);
// GET /api/hifz/logs/:id
router.get('/logs/:id', hifz_controller_1.getHifzLog);
// POST /api/hifz/logs
router.post('/logs', hifz_controller_1.createHifzLog);
// PUT /api/hifz/logs/:id
router.put('/logs/:id', hifz_controller_1.updateHifzLog);
// DELETE /api/hifz/logs/:id
router.delete('/logs/:id', hifz_controller_1.deleteHifzLog);
// GET /api/hifz/monthly-reports/calculate
router.get('/monthly-reports/calculate', hifz_controller_1.calculateBulkMonthlyReport);
// GET /api/hifz/monthly-reports
router.get('/monthly-reports', hifz_controller_1.getMonthlyReports);
// POST /api/hifz/monthly-reports
router.post('/monthly-reports', hifz_controller_1.upsertMonthlyReport);
exports.default = router;
