import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getEligibleStudents,
    createInstitutionalLeave,
    getInstitutionalLeaves,
    getInstitutionalLeaveStudents,
    getInstitutionalEligibleStudents,
    markInstitutionalExit,
    createPersonalLeave,
    createGroupLeave,
    getLeavesFilter,
    recordReturn,
    getMovementHistory,
    getActiveLeaves,
    getOutsideStudents,
    deleteInstitutionalLeave,
    bulkRecordReturn,
    getGroupLeaveStudents,
    bulkRecordGroupReturn,
    getAllLeaves
} from '../controllers/leaves.controller';

const router = Router();
const LEAVE_VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const LEAVE_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
const LEAVE_RETURN_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(LEAVE_VIEW_ROLES));

// Shared
router.get('/', requireRole(LEAVE_MANAGE_ROLES), getAllLeaves); // All leaves for admin dashboard
router.get('/eligible-students', getEligibleStudents);
router.get('/active', getActiveLeaves); // For attendance checks
router.get('/outside-students', getOutsideStudents); // All currently outside students (any mentor/admin)

// Institutional Leaves — ADMIN ONLY for creation/deletion
router.post('/institutional', requireRole(LEAVE_MANAGE_ROLES), createInstitutionalLeave);
router.get('/institutional', requireRole(LEAVE_VIEW_ROLES), getInstitutionalLeaves);
router.delete('/institutional/:id', requireRole(LEAVE_MANAGE_ROLES), deleteInstitutionalLeave);
router.get('/institutional/:id/students', requireRole(LEAVE_MANAGE_ROLES), getInstitutionalLeaveStudents);
router.get('/institutional/:id/eligible-students', requireRole(LEAVE_RETURN_ROLES), getInstitutionalEligibleStudents);
router.post('/institutional/:id/mark-exit', requireRole(LEAVE_RETURN_ROLES), markInstitutionalExit);
// Bulk return: any mentor or admin can return students
router.post('/institutional/:id/bulk-return', requireRole(LEAVE_RETURN_ROLES), bulkRecordReturn);

// Out-Campus & On-Campus (Individual) — admin + mentors (their own students)
router.post('/personal', requireRole(LEAVE_RETURN_ROLES), createPersonalLeave);
// Class/Batch group leaves — admin only
router.post('/group', requireRole(LEAVE_MANAGE_ROLES), createGroupLeave);
router.get('/personal', requireRole(LEAVE_VIEW_ROLES), getLeavesFilter); // expects ?type=out-campus or ?type=on-campus

// Group Leaves (For class/batch specific returns)
router.get('/group/:id/students', requireRole(LEAVE_RETURN_ROLES), getGroupLeaveStudents);
router.post('/group/:id/bulk-return', requireRole(LEAVE_RETURN_ROLES), bulkRecordGroupReturn);

// Returns & Movements — any mentor or admin can record a return
router.post('/record-return', requireRole(LEAVE_RETURN_ROLES), recordReturn);
router.get('/movements', requireRole(LEAVE_MANAGE_ROLES), getMovementHistory);

export default router;
