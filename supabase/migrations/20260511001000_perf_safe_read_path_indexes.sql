-- Additive read-path indexes for performance-heavy ERP screens.
-- Safe to re-run: every statement uses IF NOT EXISTS and does not modify data.

-- Attendance dashboard reads cancellations by date range, separate from schedule.
CREATE INDEX IF NOT EXISTS idx_attendance_cancellations_date
    ON public.attendance_cancellations (date);

-- Supports both legacy UNIQUE(schedule_id, date) installs and newer
-- per-mentor completion checks that filter or upsert by schedule/date/marked_by.
CREATE INDEX IF NOT EXISTS idx_attendance_marks_schedule_date_marked_by
    ON public.attendance_marks (schedule_id, date, marked_by);

-- Active schedules are repeatedly filtered by academic year, day, and active window.
CREATE INDEX IF NOT EXISTS idx_attendance_schedules_year_day_active_window
    ON public.attendance_schedules (academic_year_id, day_of_week, effective_from, effective_until)
    WHERE is_deleted IS NOT TRUE;

-- Student roster lookups filter by status, standard, and mentor assignment.
CREATE INDEX IF NOT EXISTS idx_students_active_standard_hifz_mentor
    ON public.students (standard, hifz_mentor_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_active_standard_school_mentor
    ON public.students (standard, school_mentor_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_active_standard_madrasa_mentor
    ON public.students (standard, madrasa_mentor_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_students_status_name
    ON public.students (status, name);

-- Hifz monthly reports and progress summaries scan by mode/date/student.
CREATE INDEX IF NOT EXISTS idx_hifz_mode_entry_student
    ON public.hifz_logs (mode, entry_date DESC, student_id);

CREATE INDEX IF NOT EXISTS idx_hifz_new_verses_progress
    ON public.hifz_logs (student_id, surah_name, start_v, end_v)
    WHERE mode = 'New Verses'
      AND surah_name IS NOT NULL
      AND start_v IS NOT NULL
      AND end_v IS NOT NULL;

-- Manual report reads and staff profile summary pages.
CREATE INDEX IF NOT EXISTS idx_monthly_reports_month_student
    ON public.monthly_reports (report_month, student_id);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_student_month
    ON public.monthly_reports (student_id, report_month DESC);

-- Staff selectors and role-filtered reports.
CREATE INDEX IF NOT EXISTS idx_staff_active_role_name
    ON public.staff (is_active, role, name);

ANALYZE public.attendance_cancellations;
ANALYZE public.attendance_marks;
ANALYZE public.attendance_schedules;
ANALYZE public.students;
ANALYZE public.hifz_logs;
ANALYZE public.monthly_reports;
ANALYZE public.staff;
