-- Follow-up read-path indexes for student lists, reports, and Hifz history.
-- Safe additive migration only: no data is deleted or rewritten.

CREATE INDEX IF NOT EXISTS idx_students_status_adm_no
    ON public.students (status, adm_no);

CREATE INDEX IF NOT EXISTS idx_hifz_student_entry_created_progress
    ON public.hifz_logs (student_id, entry_date DESC, created_at DESC)
    INCLUDE (juz_number, start_page, end_page)
    WHERE juz_number IS NOT NULL
       OR start_page IS NOT NULL
       OR end_page IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_attendance_marks_student_date_schedule
    ON public.student_attendance_marks (student_id, date, schedule_id)
    INCLUDE (status);

CREATE INDEX IF NOT EXISTS idx_attendance_marks_date_schedule_marked_by
    ON public.attendance_marks (date, schedule_id, marked_by);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_day_window_start_active
    ON public.attendance_schedules (day_of_week, effective_from, effective_until, start_time)
    WHERE is_deleted IS NOT TRUE;

ANALYZE public.students;
ANALYZE public.hifz_logs;
ANALYZE public.student_attendance_marks;
ANALYZE public.attendance_marks;
ANALYZE public.attendance_schedules;
