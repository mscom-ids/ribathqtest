"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const yearly_report_controller_1 = require("../controllers/yearly_report.controller");
const router = (0, express_1.Router)();
// All roles can view yearly reports (admin, principal, vice_principal, staff, usthad, mentor, controller, parent)
router.use(auth_middleware_1.verifyToken);
// GET /api/yearly-report/classes — list available classes/standards for a year
router.get('/classes', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), yearly_report_controller_1.getAvailableClasses);
// GET /api/yearly-report/student/:studentId — full yearly report for one student
router.get('/student/:studentId', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), yearly_report_controller_1.getStudentYearlyReport);
// GET /api/yearly-report/class/:classType — summary report for all students in a class
router.get('/class/:classType', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']), yearly_report_controller_1.getClassYearlyReport);
exports.default = router;
