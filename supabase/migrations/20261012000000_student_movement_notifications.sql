CREATE TABLE public.student_movement_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leave_id UUID NOT NULL REFERENCES public.student_leaves(id) ON DELETE CASCADE,
    event TEXT NOT NULL CHECK (event IN ('student_exit', 'student_return')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'api_accepted', 'failed', 'uncertain', 'skipped')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processing_started_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (leave_id, event)
);

CREATE INDEX student_movement_notifications_pending_idx
    ON public.student_movement_notifications(next_attempt_at, created_at)
    WHERE status = 'pending';

CREATE INDEX student_movement_notifications_processing_idx
    ON public.student_movement_notifications(processing_started_at)
    WHERE status = 'processing';

ALTER TABLE public.student_movement_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_movement_notifications FROM anon, authenticated;
