import { Request, Response } from 'express';
import { requireActiveMobileDevice } from './mobile-sync.service';
import { parseChatAfter, parseMobileChatMessage, parseUuid } from './mobile-chat.validation';
import {
  loadMobileChatMessages,
  loadMobileChatWorkspace,
  markMobileChatRead,
  saveMobileChatMessage,
  startMobilePrivateChat,
} from './mobile-chat.service';

const CHAT_ROLES = new Set(['staff', 'usthad', 'mentor', 'teacher']);

async function activeChatDevice(req: Request, res: Response) {
  const staffId = String((req as any).user?.id || '');
  const role = String((req as any).user?.role || '').toLowerCase();
  if (!staffId) { res.status(401).json({ success: false, error: 'Unauthenticated' }); return null; }
  if (!CHAT_ROLES.has(role)) { res.status(403).json({ success: false, error: 'Chat is unavailable for this mobile role.' }); return null; }
  const device = await requireActiveMobileDevice(req, staffId);
  if (!device) { res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' }); return null; }
  return { staffId, device };
}

export async function mobileChatWorkspace(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const auth = await activeChatDevice(req, res); if (!auth) return;
    return res.json(await loadMobileChatWorkspace(auth.staffId));
  } catch (error) {
    console.error('[MOBILE CHAT] Workspace failed:', error);
    return res.status(500).json({ success: false, error: 'Chat could not be loaded' });
  }
}

export async function mobileChatMessages(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  try {
    const auth = await activeChatDevice(req, res); if (!auth) return;
    const conversationId = parseUuid(req.params.conversationId);
    const after = parseChatAfter(req.query.after);
    if (!conversationId || after === undefined) return res.status(400).json({ success: false, error: 'Invalid chat cursor' });
    const result = await loadMobileChatMessages(auth.staffId, conversationId, after);
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE CHAT] Messages failed:', error);
    return res.status(500).json({ success: false, error: 'Messages could not be loaded' });
  }
}

export async function mobileStartPrivateChat(req: Request, res: Response) {
  try {
    const auth = await activeChatDevice(req, res); if (!auth) return;
    const otherStaffId = parseUuid(req.body?.otherStaffId);
    if (!otherStaffId) return res.status(400).json({ success: false, error: 'A valid staff member is required' });
    const result = await startMobilePrivateChat(auth.staffId, otherStaffId);
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE CHAT] Start private chat failed:', error);
    return res.status(500).json({ success: false, error: 'Conversation could not be started' });
  }
}

export async function mobileMarkChatRead(req: Request, res: Response) {
  try {
    const auth = await activeChatDevice(req, res); if (!auth) return;
    const conversationId = parseUuid(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ success: false, error: 'A valid conversation is required' });
    const result = await markMobileChatRead(auth.staffId, conversationId);
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE CHAT] Mark read failed:', error);
    return res.status(500).json({ success: false, error: 'Conversation could not be marked read' });
  }
}

export async function mobileChatMessageMutation(req: Request, res: Response) {
  try {
    const auth = await activeChatDevice(req, res); if (!auth) return;
    const parsed = parseMobileChatMessage(req.body);
    if (!parsed.input) return res.status(400).json({ success: false, error: parsed.error });
    const result = await saveMobileChatMessage({ ...auth, input: parsed.input });
    return res.status(result.httpStatus).json(result.response);
  } catch (error) {
    console.error('[MOBILE CHAT] Send failed:', error);
    return res.status(500).json({ success: false, error: 'Message could not be sent' });
  }
}
