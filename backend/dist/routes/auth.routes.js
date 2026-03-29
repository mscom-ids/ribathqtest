"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', auth_controller_1.login);
// GET /api/auth/me (Protected Route to get current user session)
router.get('/me', auth_middleware_1.verifyToken, auth_controller_1.me);
// POST /api/auth/logout
router.post('/logout', auth_controller_1.logout);
exports.default = router;
