-- hifz_mentor_history: tracks every Hifz mentor assignment per student,
-- including start date and optional end date, so historical reports can show
-- which mentor a student was with during any given period.
-- Also adds a proper exit_date column to students for clean date-boundary queries.
-- Additive and backward-compatible: does not modify any existing production data.

-- 1. Create the mentor history table
CREATE TABLE IF NOT EXISTS public.hifz_mentor_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    mentor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    assigned_from date NOT NULL,
    assigned_until date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce: only one "current" (no end-date) assignment per student at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_hifz_mentor_history_active
    ON public.hifz_mentor_history (student_id)
    WHERE assigned_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_hifz_mentor_history_student
    ON public.hifz_mentor_history (student_id, assigned_from, assigned_until);

CREATE INDEX IF NOT EXISTS idx_hifz_mentor_history_mentor
    ON public.hifz_mentor_history (mentor_id, assigned_from, assigned_until);

-- 2. Add exit_date column to students for clean date-boundary queries
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS exit_date date;

-- 3. Backfill exit_date from comprehensive_details JSON where the date is valid ISO-8601
UPDATE public.students
SET exit_date = (
    COALESCE(
        CASE
            WHEN (comprehensive_details->>'leaving_date') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (comprehensive_details->>'leaving_date')::date
            ELSE NULL
        END,
        CASE
            WHEN (comprehensive_details->>'exit_date') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (comprehensive_details->>'exit_date')::date
            ELSE NULL
        END,
        CASE
            WHEN (comprehensive_details->>'completed_date') ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (comprehensive_details->>'completed_date')::date
            ELSE NULL
        END
    )
)
WHERE exit_date IS NULL
  AND comprehensive_details IS NOT NULL;

-- 4. Backfill hifz_mentor_history from existing student_hifz_profiles / students data.
--    Uses admission_date as assigned_from (or hifz profile started_on if available).
--    Only creates a row where a mentor is actually assigned.
INSERT INTO public.hifz_mentor_history (student_id, mentor_id, assigned_from)
SELECT
    s.adm_no,
    COALESCE(hp.mentor_id, s.hifz_mentor_id),
    COALESCE(hp.started_on, s.admission_date::date, CURRENT_DATE)
FROM public.students s
LEFT JOIN public.student_hifz_profiles hp ON hp.student_id = s.adm_no
WHERE COALESCE(hp.mentor_id, s.hifz_mentor_id) IS NOT NULL
  AND COALESCE(LOWER(s.status), 'active') <> 'alumni'
ON CONFLICT DO NOTHING;

-- 5. Enable RLS
ALTER TABLE public.hifz_mentor_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hifz mentor history readable" ON public.hifz_mentor_history;
CREATE POLICY "Hifz mentor history readable" ON public.hifz_mentor_history
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages hifz mentor history" ON public.hifz_mentor_history;
CREATE POLICY "Admin manages hifz mentor history" ON public.hifz_mentor_history
    FOR ALL USING (public.is_admin_or_principal());
