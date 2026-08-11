-- Cover the mentor attendance range-loader without rewriting attendance data.
-- These indexes contain every column projected by its date-range subquery, so
-- PostgreSQL can use index-only scans once the visibility map permits it.

CREATE INDEX IF NOT EXISTS idx_attendance_cancellations_date_range_cover
    ON public.attendance_cancellations (date, schedule_id)
    INCLUDE (cancelled_standards);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_report_range_cover
    ON public.attendance_schedules (effective_from, effective_until)
    INCLUDE (id, class_type, name, standards, day_of_week, start_time, end_time);

-- attendance_marks already has the equivalent covering index
-- idx_attendance_marks_date_schedule_marked_by from the existing performance
-- migrations. Recreating it here would only add write and storage overhead.

ANALYZE public.attendance_cancellations;
ANALYZE public.attendance_schedules;
ANALYZE public.attendance_marks;
