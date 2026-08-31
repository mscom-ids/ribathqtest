import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyMobileAccessToken } from '../../middleware/auth.middleware';
import { mobileLogin, mobileLogout, mobileRefresh } from './mobile-auth.controller';
import { bootstrap, downloadChanges, registerDevice, revokeDevice } from './mobile-sync.controller';
import { createHifzEntryMutation } from './mobile-hifz.controller';
import { createMobileStudent } from './mobile-admin.controller';
import {
  mobileAttendanceDay,
  mobileAttendanceMutation,
  mobileAttendanceRoster,
} from './mobile-attendance.controller';
import { mobileLeaveMutation, mobileMentorWorkspace } from './mobile-leaves.controller';
import { mobileStudentProgressReport } from './mobile-reports.controller';
import { mobileHifzRegisterMutation, mobileStudentHifzMonth, mobileStudentProfile } from './mobile-student.controller';
import {
  mobileChatMessageMutation,
  mobileChatMessages,
  mobileChatWorkspace,
  mobileMarkChatRead,
  mobileStartPrivateChat,
} from './mobile-chat.controller';
import {
  mobileFinanceAccount,
  mobileFinanceCharge,
  mobileFinancePayment,
  mobileFinanceWorkspace,
} from './mobile-finance.controller';

const router = Router();

const mobileAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many mobile authentication attempts. Try again later.' },
});

router.post('/auth/login', mobileAuthLimiter, mobileLogin);
router.post('/auth/refresh', mobileAuthLimiter, mobileRefresh);
router.post('/auth/logout', mobileLogout);

router.use(verifyMobileAccessToken);
router.post('/devices/register', registerDevice);
router.delete('/devices/:deviceId', revokeDevice);
router.get('/bootstrap', bootstrap);
router.get('/sync', downloadChanges);
router.get('/attendance/day', mobileAttendanceDay);
router.get('/attendance/sessions/:scheduleId', mobileAttendanceRoster);
router.get('/mentor/workspace', mobileMentorWorkspace);
router.get('/reports/student-progress', mobileStudentProgressReport);
router.get('/students/:studentId/profile', mobileStudentProfile);
router.get('/students/:studentId/hifz-month', mobileStudentHifzMonth);
router.get('/chat/workspace', mobileChatWorkspace);
router.get('/chat/conversations/:conversationId/messages', mobileChatMessages);
router.post('/chat/conversations/private', mobileStartPrivateChat);
router.put('/chat/conversations/:conversationId/read', mobileMarkChatRead);
router.get('/finance/workspace', mobileFinanceWorkspace);
router.get('/finance/students/:studentId/account', mobileFinanceAccount);
router.post('/finance/charges', mobileFinanceCharge);
router.post('/finance/payments', mobileFinancePayment);
router.post('/mutations/hifz-entries', createHifzEntryMutation);
router.post('/mutations/hifz-register', mobileHifzRegisterMutation);
router.post('/mutations/attendance', mobileAttendanceMutation);
router.post('/mutations/leaves', mobileLeaveMutation);
router.post('/mutations/chat-messages', mobileChatMessageMutation);
router.post('/mutations/students', createMobileStudent);

export default router;
