import { Router } from 'express';
import {
    getConversations, startPrivateChat, createGroupChat,
    updateGroupMembers, getGroupMembers, getMessages,
    sendMessage, sendImageMessage, markAsRead,
    deleteMessage, getStaffList, pollMessages
} from '../controllers/chat.controller';
import { verifyToken, requireRole, verifyDelegation } from '../middleware/auth.middleware';

const router = Router();

// All chat routes require authentication
router.use(verifyToken);
router.use(verifyDelegation);
router.use(requireRole(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));

// Conversations
router.get('/conversations', getConversations);
router.post('/conversations/private', startPrivateChat);
router.post('/conversations/group', requireRole(['admin', 'principal']), createGroupChat);

// Group management (admin only)
router.put('/conversations/:id/members', requireRole(['admin', 'principal']), updateGroupMembers);
router.get('/conversations/:id/members', getGroupMembers);

// Messages
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendMessage);
router.post('/conversations/:id/messages/image', sendImageMessage);

// Read status
router.put('/conversations/:id/read', markAsRead);

// Admin: delete message
router.delete('/messages/:messageId', requireRole(['admin', 'principal']), deleteMessage);

// Staff list for starting new chats
router.get('/staff-list', getStaffList);

// Polling endpoint
router.get('/poll/:conversationId', pollMessages);

export default router;
