-- Support the single academic-year Hifz mentor roster used by dashboard,
-- attendance, recording, and reports. Existing attendance and Hifz rows are unchanged.
CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_year_hifz_mentor_student
    ON public.student_year_snapshots (academic_year_id, hifz_mentor_id, student_id)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hifz_logs_mentor_entry_date_student
    ON public.hifz_logs (usthad_id, entry_date DESC, student_id)
    WHERE usthad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_mentor_day_window
    ON public.attendance_schedules (mentor_id, day_of_week, effective_from, effective_until)
    WHERE mentor_id IS NOT NULL;