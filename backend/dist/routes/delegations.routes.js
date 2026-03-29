"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const delegations_controller_1 = require("../controllers/delegations.controller");
const router = (0, express_1.Router)();
// Staff (Mentor) routes
const staffRoles = ['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller'];
router.post('/request', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(staffRoles), delegations_controller_1.createDelegationRequest);
router.get('/my-requests', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(staffRoles), delegations_controller_1.getOutgoingRequests);
router.get('/assigned-to-me', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(staffRoles), delegations_controller_1.getAssignedToMe);
router.delete('/revoke/:id', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(staffRoles), delegations_controller_1.revokeDelegation);
// Admin routes
router.get('/admin/all', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), delegations_controller_1.getAdminAllRequests);
router.put('/admin/:id/status', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), delegations_controller_1.updateDelegationStatus);
router.delete('/admin/:id', auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal']), delegations_controller_1.revokeDelegation); // Allow admin to revoke too
exports.default = router;
