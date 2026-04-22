"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const students_controller_1 = require("../controllers/students.controller");
const students_helpers_1 = require("../controllers/students.helpers");
const academics_controller_1 = require("../controllers/academics.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Protect all student routes
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
// GET /api/students/next-id (Helper)
router.get('/next-id', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff', 'usthad', 'mentor']), students_helpers_1.getNextStudentId);
// GET /api/students/counts (Lightweight aggregation for the admin dashboard)
router.get('/counts', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), students_controller_1.getStudentCounts);
// GET /api/students/staff (Helper)
router.get('/staff', (0, auth_middleware_1.requireRole)(['admin', 'principal']), students_helpers_1.getStaff);
// GET /api/students/export (JSON)
router.get('/export', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff']), students_controller_1.exportStudents);
// GET /api/students/download-excel
router.get('/download-excel', (0, auth_middleware_1.requireRole)(['admin', 'principal', 'staff']), students_controller_1.downloadStudentsExcel);
// GET /api/students
router.get('/', (0, auth_middleware_1.requireRole)(['admin', 'staff', 'principal', 'usthad', 'mentor']), students_controller_1.getAllStudents);
// GET /api/students/:id
router.get('/:id', (0, auth_middleware_1.requireRole)(['admin', 'staff', 'principal', 'usthad', 'mentor']), students_controller_1.getStudentById);
// POST /api/students (Only Admins/Principals)
router.post('/', (0, auth_middleware_1.requireRole)(['admin', 'principal']), students_controller_1.createStudent);
// PUT /api/students/:id (Only Admins/Principals)
router.put('/:id', (0, auth_middleware_1.requireRole)(['admin', 'principal']), students_controller_1.updateStudent);
// Disciplinary Records
router.get('/disciplinary', academics_controller_1.getDisciplinaryRecords);
router.post('/disciplinary', academics_controller_1.createDisciplinaryRecord);
router.delete('/disciplinary/:id', academics_controller_1.deleteDisciplinaryRecord);
exports.default = router;
