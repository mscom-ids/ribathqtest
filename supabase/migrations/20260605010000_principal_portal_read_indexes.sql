CREATE INDEX IF NOT EXISTS idx_academic_years_current_start
    ON public.academic_years (is_current, start_date DESC)
    WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_institutional_leaves_range
    ON public.institutional_leaves (start_datetime, end_datetime);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_effective_range
    ON public.attendance_schedules (effective_from, effective_until, day_of_week);

ANALYZE public.academic_years;
ANALYZE public.institutional_leaves;
ANALYZE public.attendance_schedules;
