CREATE INDEX IF NOT EXISTS idx_attendance_cancellations_schedule_id
    ON public.attendance_cancellations (schedule_id);

CREATE INDEX IF NOT EXISTS idx_attendance_cancellations_reason
    ON public.attendance_cancellations (reason);

CREATE INDEX IF NOT EXISTS idx_attendance_marks_schedule_id
    ON public.attendance_marks (schedule_id);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_weekday_time
    ON public.attendance_schedules (day_of_week, start_time, end_time)
    WHERE is_deleted = false OR is_deleted IS NULL;

ANALYZE public.attendance_cancellations;
ANALYZE public.attendance_marks;
ANALYZE public.attendance_schedules;
