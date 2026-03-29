"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const parent_controller_1 = require("../controllers/parent.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All parent routes need JWT auth
router.use(auth_middleware_1.verifyToken);
// GET /api/parent/children
router.get('/children', parent_controller_1.getMyChildren);
// POST /api/parent/leaves
router.post('/leaves', parent_controller_1.submitLeaveRequest);
exports.default = router;
