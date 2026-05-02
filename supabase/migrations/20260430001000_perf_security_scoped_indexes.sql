-- Non-destructive performance indexes for secured, role-scoped endpoints.
-- These speed up mentor/student filtering and leave dashboards without changing data.

CREATE INDEX IF NOT EXISTS idx_students_active_hifz_mentor_name
    ON public.students (hifz_mentor_id, name)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_active_school_mentor_name
    ON public.students (school_mentor_id, name)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_active_madrasa_mentor_name
    ON public.students (madrasa_mentor_id, name)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_student_leaves_type_created
    ON public.student_leaves (leave_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_leaves_status_start
    ON public.student_leaves (status, start_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_student_leaves_student_status
    ON public.student_leaves (student_id, status);

CREATE INDEX IF NOT EXISTS idx_student_leaves_group_status
    ON public.student_leaves (group_id, status)
    WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_leaves_institutional_status
    ON public.student_leaves (institutional_leave_id, status)
    WHERE institutional_leave_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_movements_leave_direction_timestamp
    ON public.student_movements (leave_id, direction, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_events_date
    ON public.events (start_date, start_time);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
    ON public.chat_messages (conversation_id, created_at DESC);
