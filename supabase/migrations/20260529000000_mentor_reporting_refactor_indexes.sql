-- Mentor reporting classification and dashboard read-path indexes.
-- These are intentionally idempotent so they can be applied safely on existing deployments.

CREATE INDEX IF NOT EXISTS idx_staff_active_lower_role_name
    ON public.staff (is_active, lower(role), name);

CREATE INDEX IF NOT EXISTS idx_students_status_hifz_mentor_standard
    ON public.students (status, hifz_mentor_id, standard)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_status_school_mentor_standard
    ON public.students (status, school_mentor_id, standard)
    WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_status_madrasa_mentor_standard
    ON public.students (status, madrasa_mentor_id, standard)
    WHERE madrasa_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_marks_marked_by_date_schedule
    ON public.attendance_marks (marked_by, date, schedule_id);

CREATE INDEX IF NOT EXISTS idx_attendance_marks_date_marked_by
    ON public.attendance_marks (date, marked_by);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_active_type_window
    ON public.attendance_schedules (class_type, day_of_week, effective_from, effective_until);

CREATE INDEX IF NOT EXISTS idx_student_attendance_marks_date_student_schedule
    ON public.student_attendance_marks (date, student_id, schedule_id);

CREATE INDEX IF NOT EXISTS idx_student_leaves_status_student_dates
    ON public.student_leaves (status, student_id, start_datetime, end_datetime);

-- The current schema stores cohort information as students.batch_year rather than classes.batch_id.
CREATE INDEX IF NOT EXISTS idx_students_batch_year
    ON public.students (batch_year)
    WHERE batch_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_class_student
    ON public.enrollments (class_id, student_id);
