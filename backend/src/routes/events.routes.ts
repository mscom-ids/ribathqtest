import express from 'express';
import { getEvents, createEvent, updateEvent, deleteEvent } from '../controllers/events.controller';
import { verifyToken, verifyDelegation, requireRole } from '../middleware/auth.middleware';

const router = express.Router();

const VIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'mentor'];
const MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];

router.use(verifyToken);
router.use(verifyDelegation);

router.get('/', requireRole(VIEW_ROLES), getEvents);
router.post('/', requireRole(MANAGE_ROLES), createEvent);
router.put('/:id', requireRole(MANAGE_ROLES), updateEvent);
router.delete('/:id', requireRole(MANAGE_ROLES), deleteEvent);

export default router;
