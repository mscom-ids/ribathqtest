import { Router } from 'express';
import { uploadAvatar } from '../controllers/upload.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff']));

// POST /api/upload/avatar
router.post('/avatar', uploadAvatar);

export default router;
