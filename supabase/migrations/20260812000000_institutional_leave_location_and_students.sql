-- Additive support for institutional leave location and individual targeting.
-- Existing leaves remain outside-campus, class/institution scoped records.

ALTER TABLE public.institutional_leaves
    ADD COLUMN IF NOT EXISTS campus_location text NOT NULL DEFAULT 'outside',
    ADD COLUMN IF NOT EXISTS target_student_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.institutional_leaves
    DROP CONSTRAINT IF EXISTS institutional_leaves_campus_location_check;

ALTER TABLE public.institutional_leaves
    ADD CONSTRAINT institutional_leaves_campus_location_check
    CHECK (campus_location IN ('inside', 'outside'));

ALTER TABLE public.attendance_cancellations
    ADD COLUMN IF NOT EXISTS cancelled_students jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.institutional_leaves.campus_location IS
    'inside keeps students on campus while excusing sessions; outside is an exit permission window';
COMMENT ON COLUMN public.institutional_leaves.target_student_ids IS
    'Explicit student targets; empty means class or entire-institution targeting';
COMMENT ON COLUMN public.attendance_cancellations.cancelled_students IS
    'Admission numbers excused individually without cancelling classmates';

ANALYZE public.institutional_leaves;
ANALYZE public.attendance_cancellations;
