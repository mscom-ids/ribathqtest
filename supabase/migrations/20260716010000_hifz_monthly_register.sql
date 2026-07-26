-- Monthly Hifz register: preserve the existing history while attaching each
-- new record to the timetable/attendance context that authorised it.

ALTER TABLE public.student_hifz_profiles
    ADD COLUMN IF NOT EXISTS hifz_stage text;

ALTER TABLE public.student_hifz_profiles
    ADD COLUMN IF NOT EXISTS hifz_completed_at date;

UPDATE public.student_hifz_profiles
SET hifz_stage = CASE WHEN completed_hifz THEN 'HAFIZ_REVISION' ELSE 'MEMORIZING' END
WHERE hifz_stage IS NULL;

ALTER TABLE public.student_hifz_profiles
    ALTER COLUMN hifz_stage SET DEFAULT 'MEMORIZING';

ALTER TABLE public.student_hifz_profiles
    ADD CONSTRAINT student_hifz_profiles_hifz_stage_check
    CHECK (hifz_stage IN ('MEMORIZING', 'HAFIZ_REVISION')) NOT VALID;

ALTER TABLE public.hifz_logs
    ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.attendance_schedules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS hifz_assignment_id uuid,
    ADD COLUMN IF NOT EXISTS placement_id uuid,
    ADD COLUMN IF NOT EXISTS attendance_record_id uuid,
    ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_hifz_logs_student_active_date
    ON public.hifz_logs (student_id, entry_date DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hifz_logs_student_date_mode_active
    ON public.hifz_logs (student_id, entry_date, mode)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hifz_logs_session_student_active
    ON public.hifz_logs (session_id, student_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hifz_logs_mentor_active_date
    ON public.hifz_logs (usthad_id, entry_date DESC)
    WHERE deleted_at IS NULL;

