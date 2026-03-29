import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
    createDelegationRequest,
    getOutgoingRequests,
    getAssignedToMe,
    getAdminAllRequests,
    updateDelegationStatus,
    revokeDelegation,
    issueDelegationToken
} from '../controllers/delegations.controller';

const router = Router();

// Staff (Mentor) routes
const staffRoles = ['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller'];
router.post('/request', verifyToken, requireRole(staffRoles), createDelegationRequest);
router.get('/my-requests', verifyToken, requireRole(staffRoles), getOutgoingRequests);
router.get('/assigned-to-me', verifyToken, requireRole(staffRoles), getAssignedToMe);
router.delete('/revoke/:id', verifyToken, requireRole(staffRoles), revokeDelegation);

// Issue a server-signed delegation token
router.post('/token', verifyToken, requireRole(staffRoles), issueDelegationToken);

// Admin routes
router.get('/admin/all', verifyToken, requireRole(['admin', 'principal', 'vice_principal']), getAdminAllRequests);
router.put('/admin/:id/status', verifyToken, requireRole(['admin', 'principal', 'vice_principal']), updateDelegationStatus);
router.delete('/admin/:id', verifyToken, requireRole(['admin', 'principal', 'vice_principal']), revokeDelegation);

export default router;
