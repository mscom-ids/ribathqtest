import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    bulkSaveHifzSessionRules,
    getHifzSessionSetup,
    upsertHifzSession,
    upsertStudentHifzSessionAssignment,
} from '../controllers/hifz_session_rules.controller';

const router = Router();
const MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

router.get('/', getHifzSessionSetup);
router.post('/sessions', requireRole(MANAGE_ROLES), upsertHifzSession);
router.post('/rules/bulk', requireRole(MANAGE_ROLES), bulkSaveHifzSessionRules);
router.post('/assignments', requireRole(MANAGE_ROLES), upsertStudentHifzSessionAssignment);

export default router;
