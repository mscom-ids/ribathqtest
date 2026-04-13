"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chat_controller_1 = require("../controllers/chat.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All chat routes require authentication
router.use(auth_middleware_1.verifyToken);
router.use(auth_middleware_1.verifyDelegation);
router.use((0, auth_middleware_1.requireRole)(['admin', 'principal', 'vice_principal', 'staff', 'usthad', 'mentor', 'controller']));
// Conversations
router.get('/conversations', chat_controller_1.getConversations);
router.post('/conversations/private', chat_controller_1.startPrivateChat);
router.post('/conversations/group', (0, auth_middleware_1.requireRole)(['admin', 'principal']), chat_controller_1.createGroupChat);
// Group management (admin only)
router.put('/conversations/:id/members', (0, auth_middleware_1.requireRole)(['admin', 'principal']), chat_controller_1.updateGroupMembers);
router.get('/conversations/:id/members', chat_controller_1.getGroupMembers);
// Admin: delete entire conversation/group
router.delete('/conversations/:id', (0, auth_middleware_1.requireRole)(['admin']), chat_controller_1.deleteConversation);
// Messages
router.get('/conversations/:id/messages', chat_controller_1.getMessages);
router.post('/conversations/:id/messages', chat_controller_1.sendMessage);
router.post('/conversations/:id/messages/image', chat_controller_1.sendImageMessage);
// Read status
router.put('/conversations/:id/read', chat_controller_1.markAsRead);
// Admin: delete message
router.delete('/messages/:messageId', (0, auth_middleware_1.requireRole)(['admin', 'principal']), chat_controller_1.deleteMessage);
// Staff list for starting new chats
router.get('/staff-list', chat_controller_1.getStaffList);
// Polling endpoint
router.get('/poll/:conversationId', chat_controller_1.pollMessages);
exports.default = router;
