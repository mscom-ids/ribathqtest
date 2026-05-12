ALTER TABLE public.attendance_cancellations
ADD COLUMN IF NOT EXISTS cancelled_standards JSONB;

COMMENT ON COLUMN public.attendance_cancellations.cancelled_standards IS
'Null or empty means the full schedule is cancelled. Otherwise contains normalized student standard labels cancelled for this schedule/date.';

CREATE INDEX IF NOT EXISTS idx_attendance_cancellations_schedule_date
    ON public.attendance_cancellations (schedule_id, date);

NOTIFY pgrst, 'reload config';
