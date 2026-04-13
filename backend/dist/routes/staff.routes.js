"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const staff_controller_1 = require("../controllers/staff.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Protect all staff routes
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
// GET /api/staff/me
router.get('/me', staff_controller_1.getMyStaffProfile);
// GET /api/staff/me/students (with today's stats)
router.get('/me/students', staff_controller_1.getMyStudentsWithStats);
// GET /api/staff/me/leaves
router.get('/me/leaves', staff_controller_1.getMyLeaves);
// POST /api/staff/cancel-session
router.post('/cancel-session', staff_controller_1.cancelSession);
// GET /api/staff/:id/students
router.get('/:id/students', staff_controller_1.getStaffStudents);
// POST /api/staff/:id/assign
router.post('/:id/assign', staff_controller_1.assignStudentsToMentor);
// POST /api/staff/:id/unassign
router.post('/:id/unassign', staff_controller_1.unassignStudentFromMentor);
// GET /api/staff
router.get('/', staff_controller_1.getAllStaff);
// POST /api/staff
router.post('/', staff_controller_1.createStaff);
// POST /api/staff/:id/login
router.post('/:id/login', staff_controller_1.createStaffLogin);
// PUT /api/staff/:id/archive
router.put('/:id/archive', staff_controller_1.archiveStaff);
// PUT /api/staff/:id/restore
router.put('/:id/restore', staff_controller_1.restoreStaff);
// GET /api/staff/:id
router.get('/:id', staff_controller_1.getStaffById);
// PUT /api/staff/:id
router.put('/:id', staff_controller_1.updateStaffProfile);
exports.default = router;
