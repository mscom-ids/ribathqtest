import { Router } from 'express';
import {
    createStandardDivision,
    deleteAttendanceGroup,
    getAcademicPlacements,
    getAttendanceGroups,
    getPlacementAcademicYears,
    getStandardDivisions,
    replaceAttendanceGroupStudents,
    saveAcademicPlacements,
    saveAttendanceGroup,
} from '../controllers/academic-placement.controller';
import { requireRole, verifyDelegation, verifyToken } from '../middleware/auth.middleware';

const router = Router();
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'controller']));

router.get('/academic-years', getPlacementAcademicYears);
router.get('/', getAcademicPlacements);
router.post('/bulk', saveAcademicPlacements);
router.get('/divisions', getStandardDivisions);
router.post('/divisions', requireRole(['admin', 'principal', 'vice_principal']), createStandardDivision);
router.get('/attendance-groups', getAttendanceGroups);
router.post('/attendance-groups', requireRole(['admin', 'principal', 'vice_principal']), saveAttendanceGroup);
router.put('/attendance-groups/:id/students', requireRole(['admin', 'principal', 'vice_principal']), replaceAttendanceGroupStudents);
router.delete('/attendance-groups/:id', requireRole(['admin', 'principal', 'vice_principal']), deleteAttendanceGroup);

export default router;