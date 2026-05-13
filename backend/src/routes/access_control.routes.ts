import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getMentorAccessDecisionForDate,
    getMentorAccessPolicies,
    updateMentorAccessPolicy,
} from '../controllers/access_control.controller';

const router = Router();

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor']));

router.get('/mentor-policies', getMentorAccessPolicies);
router.get('/mentor-decision', getMentorAccessDecisionForDate);
router.post('/mentor-policies', requireRole(['admin', 'principal', 'vice_principal', 'controller']), updateMentorAccessPolicy);

export default router;
