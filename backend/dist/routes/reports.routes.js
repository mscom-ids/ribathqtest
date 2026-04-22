"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const reports_controller_1 = require("../controllers/reports.controller");
const router = (0, express_1.Router)();
router.get('/students', reports_controller_1.getStudentReports);
router.get('/mentors', reports_controller_1.getMentorReports);
router.get('/student-progress', reports_controller_1.getUnifiedStudentProgressReport);
exports.default = router;
