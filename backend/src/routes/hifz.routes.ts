import { Router } from 'express';
import {
    getHifzStudents, getHifzLogsList, getHifzLog, createHifzLog, updateHifzLog,
    bulkCreateHifzLogs, getMaxJuzForStudent, getProgressSummary,
    deleteHifzLog, getMonthlyReports, upsertMonthlyReport
} from '../controllers/hifz.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff']));

// GET /api/hifz/progress-summary
router.get('/progress-summary', getProgressSummary);

// GET /api/hifz/students
router.get('/students', getHifzStudents);

// GET /api/hifz/logs
router.get('/logs', getHifzLogsList);

// POST /api/hifz/logs/bulk  (must be before /:id to avoid conflict)
router.post('/logs/bulk', bulkCreateHifzLogs);

// GET /api/hifz/logs/max-juz/:student_id
router.get('/logs/max-juz/:student_id', getMaxJuzForStudent);

// GET /api/hifz/logs/:id
router.get('/logs/:id', getHifzLog);

// POST /api/hifz/logs
router.post('/logs', createHifzLog);

// PUT /api/hifz/logs/:id
router.put('/logs/:id', updateHifzLog);

// DELETE /api/hifz/logs/:id
router.delete('/logs/:id', deleteHifzLog);

// GET /api/hifz/monthly-reports
router.get('/monthly-reports', getMonthlyReports);

// POST /api/hifz/monthly-reports
router.post('/monthly-reports', upsertMonthlyReport);

export default router;
