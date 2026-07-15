"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_dashboard_controller_1 = require("../controllers/admin_dashboard.controller");
const staff_dashboard_controller_1 = require("../controllers/staff_dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
const ADMIN_ROLES = ['admin', 'principal', 'vice_principal'];
const STAFF_PORTAL_ROLES = ['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller'];
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
// GET /api/dashboard/admin
router.get('/admin', (0, auth_middleware_1.requireRole)(ADMIN_ROLES), admin_dashboard_controller_1.getAdminSummary);
// GET /api/dashboard/staff
router.get('/staff', (0, auth_middleware_1.requireRole)(STAFF_PORTAL_ROLES), staff_dashboard_controller_1.getStaffSummary);
exports.default = router;
