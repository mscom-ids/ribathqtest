import { Router } from 'express';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import {
    getEligibleStudents,
    createInstitutionalLeave,
    getInstitutionalLeaves,
    getInstitutionalLeaveStudents,
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
router.use(verifyToken);
router.use(verifyDelegation);

// Shared
router.get('/', getAllLeaves); // All leaves for admin dashboard
router.get('/eligible-students', getEligibleStudents);
router.get('/active', getActiveLeaves); // For attendance checks
router.get('/outside-students', getOutsideStudents); // All currently outside students (any mentor/admin)

// Institutional Leaves — ADMIN ONLY for creation/deletion
router.post('/institutional', requireRole(['admin', 'principal']), createInstitutionalLeave);
router.get('/institutional', getInstitutionalLeaves);
router.delete('/institutional/:id', requireRole(['admin', 'principal']), deleteInstitutionalLeave);
router.get('/institutional/:id/students', getInstitutionalLeaveStudents);
// Bulk return: any mentor or admin can return students
router.post('/institutional/:id/bulk-return', requireRole(['admin', 'principal', 'staff', 'usthad']), bulkRecordReturn);

// Out-Campus & On-Campus (Individual) — admin + mentors (their own students)
router.post('/personal', requireRole(['admin', 'principal', 'staff', 'usthad']), createPersonalLeave);
// Class/Batch group leaves — admin only
router.post('/group', requireRole(['admin', 'principal']), createGroupLeave);
router.get('/personal', getLeavesFilter); // expects ?type=out-campus or ?type=on-campus

// Group Leaves (For class/batch specific returns)
router.get('/group/:id/students', getGroupLeaveStudents);
router.post('/group/:id/bulk-return', requireRole(['admin', 'principal', 'staff', 'usthad']), bulkRecordGroupReturn);

// Returns & Movements — any mentor or admin can record a return
router.post('/record-return', requireRole(['admin', 'principal', 'staff', 'usthad']), recordReturn);
router.get('/movements', getMovementHistory);

export default router;
