export type MobileChatMessageInput = {
  mutationId: string;
  conversationId: string;
  content: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMobileChatMessage(body: unknown): { input?: MobileChatMessageInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid chat message payload' };
  const value = body as Record<string, unknown>;
  const mutationId = typeof value.mutationId === 'string' ? value.mutationId.trim() : '';
  const conversationId = typeof value.conversationId === 'string' ? value.conversationId.trim() : '';
  const content = typeof value.content === 'string' ? value.content.trim() : '';
  if (!UUID_PATTERN.test(mutationId)) return { error: 'A valid mutationId is required' };
  if (!UUID_PATTERN.test(conversationId)) return { error: 'A valid conversation is required' };
  if (!content || content.length > 4000) return { error: 'Message content must contain 1 to 4000 characters' };
  return { input: { mutationId, conversationId, content } };
}

export function parseUuid(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return UUID_PATTERN.test(text) ? text : null;
}

export function parseChatAfter(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  const text = typeof value === 'string' ? value.trim() : '';
  const date = new Date(text);
  return text && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
}
