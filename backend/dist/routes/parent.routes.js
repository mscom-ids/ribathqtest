"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const parent_controller_1 = require("../controllers/parent.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const parentLoginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});
// Public parent login with admission number + DOB.
router.post('/login', parentLoginLimiter, parent_controller_1.parentLogin);
// All parent data routes need JWT auth.
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['parent']));
// GET /api/parent/dashboard
router.get('/dashboard', parent_controller_1.getParentDashboard);
// GET /api/parent/children
router.get('/children', parent_controller_1.getMyChildren);
// POST /api/parent/leaves
router.post('/leaves', parent_controller_1.submitLeaveRequest);
exports.default = router;
