-- Add admin-only Outdoor movements and companion details for outside-campus leaves.

ALTER TABLE public.student_leaves
    ADD COLUMN IF NOT EXISTS companion_name TEXT,
    ADD COLUMN IF NOT EXISTS companion_relationship TEXT;

ALTER TABLE public.student_leaves
    ALTER COLUMN end_datetime DROP NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'student_leaves_leave_type_check'
          AND conrelid = 'public.student_leaves'::regclass
    ) THEN
        ALTER TABLE public.student_leaves DROP CONSTRAINT student_leaves_leave_type_check;
    END IF;
END $$;

ALTER TABLE public.student_leaves
    ADD CONSTRAINT student_leaves_leave_type_check
    CHECK (leave_type IN ('internal', 'personal', 'institutional', 'out-campus', 'on-campus', 'outdoor'));

CREATE INDEX IF NOT EXISTS idx_student_leaves_outdoor_open
    ON public.student_leaves (leave_type, status, start_datetime)
    WHERE leave_type = 'outdoor' AND status = 'outside';
