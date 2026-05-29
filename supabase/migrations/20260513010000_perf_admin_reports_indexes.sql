-- Speed up common admin dashboard/report reads.
-- These are safe additive indexes only; no data is changed.

CREATE INDEX IF NOT EXISTS idx_staff_profile_id
    ON public.staff (profile_id);

CREATE INDEX IF NOT EXISTS idx_staff_email
    ON public.staff (email);

CREATE INDEX IF NOT EXISTS idx_staff_active_name
    ON public.staff (is_active, name);

CREATE INDEX IF NOT EXISTS idx_staff_active_role_name
    ON public.staff (is_active, role, name);

CREATE INDEX IF NOT EXISTS idx_events_start_date_time
    ON public.events (start_date, start_time);

CREATE INDEX IF NOT EXISTS idx_mentor_delegations_status_created
    ON public.mentor_delegations (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mentor_delegations_created
    ON public.mentor_delegations (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_participants_staff_conversation
    ON public.chat_participants (staff_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation_staff
    ON public.chat_participants (conversation_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_active_created
    ON public.chat_messages (conversation_id, is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_unread_lookup
    ON public.chat_messages (conversation_id, created_at, sender_id)
    WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_student_leaves_outside_start
    ON public.student_leaves (status, start_datetime DESC)
    WHERE status = 'outside';

CREATE INDEX IF NOT EXISTS idx_student_leaves_type_created
    ON public.student_leaves (leave_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_leaves_institutional_status
    ON public.student_leaves (institutional_leave_id, status)
    WHERE institutional_leave_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_institutional_leaves_created
    ON public.institutional_leaves (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_movements_latest_exit
    ON public.student_movements (leave_id, direction, timestamp DESC)
    WHERE direction = 'out';

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_effective_window
    ON public.attendance_schedules (effective_from, effective_until, day_of_week);

ANALYZE public.staff;
ANALYZE public.events;
ANALYZE public.mentor_delegations;
ANALYZE public.chat_participants;
ANALYZE public.chat_messages;
ANALYZE public.institutional_leaves;
ANALYZE public.student_leaves;
ANALYZE public.student_movements;
ANALYZE public.attendance_schedules;
