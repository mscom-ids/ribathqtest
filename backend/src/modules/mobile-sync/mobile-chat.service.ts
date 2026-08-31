import { db } from '../../config/db';
import { invalidateCacheByPrefix } from '../../utils/server-cache';
import { MobileChatMessageInput } from './mobile-chat.validation';

function iso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function messagePayload(row: any) {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    senderName: row.sender_name || 'Staff',
    senderPhoto: row.sender_photo || null,
    content: row.is_deleted ? null : row.content || null,
    imageUrl: row.is_deleted ? null : row.image_url || null,
    deleted: Boolean(row.is_deleted),
    createdAt: iso(row.created_at),
    mutationId: row.mobile_mutation_id || null,
  };
}

function conversationPayload(row: any) {
  return {
    id: String(row.id),
    type: row.type,
    name: row.type === 'private' ? row.other_name || 'Staff' : row.name || 'Group',
    photoUrl: row.type === 'private' ? row.other_photo || null : null,
    otherStaffId: row.other_staff_id || null,
    memberCount: row.member_count === null ? null : Number(row.member_count),
    lastMessage: row.last_message || (row.last_message_image ? 'Photo' : null),
    lastMessageAt: iso(row.last_message_at),
    lastMessageSender: row.last_message_sender || null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: iso(row.created_at),
  };
}

const conversationQuery = `
  SELECT c.id, c.type, c.name, c.created_at, cp.last_read_at,
         latest.content AS last_message, latest.image_url AS last_message_image,
         latest.created_at AS last_message_at, latest_sender.name AS last_message_sender,
         (SELECT COUNT(*) FROM chat_messages unread
          WHERE unread.conversation_id = c.id
            AND unread.created_at > COALESCE(cp.last_read_at, cp.joined_at)
            AND unread.sender_id <> $1 AND unread.is_deleted = false)::int AS unread_count,
         CASE WHEN c.type = 'private' THEN other_staff.name END AS other_name,
         CASE WHEN c.type = 'private' THEN other_staff.photo_url END AS other_photo,
         CASE WHEN c.type = 'private' THEN other_staff.id END AS other_staff_id,
         CASE WHEN c.type = 'group' THEN (SELECT COUNT(*) FROM chat_participants member WHERE member.conversation_id = c.id)::int END AS member_count
  FROM chat_participants cp
  JOIN chat_conversations c ON c.id = cp.conversation_id
  LEFT JOIN LATERAL (
    SELECT message.content, message.image_url, message.created_at, message.sender_id
    FROM chat_messages message
    WHERE message.conversation_id = c.id AND message.is_deleted = false
    ORDER BY message.created_at DESC, message.id DESC LIMIT 1
  ) latest ON true
  LEFT JOIN staff latest_sender ON latest_sender.id = latest.sender_id
  LEFT JOIN LATERAL (
    SELECT staff.id, staff.name, staff.photo_url
    FROM chat_participants other
    JOIN staff ON staff.id = other.staff_id
    WHERE other.conversation_id = c.id AND other.staff_id <> $1 LIMIT 1
  ) other_staff ON c.type = 'private'
  WHERE cp.staff_id = $1
  ORDER BY COALESCE(latest.created_at, c.created_at) DESC, c.id`;

export async function loadMobileChatWorkspace(staffId: string) {
  const [conversations, messages, staff] = await Promise.all([
    db.query(conversationQuery, [staffId]),
    db.query(
      `WITH mine AS (
         SELECT participant.conversation_id FROM chat_participants participant WHERE participant.staff_id = $1
       ), ranked AS (
         SELECT message.*, sender.name AS sender_name, sender.photo_url AS sender_photo,
                row_number() OVER (PARTITION BY message.conversation_id ORDER BY message.created_at DESC, message.id DESC) AS row_number
         FROM chat_messages message
         JOIN mine ON mine.conversation_id = message.conversation_id
         JOIN staff sender ON sender.id = message.sender_id
       )
       SELECT * FROM ranked WHERE row_number <= 60 ORDER BY conversation_id, created_at, id`,
      [staffId],
    ),
    db.query(
      `SELECT id, name, photo_url, role FROM staff
       WHERE id <> $1 AND COALESCE(is_active, true) = true
       ORDER BY name, id LIMIT 500`,
      [staffId],
    ),
  ]);
  return {
    success: true,
    currentStaffId: staffId,
    conversations: conversations.rows.map(conversationPayload),
    messages: messages.rows.map(messagePayload),
    staff: staff.rows.map(row => ({ id: String(row.id), name: row.name, photoUrl: row.photo_url || null, role: row.role || 'staff' })),
    serverTime: new Date().toISOString(),
  };
}

export async function loadMobileChatMessages(staffId: string, conversationId: string, after: string | null) {
  const participant = await db.query(
    'SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND staff_id = $2 LIMIT 1',
    [conversationId, staffId],
  );
  if (!participant.rows[0]) return { httpStatus: 403, response: { success: false, code: 'NOT_PARTICIPANT', error: 'You are no longer a participant in this conversation.' } };
  const result = after
    ? await db.query(
        `SELECT message.*, sender.name AS sender_name, sender.photo_url AS sender_photo
         FROM chat_messages message JOIN staff sender ON sender.id = message.sender_id
         WHERE message.conversation_id = $1 AND message.created_at >= $2::timestamptz
         ORDER BY message.created_at, message.id LIMIT 250`,
        [conversationId, after],
      )
    : await db.query(
        `SELECT * FROM (
           SELECT message.*, sender.name AS sender_name, sender.photo_url AS sender_photo
           FROM chat_messages message JOIN staff sender ON sender.id = message.sender_id
           WHERE message.conversation_id = $1 ORDER BY message.created_at DESC, message.id DESC LIMIT 100
         ) recent ORDER BY recent.created_at, recent.id`,
        [conversationId],
      );
  return { httpStatus: 200, response: { success: true, conversationId, messages: result.rows.map(messagePayload), serverTime: new Date().toISOString() } };
}

export async function startMobilePrivateChat(staffId: string, otherStaffId: string) {
  if (staffId === otherStaffId) return { httpStatus: 400, response: { success: false, error: 'Cannot chat with yourself' } };
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const pair = [staffId, otherStaffId].sort().join(':');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`mobile-chat:${pair}`]);
    const other = await client.query('SELECT id FROM staff WHERE id = $1 AND COALESCE(is_active, true) = true LIMIT 1', [otherStaffId]);
    if (!other.rows[0]) { await client.query('ROLLBACK'); return { httpStatus: 404, response: { success: false, error: 'Staff member is unavailable' } }; }
    const existing = await client.query(
      `SELECT conversation.id FROM chat_conversations conversation
       WHERE conversation.type = 'private'
         AND EXISTS (SELECT 1 FROM chat_participants participant WHERE participant.conversation_id = conversation.id AND participant.staff_id = $1)
         AND EXISTS (SELECT 1 FROM chat_participants participant WHERE participant.conversation_id = conversation.id AND participant.staff_id = $2)
       LIMIT 1`,
      [staffId, otherStaffId],
    );
    let conversationId = existing.rows[0]?.id;
    let isNew = false;
    if (!conversationId) {
      const created = await client.query("INSERT INTO chat_conversations(type, created_by) VALUES ('private', $1) RETURNING id", [staffId]);
      conversationId = created.rows[0].id;
      await client.query(
        `INSERT INTO chat_participants(conversation_id, staff_id)
         SELECT $1, staff_id FROM unnest($2::uuid[]) member(staff_id) ON CONFLICT DO NOTHING`,
        [conversationId, [staffId, otherStaffId]],
      );
      isNew = true;
    }
    await client.query('COMMIT');
    invalidateCacheByPrefix('chat:conversations');
    return { httpStatus: isNew ? 201 : 200, response: { success: true, conversationId: String(conversationId), isNew } };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markMobileChatRead(staffId: string, conversationId: string) {
  const result = await db.query(
    `UPDATE chat_participants SET last_read_at = now()
     WHERE conversation_id = $1 AND staff_id = $2 RETURNING conversation_id`,
    [conversationId, staffId],
  );
  if (!result.rows[0]) return { httpStatus: 403, response: { success: false, error: 'You are no longer a participant in this conversation.' } };
  invalidateCacheByPrefix('chat:conversations');
  return { httpStatus: 200, response: { success: true } };
}

export async function saveMobileChatMessage(args: { staffId: string; device: any; input: MobileChatMessageInput }) {
  const { staffId, device, input } = args;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${staffId}:${input.mutationId}`]);
    const receipt = await client.query(
      'SELECT status, response FROM mobile_mutation_receipts WHERE staff_id = $1 AND mutation_id = $2 LIMIT 1',
      [staffId, input.mutationId],
    );
    if (receipt.rows[0]) {
      await client.query('COMMIT');
      return { httpStatus: receipt.rows[0].status === 'applied' ? 200 : 409, response: { ...(receipt.rows[0].response || {}), replayed: true } };
    }
    const participant = await client.query(
      'SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND staff_id = $2 FOR UPDATE',
      [input.conversationId, staffId],
    );
    if (!participant.rows[0]) {
      await client.query('ROLLBACK');
      return { httpStatus: 403, response: { success: false, code: 'NOT_PARTICIPANT', error: 'You are no longer a participant in this conversation.' } };
    }
    const inserted = await client.query(
      `INSERT INTO chat_messages(conversation_id, sender_id, content, mobile_mutation_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.conversationId, staffId, input.content, input.mutationId],
    );
    const sender = await client.query('SELECT name, photo_url FROM staff WHERE id = $1', [staffId]);
    const message = messagePayload({ ...inserted.rows[0], sender_name: sender.rows[0]?.name, sender_photo: sender.rows[0]?.photo_url });
    await client.query('UPDATE chat_participants SET last_read_at = now() WHERE conversation_id = $1 AND staff_id = $2', [input.conversationId, staffId]);
    const response = { success: true, mutationId: input.mutationId, status: 'applied', replayed: false, message };
    await client.query(
      `INSERT INTO mobile_mutation_receipts(staff_id, device_id, mutation_id, status, response)
       VALUES ($1, $2, $3, 'applied', $4::jsonb)`,
      [staffId, device.id, input.mutationId, JSON.stringify(response)],
    );
    await client.query('COMMIT');
    invalidateCacheByPrefix('chat:conversations');
    return { httpStatus: 201, response };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
