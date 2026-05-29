-- Balanced follow-up indexes for chat and delegation hot paths.
-- Safe additive migration only: no source rows are changed or deleted.

CREATE INDEX IF NOT EXISTS idx_chat_conversations_private
    ON public.chat_conversations (type, created_at DESC)
    WHERE type = 'private';

CREATE INDEX IF NOT EXISTS idx_chat_participants_staff_joined
    ON public.chat_participants (staff_id, joined_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_active
    ON public.chat_messages (conversation_id, created_at DESC)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_mentor_delegations_from_to_status_student
    ON public.mentor_delegations (from_staff_id, to_staff_id, status, student_id);

CREATE INDEX IF NOT EXISTS idx_mentor_delegations_to_status_created
    ON public.mentor_delegations (to_staff_id, status, created_at DESC);

ANALYZE public.chat_conversations;
ANALYZE public.chat_participants;
ANALYZE public.chat_messages;
ANALYZE public.mentor_delegations;
