-- Class setup metadata for academic-year architecture.
-- Additive only: no production attendance/report/history rows are modified.

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS section text,
    ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS archived_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.student_hifz_profiles
    ADD COLUMN IF NOT EXISTS hifz_group_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE public.student_year_snapshots
    ADD COLUMN IF NOT EXISTS hifz_group_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_schedules
    ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_classes_year_type_standard_section_active
    ON public.classes (academic_year_id, type, standard, section)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_classes_year_type_name_active
    ON public.classes (academic_year_id, type, name)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_student_hifz_profiles_group
    ON public.student_hifz_profiles (hifz_group_class_id)
    WHERE hifz_group_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_hifz_group
    ON public.student_year_snapshots (academic_year_id, hifz_group_class_id)
    WHERE hifz_group_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_class_id
    ON public.attendance_schedules (class_id)
    WHERE class_id IS NOT NULL;

