-- Replace editable School/Madrasa class setup with one academic placement per student/year.
-- Legacy classes, schedules, events, and enrollments are deliberately retained as historical
-- attendance records until the attendance redesign migrates them to the new placement model.

CREATE TABLE IF NOT EXISTS public.academic_student_placements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    standard text NOT NULL CHECK (standard IN ('Non-class', '5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')),
    division text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'completed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id, student_id),
    CHECK (standard <> 'Non-class' OR division IS NULL)
);

CREATE TABLE IF NOT EXISTS public.academic_standard_divisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    standard text NOT NULL CHECK (standard IN ('5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id, standard, name)
);

CREATE INDEX IF NOT EXISTS idx_academic_student_placements_year_standard_division
    ON public.academic_student_placements (academic_year_id, standard, division, status);
CREATE INDEX IF NOT EXISTS idx_academic_student_placements_student_year
    ON public.academic_student_placements (student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_academic_standard_divisions_year_standard
    ON public.academic_standard_divisions (academic_year_id, standard, name);

-- Bring existing placement history forward without altering the source records.
INSERT INTO public.academic_student_placements (academic_year_id, student_id, standard, division, status)
SELECT se.academic_year_id,
       se.student_id,
       CASE WHEN se.school_standard IN ('5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')
            THEN se.school_standard ELSE 'Non-class' END,
       CASE WHEN se.school_standard IN ('5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')
            THEN NULLIF(trim(se.school_section), '') ELSE NULL END,
       CASE WHEN se.status = 'active' THEN 'active' ELSE 'inactive' END
FROM public.student_school_enrollments se
ON CONFLICT (academic_year_id, student_id) DO NOTHING;

INSERT INTO public.academic_student_placements (academic_year_id, student_id, standard, division, status)
SELECT sys.academic_year_id,
       sys.student_id,
       CASE WHEN sys.school_standard IN ('5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')
            THEN sys.school_standard ELSE 'Non-class' END,
       CASE WHEN sys.school_standard IN ('5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')
            THEN NULLIF(trim(sys.school_section), '') ELSE NULL END,
       CASE WHEN sys.status = 'active' THEN 'active' ELSE 'inactive' END
FROM public.student_year_snapshots sys
ON CONFLICT (academic_year_id, student_id) DO NOTHING;

-- Every active student in the active year is explicitly represented, including Non-class.
INSERT INTO public.academic_student_placements (academic_year_id, student_id, standard, status)
SELECT ay.id, s.adm_no, 'Non-class', 'active'
FROM public.academic_years ay
JOIN public.students s ON s.status = 'active'
WHERE ay.is_current = true
ON CONFLICT (academic_year_id, student_id) DO NOTHING;

INSERT INTO public.academic_standard_divisions (academic_year_id, standard, name)
SELECT DISTINCT p.academic_year_id, p.standard, p.division
FROM public.academic_student_placements p
WHERE p.standard <> 'Non-class' AND p.division IS NOT NULL AND length(trim(p.division)) > 0
ON CONFLICT (academic_year_id, standard, name) DO NOTHING;

ALTER TABLE public.academic_student_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_standard_divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academic placements readable" ON public.academic_student_placements;
CREATE POLICY "Academic placements readable" ON public.academic_student_placements
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manages academic placements" ON public.academic_student_placements;
CREATE POLICY "Admin manages academic placements" ON public.academic_student_placements
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Academic divisions readable" ON public.academic_standard_divisions;
CREATE POLICY "Academic divisions readable" ON public.academic_standard_divisions
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manages academic divisions" ON public.academic_standard_divisions;
CREATE POLICY "Admin manages academic divisions" ON public.academic_standard_divisions
    FOR ALL USING (public.is_admin_or_principal());