-- Performance: add indexes on hot-path columns used by attendance, hifz,
-- and mentor-filtered student lookups.
--
-- Apply to live DB with:  psql "$DATABASE_URL" -f <thisFile>
-- All statements use IF NOT EXISTS so re-running is safe.
-- For a zero-lock prod apply, you can re-run individual statements with
-- CREATE INDEX CONCURRENTLY (must run outside a transaction).

-- ── students: every mentor portal filters by these columns ────────────────
-- Partial indexes: only index rows where the FK is set (most rows for a
-- given mentor column are NULL, so this stays small and fast).
CREATE INDEX IF NOT EXISTS idx_students_hifz_mentor
    ON public.students (hifz_mentor_id)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_mentor
    ON public.students (school_mentor_id)
    WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_madrasa_mentor
    ON public.students (madrasa_mentor_id)
    WHERE madrasa_mentor_id IS NOT NULL;

-- Used by getSchedules / getSchedulesForDate count queries
-- (status='active' AND standard = ANY(...) AND <mentor_col> = $)
CREATE INDEX IF NOT EXISTS idx_students_status_standard
    ON public.students (status, standard);

-- ── student_attendance_marks ──────────────────────────────────────────────
-- Note: UNIQUE(schedule_id, student_id, date) already auto-indexes lookups
-- starting with schedule_id. We add the reverse direction for student-first
-- queries (used by getMyStudentsWithStats, daily entry forms, reports).
CREATE INDEX IF NOT EXISTS idx_sam_student_date
    ON public.student_attendance_marks (student_id, date);

-- Used by getDailyAttendanceStats: GROUP BY status WHERE date BETWEEN
CREATE INDEX IF NOT EXISTS idx_sam_date_status
    ON public.student_attendance_marks (date, status);

-- ── attendance_marks ──────────────────────────────────────────────────────
-- Note: UNIQUE(schedule_id, date, marked_by) already covers schedule-first
-- and (schedule_id, date, marked_by) lookups. We add marked_by-first index
-- for the mentor dashboard query: WHERE date BETWEEN AND marked_by = $.
CREATE INDEX IF NOT EXISTS idx_am_marked_by_date
    ON public.attendance_marks (marked_by, date);

-- Used for admin/principal dashboard: WHERE date BETWEEN (no marked_by).
CREATE INDEX IF NOT EXISTS idx_am_date
    ON public.attendance_marks (date);

-- ── attendance_schedules ──────────────────────────────────────────────────
-- Filters: day_of_week + is_deleted + effective_from/until
CREATE INDEX IF NOT EXISTS idx_as_dow_active
    ON public.attendance_schedules (day_of_week)
    WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_as_academic_year
    ON public.attendance_schedules (academic_year_id);

-- ── hifz_logs ─────────────────────────────────────────────────────────────
-- Hot queries: per-student timeline, per-student current surah/juz,
-- date-range monthly report scans.
CREATE INDEX IF NOT EXISTS idx_hifz_student_date
    ON public.hifz_logs (student_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_hifz_student_mode_date
    ON public.hifz_logs (student_id, mode, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_hifz_entry_date
    ON public.hifz_logs (entry_date);

-- ── mentor_delegations ────────────────────────────────────────────────────
-- Existing single-column indexes don't help the (col, status) filter.
CREATE INDEX IF NOT EXISTS idx_md_to_status
    ON public.mentor_delegations (to_staff_id, status);

CREATE INDEX IF NOT EXISTS idx_md_from_status
    ON public.mentor_delegations (from_staff_id, status);

-- ── student_leaves ────────────────────────────────────────────────────────
-- Existing: idx_student_leaves_student_id, idx_student_leaves_status.
-- Add a composite index for the date-overlap query used in attendance
-- (status + start_datetime + end_datetime).
CREATE INDEX IF NOT EXISTS idx_sl_status_dates
    ON public.student_leaves (status, start_datetime, end_datetime);

-- ── staff_attendance ──────────────────────────────────────────────────────
-- Used by getDailyAttendanceStats: GROUP BY status WHERE date BETWEEN
CREATE INDEX IF NOT EXISTS idx_staff_att_date_status
    ON public.staff_attendance (date, status);

ANALYZE public.students;
ANALYZE public.student_attendance_marks;
ANALYZE public.attendance_marks;
ANALYZE public.attendance_schedules;
ANALYZE public.hifz_logs;
ANALYZE public.mentor_delegations;
ANALYZE public.student_leaves;
ANALYZE public.staff_attendance;
