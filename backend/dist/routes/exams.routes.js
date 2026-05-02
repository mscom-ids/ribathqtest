"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exams_controller_1 = require("../controllers/exams.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const EXAM_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const EXAM_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(EXAM_VIEW_ROLES));
// GET /api/exams
router.get('/', exams_controller_1.getExams);
// POST /api/exams
router.post('/', (0, auth_middleware_1.requireRole)(EXAM_MANAGE_ROLES), exams_controller_1.createExam);
// GET /api/exams/students
router.get('/students', exams_controller_1.getStudentsForExamMarks);
// GET /api/exams/:id
router.get('/:id', exams_controller_1.getExamDetails);
// PATCH /api/exams/:id/status
router.patch('/:id/status', (0, auth_middleware_1.requireRole)(EXAM_MANAGE_ROLES), exams_controller_1.updateExamStatus);
// POST /api/exams/:id/subjects
router.post('/:id/subjects', (0, auth_middleware_1.requireRole)(EXAM_MANAGE_ROLES), exams_controller_1.addSubject);
// DELETE /api/exams/subjects/:subject_id
router.delete('/subjects/:subject_id', (0, auth_middleware_1.requireRole)(EXAM_MANAGE_ROLES), exams_controller_1.deleteSubject);
// GET /api/exams/:id/marks
router.get('/:id/marks', exams_controller_1.getExamMarks);
// POST /api/exams/:id/marks
router.post('/:id/marks', (0, auth_middleware_1.requireRole)(EXAM_MANAGE_ROLES), exams_controller_1.upsertExamMarks);
exports.default = router;
