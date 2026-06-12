"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false
});
// POST /api/auth/login
router.post('/login', loginLimiter, auth_controller_1.login);
// GET /api/auth/me (Protected Route to get current user session)
router.get('/me', auth_middleware_1.verifyToken, auth_controller_1.me);
// POST /api/auth/logout
router.post('/logout', auth_controller_1.logout);
exports.default = router;
