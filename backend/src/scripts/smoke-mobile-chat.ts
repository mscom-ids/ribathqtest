import crypto from 'node:crypto';
import { closeDatabasePool, db } from '../config/db';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const email = process.env.STAGING_TEST_MENTOR_EMAIL;
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;

if (!email || !password) throw new Error('Missing staging mentor credentials');

async function request(path: string, accessToken: string, deviceId: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-device-id': deviceId,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error(`${path} returned ${response.status}: ${raw.slice(0, 160)}`); }
  return { response, json };
}

let mutationId: string | null = null;
let conversationId: string | null = null;
let createdConversation = false;
let staffId: string | null = null;

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      installationId: crypto.randomUUID(),
      platform: 'android',
      deviceName: 'mentor-chat-smoke',
      appVersion: '0.5.0-test',
      osVersion: process.platform,
      pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const token = String(login.accessToken);
  const deviceId = String(login.device.id);
  staffId = String(login.user?.id || '');

  try {
    const workspace = await request('/chat/workspace', token, deviceId);
    if (!workspace.response.ok || !workspace.json.success || !Array.isArray(workspace.json.staff)) {
      throw new Error(`Chat workspace contract failed: ${JSON.stringify(workspace.json).slice(0, 500)}`);
    }
    const peer = workspace.json.staff[0];
    if (!peer?.id) throw new Error('The staging project needs one other active staff member for the chat smoke test.');

    const started = await request('/chat/conversations/private', token, deviceId, {
      method: 'POST',
      body: JSON.stringify({ otherStaffId: peer.id }),
    });
    if (!started.response.ok || !started.json.conversationId) throw new Error(`Start chat failed: ${JSON.stringify(started.json)}`);
    conversationId = String(started.json.conversationId);
    createdConversation = Boolean(started.json.isNew);

    mutationId = crypto.randomUUID();
    const payload = { mutationId, conversationId, content: 'Native mentor chat smoke test — removed automatically' };
    const sent = await request('/mutations/chat-messages', token, deviceId, { method: 'POST', body: JSON.stringify(payload) });
    if (!sent.response.ok || sent.json.status !== 'applied' || sent.json.message?.mutationId !== mutationId) {
      throw new Error(`Send contract failed: ${JSON.stringify(sent.json)}`);
    }

    const replay = await request('/mutations/chat-messages', token, deviceId, { method: 'POST', body: JSON.stringify(payload) });
    if (!replay.response.ok || replay.json.replayed !== true || replay.json.message?.id !== sent.json.message.id) {
      throw new Error(`Idempotent replay failed: ${JSON.stringify(replay.json)}`);
    }

    const cursor = encodeURIComponent(new Date(new Date(sent.json.message.createdAt).getTime() - 1).toISOString());
    const messages = await request(`/chat/conversations/${conversationId}/messages?after=${cursor}`, token, deviceId);
    const matches = Array.isArray(messages.json.messages)
      ? messages.json.messages.filter((message: any) => message.mutationId === mutationId)
      : [];
    if (!messages.response.ok || matches.length !== 1) {
      throw new Error(`Incremental message fetch failed: ${JSON.stringify(messages.json).slice(0, 500)}`);
    }

    const read = await request(`/chat/conversations/${conversationId}/read`, token, deviceId, { method: 'PUT', body: '{}' });
    if (!read.response.ok || !read.json.success) throw new Error(`Mark read failed: ${JSON.stringify(read.json)}`);

    console.log(JSON.stringify({
      success: true,
      conversations: workspace.json.conversations.length,
      staffChoices: workspace.json.staff.length,
      privateConversationStarted: true,
      idempotentReplay: replay.json.replayed,
      incrementalMessageCount: matches.length,
      markedRead: read.json.success,
    }));
  } finally {
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-device-id': deviceId, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, refreshToken: login.refreshToken }),
    }).catch(() => undefined);
  }
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => {
    if (mutationId && staffId) {
      await db.query('DELETE FROM chat_messages WHERE sender_id = $1 AND mobile_mutation_id = $2', [staffId, mutationId]).catch(() => undefined);
      await db.query('DELETE FROM mobile_mutation_receipts WHERE staff_id = $1 AND mutation_id = $2', [staffId, mutationId]).catch(() => undefined);
    }
    if (createdConversation && conversationId) {
      const remaining = await db.query('SELECT COUNT(*)::int AS count FROM chat_messages WHERE conversation_id = $1', [conversationId]).catch(() => null);
      if (remaining?.rows[0]?.count === 0) {
        await db.query('DELETE FROM chat_participants WHERE conversation_id = $1', [conversationId]).catch(() => undefined);
        await db.query('DELETE FROM chat_conversations WHERE id = $1', [conversationId]).catch(() => undefined);
      }
    }
    await closeDatabasePool();
  });
