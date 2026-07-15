import { Router } from 'express';
import { getAdminSummary } from '../controllers/admin_dashboard.controller';
import { getStaffSummary } from '../controllers/staff_dashboard.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();
const ADMIN_ROLES = ['admin', 'principal', 'vice_principal'];
const STAFF_PORTAL_ROLES = ['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);

// GET /api/dashboard/admin
router.get('/admin', requireRole(ADMIN_ROLES), getAdminSummary);

// GET /api/dashboard/staff
router.get('/staff', requireRole(STAFF_PORTAL_ROLES), getStaffSummary);

export default router;
