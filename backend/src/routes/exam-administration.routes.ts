import { Router, RequestHandler } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { administrationBootstrap, administrationLogin, administrationLogout, administrationSession, type ExamAdministrationRequest } from '../controllers/exam-administration.controller';
import { adminPortalData, updatePortal, importRoster, updateCenter, createCenter, deleteCenter, configureSubject, reopenValuation, moveStudent, resetStudentMarks, exportPortal } from '../controllers/exam-portal.controller';

const router = Router({ mergeParams: true });
router.get('/bootstrap', administrationBootstrap);
router.post('/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'Too many attempts. Try again in 15 minutes.' } }), administrationLogin);
router.post('/logout', administrationLogout);
router.use(administrationSession);
const scoped = (handler: RequestHandler): RequestHandler => (req, res, next) => {
    req.params.id = (req as ExamAdministrationRequest).examAdministration!.exam_id;
    return handler(req, res, next);
};
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.get('/', scoped(adminPortalData));
router.patch('/', scoped(updatePortal));
router.get('/export', scoped(exportPortal));
router.post('/import', (req, res, next) => upload.single('workbook')(req, res, error => error ? res.status(400).json({ success: false, error: 'Upload one Excel workbook smaller than 5 MB.' }) : next()), scoped(importRoster));
router.patch('/centers/:centerId', scoped(updateCenter));
router.post('/centers', scoped(createCenter));
router.delete('/centers/:centerId', scoped(deleteCenter));
router.post('/subjects', scoped(configureSubject));
router.post('/reopen', scoped(reopenValuation));
router.post('/move', scoped(moveStudent));
router.post('/reset-student', scoped(resetStudentMarks));
export default router;
