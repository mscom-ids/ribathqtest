"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteConversation = exports.pollMessages = exports.getStaffList = exports.deleteMessage = exports.markAsRead = exports.sendImageMessage = exports.sendMessage = exports.getMessages = exports.getGroupMembers = exports.updateGroupMembers = exports.createGroupChat = exports.startPrivateChat = exports.getConversations = void 0;
const db_1 = require("../config/db");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// ── Multer for chat image uploads ────────────────────────────────────────────
const chatStorage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const dir = path_1.default.join(__dirname, '../../public/chat-images');
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'chat-' + suffix + path_1.default.extname(file.originalname));
    }
});
const chatUpload = (0, multer_1.default)({
    storage: chatStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const ok = /jpeg|jpg|png|gif|webp/.test(path_1.default.extname(file.originalname).toLowerCase());
        ok ? cb(null, true) : cb(new Error('Images only'));
    }
}).single('image');
// ── Helper: check if user is participant ─────────────────────────────────────
async function isParticipant(conversationId, staffId) {
    const r = await db_1.db.query('SELECT 1 FROM chat_participants WHERE conversation_id = $1 AND staff_id = $2', [conversationId, staffId]);
    return r.rows.length > 0;
}
// ── Helper: get staff id from auth user ──────────────────────────────────────
async function getStaffId(user) {
    const r = await db_1.db.query('SELECT id FROM staff WHERE profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
    return r.rows.length > 0 ? r.rows[0].id : null;
}
// ═══════════════════════════════════════════════════════════════════════════════
// GET /chat/conversations — List all my conversations
// ═══════════════════════════════════════════════════════════════════════════════
const getConversations = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const result = await db_1.db.query(`
            SELECT 
                c.id, c.type, c.name, c.created_at,
                cp.last_read_at,
                -- Last message
                lm.content as last_message,
                lm.image_url as last_message_image,
                lm.created_at as last_message_at,
                lm_sender.name as last_message_sender,
                -- Unread count
                (SELECT COUNT(*) FROM chat_messages cm2 
                 WHERE cm2.conversation_id = c.id 
                 AND cm2.created_at > COALESCE(cp.last_read_at, cp.joined_at)
                 AND cm2.sender_id != $1
                 AND cm2.is_deleted = false)::int as unread_count,
                -- For private chats: the other person's name/photo
                CASE WHEN c.type = 'private' THEN other_staff.name END as other_name,
                CASE WHEN c.type = 'private' THEN other_staff.photo_url END as other_photo,
                CASE WHEN c.type = 'private' THEN other_staff.id END as other_staff_id,
                -- Participant count for groups
                CASE WHEN c.type = 'group' THEN 
                    (SELECT COUNT(*) FROM chat_participants WHERE conversation_id = c.id)::int
                END as member_count
            FROM chat_participants cp
            JOIN chat_conversations c ON cp.conversation_id = c.id
            -- Latest message subquery
            LEFT JOIN LATERAL (
                SELECT content, image_url, created_at, sender_id
                FROM chat_messages 
                WHERE conversation_id = c.id AND is_deleted = false
                ORDER BY created_at DESC LIMIT 1
            ) lm ON true
            LEFT JOIN staff lm_sender ON lm.sender_id = lm_sender.id
            -- For private: get other participant
            LEFT JOIN LATERAL (
                SELECT s.id, s.name, s.photo_url
                FROM chat_participants cp2
                JOIN staff s ON cp2.staff_id = s.id
                WHERE cp2.conversation_id = c.id AND cp2.staff_id != $1
                LIMIT 1
            ) other_staff ON c.type = 'private'
            WHERE cp.staff_id = $1
            ORDER BY COALESCE(lm.created_at, c.created_at) DESC
        `, [staffId]);
        res.json({ success: true, conversations: result.rows });
    }
    catch (err) {
        console.error('Error fetching conversations:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getConversations = getConversations;
// ═══════════════════════════════════════════════════════════════════════════════
// POST /chat/conversations/private — Start or get private chat
// ═══════════════════════════════════════════════════════════════════════════════
const startPrivateChat = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const { otherStaffId } = req.body;
        if (!otherStaffId)
            return res.status(400).json({ success: false, error: 'otherStaffId required' });
        if (otherStaffId === staffId)
            return res.status(400).json({ success: false, error: 'Cannot chat with yourself' });
        // Check if private chat already exists between these two
        const existing = await db_1.db.query(`
            SELECT c.id FROM chat_conversations c
            WHERE c.type = 'private'
            AND EXISTS (SELECT 1 FROM chat_participants WHERE conversation_id = c.id AND staff_id = $1)
            AND EXISTS (SELECT 1 FROM chat_participants WHERE conversation_id = c.id AND staff_id = $2)
        `, [staffId, otherStaffId]);
        if (existing.rows.length > 0) {
            return res.json({ success: true, conversationId: existing.rows[0].id, isNew: false });
        }
        // Create new private conversation
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            const convRes = await client.query(`INSERT INTO chat_conversations (type) VALUES ('private') RETURNING id`);
            const convId = convRes.rows[0].id;
            await client.query('INSERT INTO chat_participants (conversation_id, staff_id) VALUES ($1, $2), ($1, $3)', [convId, staffId, otherStaffId]);
            await client.query('COMMIT');
            res.json({ success: true, conversationId: convId, isNew: true });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Error starting private chat:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.startPrivateChat = startPrivateChat;
// ═══════════════════════════════════════════════════════════════════════════════
// POST /chat/conversations/group — Create group (admin/principal only)
// ═══════════════════════════════════════════════════════════════════════════════
const createGroupChat = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const { name, memberIds } = req.body;
        if (!name || !memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ success: false, error: 'name and memberIds required' });
        }
        // Ensure creator is included in members
        const allMembers = [...new Set([staffId, ...memberIds])];
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            const convRes = await client.query(`INSERT INTO chat_conversations (type, name, created_by) VALUES ('group', $1, $2) RETURNING id`, [name, staffId]);
            const convId = convRes.rows[0].id;
            // Bulk-insert all participants in one round trip (was N round trips).
            await client.query(`INSERT INTO chat_participants (conversation_id, staff_id)
                 SELECT $1, sid FROM unnest($2::uuid[]) AS t(sid)
                 ON CONFLICT DO NOTHING`, [convId, allMembers]);
            await client.query('COMMIT');
            res.json({ success: true, conversationId: convId });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Error creating group:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.createGroupChat = createGroupChat;
// ═══════════════════════════════════════════════════════════════════════════════
// PUT /chat/conversations/:id/members — Add/remove members (admin only)
// ═══════════════════════════════════════════════════════════════════════════════
const updateGroupMembers = async (req, res) => {
    try {
        const id = req.params.id;
        const { addIds, removeIds } = req.body;
        // Verify it's a group
        const conv = await db_1.db.query('SELECT type, created_by FROM chat_conversations WHERE id = $1', [id]);
        if (conv.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Not found' });
        if (conv.rows[0].type !== 'group')
            return res.status(400).json({ success: false, error: 'Not a group' });
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            if (addIds && Array.isArray(addIds)) {
                for (const memberId of addIds) {
                    await client.query('INSERT INTO chat_participants (conversation_id, staff_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, memberId]);
                }
            }
            if (removeIds && Array.isArray(removeIds)) {
                // Don't allow removing the creator
                const creator = conv.rows[0].created_by;
                const safeRemove = removeIds.filter((rid) => rid !== creator);
                if (safeRemove.length > 0) {
                    await client.query('DELETE FROM chat_participants WHERE conversation_id = $1 AND staff_id = ANY($2)', [id, safeRemove]);
                }
            }
            await client.query('COMMIT');
            res.json({ success: true });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Error updating members:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.updateGroupMembers = updateGroupMembers;
// ═══════════════════════════════════════════════════════════════════════════════
// GET /chat/conversations/:id/members — Get group members
// ═══════════════════════════════════════════════════════════════════════════════
const getGroupMembers = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const id = req.params.id;
        if (!await isParticipant(id, staffId)) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }
        const result = await db_1.db.query(`
            SELECT s.id, s.name, s.photo_url, s.role, cp.joined_at
            FROM chat_participants cp
            JOIN staff s ON cp.staff_id = s.id
            WHERE cp.conversation_id = $1
            ORDER BY s.name
        `, [id]);
        res.json({ success: true, members: result.rows });
    }
    catch (err) {
        console.error('Error getting members:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getGroupMembers = getGroupMembers;
// ═══════════════════════════════════════════════════════════════════════════════
// GET /chat/conversations/:id/messages — Get messages (paginated)
// ═══════════════════════════════════════════════════════════════════════════════
const getMessages = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const id = req.params.id;
        if (!await isParticipant(id, staffId)) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }
        const limit = parseInt(req.query.limit) || 50;
        const before = req.query.before; // cursor: load messages before this timestamp
        let query = `
            SELECT m.id, m.content, m.image_url, m.is_deleted, m.created_at, m.sender_id,
                   s.name as sender_name, s.photo_url as sender_photo
            FROM chat_messages m
            JOIN staff s ON m.sender_id = s.id
            WHERE m.conversation_id = $1
        `;
        const params = [id];
        if (before) {
            query += ` AND m.created_at < $${params.length + 1}`;
            params.push(before);
        }
        query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);
        const result = await db_1.db.query(query, params);
        // Return in chronological order (reverse the DESC)
        res.json({ success: true, messages: result.rows.reverse() });
    }
    catch (err) {
        console.error('Error fetching messages:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getMessages = getMessages;
// ═══════════════════════════════════════════════════════════════════════════════
// POST /chat/conversations/:id/messages — Send text message
// ═══════════════════════════════════════════════════════════════════════════════
const sendMessage = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const id = req.params.id;
        if (!await isParticipant(id, staffId)) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }
        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, error: 'Message content required' });
        }
        const result = await db_1.db.query(`INSERT INTO chat_messages (conversation_id, sender_id, content) 
             VALUES ($1, $2, $3) RETURNING id, created_at`, [id, staffId, content.trim()]);
        // Update sender's last_read_at
        await db_1.db.query('UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND staff_id = $2', [id, staffId]);
        res.json({ success: true, message: { id: result.rows[0].id, created_at: result.rows[0].created_at } });
    }
    catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.sendMessage = sendMessage;
// ═══════════════════════════════════════════════════════════════════════════════
// POST /chat/conversations/:id/messages/image — Send image message
// ═══════════════════════════════════════════════════════════════════════════════
const sendImageMessage = async (req, res) => {
    const user = req.user;
    chatUpload(req, res, async (err) => {
        if (err)
            return res.status(400).json({ success: false, error: err.message });
        if (!req.file)
            return res.status(400).json({ success: false, error: 'No image uploaded' });
        try {
            const staffId = await getStaffId(user);
            if (!staffId)
                return res.status(404).json({ success: false, error: 'Staff not found' });
            const id = req.params.id;
            if (!await isParticipant(id, staffId)) {
                return res.status(403).json({ success: false, error: 'Not a participant' });
            }
            const imageUrl = `/public/chat-images/${req.file.filename}`;
            const caption = req.body.caption || null;
            const result = await db_1.db.query(`INSERT INTO chat_messages (conversation_id, sender_id, content, image_url)
                 VALUES ($1, $2, $3, $4) RETURNING id, created_at`, [id, staffId, caption, imageUrl]);
            await db_1.db.query('UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND staff_id = $2', [id, staffId]);
            res.json({ success: true, message: { id: result.rows[0].id, created_at: result.rows[0].created_at, image_url: imageUrl } });
        }
        catch (e) {
            console.error('Error sending image:', e);
            res.status(500).json({ success: false, error: 'Failed' });
        }
    });
};
exports.sendImageMessage = sendImageMessage;
// ═══════════════════════════════════════════════════════════════════════════════
// PUT /chat/conversations/:id/read — Mark conversation as read
// ═══════════════════════════════════════════════════════════════════════════════
const markAsRead = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const id = req.params.id;
        await db_1.db.query('UPDATE chat_participants SET last_read_at = NOW() WHERE conversation_id = $1 AND staff_id = $2', [id, staffId]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error marking read:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.markAsRead = markAsRead;
// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /chat/messages/:messageId — Delete a message (admin only)
// ═══════════════════════════════════════════════════════════════════════════════
const deleteMessage = async (req, res) => {
    try {
        const user = req.user;
        const staffRes = await db_1.db.query('SELECT id, role FROM staff WHERE profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
        if (staffRes.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        const operator = staffRes.rows[0];
        if (operator.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only admins can delete messages' });
        }
        const messageId = req.params.messageId;
        await db_1.db.query('UPDATE chat_messages SET is_deleted = true, deleted_by = $1, content = NULL, image_url = NULL WHERE id = $2', [operator.id, messageId]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.deleteMessage = deleteMessage;
// ═══════════════════════════════════════════════════════════════════════════════
// GET /chat/staff-list — List all staff for chat
// ═══════════════════════════════════════════════════════════════════════════════
const getStaffList = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        const result = await db_1.db.query(`SELECT id, name, photo_url, role FROM staff WHERE id != $1 ORDER BY name`, [staffId]);
        res.json({ success: true, staff: result.rows });
    }
    catch (err) {
        console.error('Error fetching staff list:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getStaffList = getStaffList;
// ═══════════════════════════════════════════════════════════════════════════════
// GET /chat/poll/:conversationId — Poll for new messages since timestamp
// ═══════════════════════════════════════════════════════════════════════════════
const pollMessages = async (req, res) => {
    try {
        const user = req.user;
        const staffId = await getStaffId(user);
        if (!staffId)
            return res.status(404).json({ success: false, error: 'Staff not found' });
        const conversationId = req.params.conversationId;
        const since = req.query.since;
        if (!await isParticipant(conversationId, staffId)) {
            return res.status(403).json({ success: false, error: 'Not a participant' });
        }
        let query = `
            SELECT m.id, m.content, m.image_url, m.is_deleted, m.created_at, m.sender_id,
                   s.name as sender_name, s.photo_url as sender_photo
            FROM chat_messages m
            JOIN staff s ON m.sender_id = s.id
            WHERE m.conversation_id = $1
        `;
        const params = [conversationId];
        if (since) {
            query += ` AND m.created_at > $2`;
            params.push(since);
        }
        query += ` ORDER BY m.created_at ASC`;
        const result = await db_1.db.query(query, params);
        res.json({ success: true, messages: result.rows });
    }
    catch (err) {
        console.error('Error polling:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.pollMessages = pollMessages;
// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /chat/conversations/:id — Delete entire conversation (admin only)
// ═══════════════════════════════════════════════════════════════════════════════
const deleteConversation = async (req, res) => {
    try {
        const user = req.user;
        const staffRes = await db_1.db.query('SELECT id, role FROM staff WHERE profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
        if (staffRes.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        const operator = staffRes.rows[0];
        if (operator.role !== 'admin') {
            return res.status(403).json({ success: false, error: 'Only admins can delete conversations' });
        }
        const id = req.params.id;
        const conv = await db_1.db.query('SELECT id FROM chat_conversations WHERE id = $1', [id]);
        if (conv.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            // Delete messages and participants (they have a foreign key to conversation_id)
            await client.query('DELETE FROM chat_messages WHERE conversation_id = $1', [id]);
            await client.query('DELETE FROM chat_participants WHERE conversation_id = $1', [id]);
            // Delete the conversation itself
            await client.query('DELETE FROM chat_conversations WHERE id = $1', [id]);
            await client.query('COMMIT');
            res.json({ success: true, message: 'Conversation deleted successfully' });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Error deleting conversation:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.deleteConversation = deleteConversation;
