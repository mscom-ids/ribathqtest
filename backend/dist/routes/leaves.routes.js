"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const leaves_controller_1 = require("../controllers/leaves.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.verifyToken);
// Shared
router.get('/', leaves_controller_1.getAllLeaves); // All leaves for admin dashboard
router.get('/eligible-students', leaves_controller_1.getEligibleStudents);
router.get('/active', leaves_controller_1.getActiveLeaves); // For attendance checks
router.get('/outside-students', leaves_controller_1.getOutsideStudents); // All currently outside students (any mentor/admin)
// Institutional Leaves — ADMIN ONLY for creation/deletion
router.post('/institutional', (0, auth_middleware_1.requireRole)(['admin', 'principal']), leaves_controller_1.createInstitutionalLeave);
router.get('/institutional', leaves_controller_1.getInstitutionalLeaves);
router.delete('/institutional/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), leaves_controller_1.deleteInstitutionalLeave);
router.get('/institutional/:id/students', leaves_controller_1.getInstitutionalLeaveStudents);
// Bulk return: any mentor or admin can return students
router.post('/institutional/:id/bulk-return', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff', 'usthad']), leaves_controller_1.bulkRecordReturn);
// Out-Campus & On-Campus (Individual) — admin + mentors (their own students)
router.post('/personal', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff', 'usthad']), leaves_controller_1.createPersonalLeave);
// Class/Batch group leaves — admin only
router.post('/group', (0, auth_middleware_1.requireRole)(['admin', 'principal']), leaves_controller_1.createGroupLeave);
router.get('/personal', leaves_controller_1.getLeavesFilter); // expects ?type=out-campus or ?type=on-campus
// Group Leaves (For class/batch specific returns)
router.get('/group/:id/students', leaves_controller_1.getGroupLeaveStudents);
router.post('/group/:id/bulk-return', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff', 'usthad']), leaves_controller_1.bulkRecordGroupReturn);
// Returns & Movements — any mentor or admin can record a return
router.post('/record-return', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff', 'usthad']), leaves_controller_1.recordReturn);
router.get('/movements', leaves_controller_1.getMovementHistory);
exports.default = router;
