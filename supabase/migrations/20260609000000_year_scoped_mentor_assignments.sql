ALTER TABLE public.student_year_snapshots
  ADD COLUMN IF NOT EXISTS school_mentor_id uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS madrasa_mentor_id uuid REFERENCES public.staff(id);

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_hifz_mentor
  ON public.student_year_snapshots (academic_year_id, hifz_mentor_id)
  WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_school_mentor
  ON public.student_year_snapshots (academic_year_id, school_mentor_id)
  WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_madrasa_mentor
  ON public.student_year_snapshots (academic_year_id, madrasa_mentor_id)
  WHERE madrasa_mentor_id IS NOT NULL;
