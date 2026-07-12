import { Router } from 'express';
import {
    getHifzStudents, getHifzLogsList, getHifzLog, createHifzLog, updateHifzLog,
    bulkCreateHifzLogs, getMaxJuzForStudent, getProgressSummary,
    deleteHifzLog, getMonthlyReports, upsertMonthlyReport,
    calculateBulkMonthlyReport, getMonthlyReportSettings,
    upsertMonthlyReportSettings
} from '../controllers/hifz.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';
import { exportMonthlyReportExcel, exportMonthlyReportPdf } from '../controllers/hifz-export.controller';

const router = Router();

router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor']));

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

// GET /api/hifz/monthly-reports/calculate
router.get('/monthly-reports/calculate', calculateBulkMonthlyReport);

// POST /api/hifz/monthly-reports/export/excel
router.post('/monthly-reports/export/excel', exportMonthlyReportExcel);

// POST /api/hifz/monthly-reports/export/pdf
router.post('/monthly-reports/export/pdf', exportMonthlyReportPdf);

// GET /api/hifz/monthly-report-settings
router.get('/monthly-report-settings', getMonthlyReportSettings);

// POST /api/hifz/monthly-report-settings
router.post('/monthly-report-settings', upsertMonthlyReportSettings);

// GET /api/hifz/monthly-reports
router.get('/monthly-reports', getMonthlyReports);

// POST /api/hifz/monthly-reports
router.post('/monthly-reports', upsertMonthlyReport);

export default router;
