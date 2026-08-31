BEGIN;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS mobile_mutation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_mobile_mutation
  ON public.chat_messages (sender_id, mobile_mutation_id)
  WHERE mobile_mutation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.publish_chat_message_mobile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_conversation_id uuid := COALESCE(NEW.conversation_id, OLD.conversation_id);
  changed_message_id text := COALESCE(NEW.id, OLD.id)::text;
  changed_version bigint := GREATEST(
    1,
    (extract(epoch FROM COALESCE(NEW.created_at, OLD.created_at, now())) * 1000)::bigint
  );
BEGIN
  INSERT INTO public.mobile_sync_changes (
    audience_staff_id, entity_type, entity_id, operation, entity_version, payload
  )
  SELECT DISTINCT device.staff_id,
         'chat_message',
         changed_message_id,
         'invalidate',
         changed_version,
         jsonb_build_object('conversation_id', changed_conversation_id)
  FROM public.chat_participants participant
  JOIN public.mobile_devices device ON device.staff_id = participant.staff_id
  WHERE participant.conversation_id = changed_conversation_id
    AND device.revoked_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_chat_message_mobile_change ON public.chat_messages;
CREATE TRIGGER trg_publish_chat_message_mobile_change
AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.publish_chat_message_mobile_change();

COMMIT;
