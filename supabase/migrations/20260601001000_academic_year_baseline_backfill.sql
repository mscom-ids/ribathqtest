-- Baseline academic-year backfill.
-- Insert-only and idempotent. Existing production history remains untouched.

CREATE TABLE IF NOT EXISTS public.academic_year_migration_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_name text NOT NULL,
    academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
    total_students integer NOT NULL DEFAULT 0,
    school_enrollments_created integer NOT NULL DEFAULT 0,
    madrasa_enrollments_created integer NOT NULL DEFAULT 0,
    hifz_profiles_created integer NOT NULL DEFAULT 0,
    snapshots_created integer NOT NULL DEFAULT 0,
    skipped_missing_standard integer NOT NULL DEFAULT 0,
    warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academic_year_migration_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academic year migration reports readable" ON public.academic_year_migration_reports;
CREATE POLICY "Academic year migration reports readable" ON public.academic_year_migration_reports
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages academic year migration reports" ON public.academic_year_migration_reports;
CREATE POLICY "Admin manages academic year migration reports" ON public.academic_year_migration_reports
    FOR ALL USING (public.is_admin_or_principal());

CREATE OR REPLACE VIEW public.academic_year_baseline_backfill_preview AS
WITH selected_year AS (
    SELECT id
    FROM (
        SELECT id, start_date, 1 AS priority
        FROM public.academic_years
        WHERE is_current = true
        UNION ALL
        SELECT id, start_date, 2 AS priority
        FROM public.academic_years
        WHERE CURRENT_DATE BETWEEN start_date AND end_date
        UNION ALL
        SELECT id, start_date, 3 AS priority
        FROM public.academic_years
    ) ranked
    ORDER BY priority, start_date DESC
    LIMIT 1
)
SELECT
    selected_year.id AS academic_year_id,
    COUNT(s.*)::integer AS total_students,
    COUNT(*) FILTER (WHERE COALESCE(s.standard, '') <> '')::integer AS school_enrollment_candidates,
    COUNT(*) FILTER (WHERE COALESCE(s.standard, '') = '')::integer AS missing_standard_students,
    COUNT(*) FILTER (WHERE COALESCE(s.madrassa_standard, '') <> '')::integer AS madrasa_enrollment_candidates,
    COUNT(*) FILTER (
        WHERE COALESCE(s.hifz_mentor_id::text, '') <> ''
           OR COALESCE(s.hifz_standard, '') <> ''
    )::integer AS hifz_profile_candidates
FROM selected_year
CROSS JOIN public.students s
WHERE COALESCE(LOWER(s.status), 'active') <> 'alumni'
GROUP BY selected_year.id;

WITH selected_year AS (
    SELECT id, start_date
    FROM (
        SELECT id, start_date, 1 AS priority
        FROM public.academic_years
        WHERE is_current = true
        UNION ALL
        SELECT id, start_date, 2 AS priority
        FROM public.academic_years
        WHERE CURRENT_DATE BETWEEN start_date AND end_date
        UNION ALL
        SELECT id, start_date, 3 AS priority
        FROM public.academic_years
    ) ranked
    ORDER BY priority, start_date DESC
    LIMIT 1
),
settings_insert AS (
    INSERT INTO public.academic_year_settings (academic_year_id)
    SELECT ay.id
    FROM public.academic_years ay
    ON CONFLICT (academic_year_id) DO NOTHING
    RETURNING academic_year_id
),
school_insert AS (
    INSERT INTO public.student_school_enrollments (
        student_id,
        academic_year_id,
        school_standard,
        school_section,
        status,
        joined_at
    )
    SELECT
        s.adm_no,
        y.id,
        s.standard,
        NULL,
        CASE WHEN COALESCE(LOWER(s.status), 'active') = 'active' THEN 'active' ELSE 'inactive' END,
        y.start_date::timestamptz
    FROM selected_year y
    JOIN public.students s ON COALESCE(LOWER(s.status), 'active') <> 'alumni'
    WHERE COALESCE(s.standard, '') <> ''
    ON CONFLICT (student_id, academic_year_id) DO NOTHING
    RETURNING student_id
),
madrasa_insert AS (
    INSERT INTO public.student_madrasa_enrollments (
        student_id,
        academic_year_id,
        madrasa_standard,
        madrasa_section,
        status,
        joined_at
    )
    SELECT
        s.adm_no,
        y.id,
        s.madrassa_standard,
        NULL,
        CASE WHEN COALESCE(LOWER(s.status), 'active') = 'active' THEN 'active' ELSE 'inactive' END,
        y.start_date::timestamptz
    FROM selected_year y
    JOIN public.students s ON COALESCE(LOWER(s.status), 'active') <> 'alumni'
    WHERE COALESCE(s.madrassa_standard, '') <> ''
    ON CONFLICT (student_id, academic_year_id) DO NOTHING
    RETURNING student_id
),
hifz_insert AS (
    INSERT INTO public.student_hifz_profiles (
        student_id,
        mentor_id,
        active,
        started_on,
        completed_hifz
    )
    SELECT
        s.adm_no,
        s.hifz_mentor_id,
        COALESCE(LOWER(s.status), 'active') = 'active',
        COALESCE(s.admission_date, y.start_date),
        LOWER(COALESCE(s.hifz_standard, '')) LIKE '%hafiz%'
    FROM selected_year y
    JOIN public.students s ON COALESCE(LOWER(s.status), 'active') <> 'alumni'
    WHERE COALESCE(s.hifz_mentor_id::text, '') <> ''
       OR COALESCE(s.hifz_standard, '') <> ''
    ON CONFLICT (student_id) DO NOTHING
    RETURNING student_id
),
snapshot_insert AS (
    INSERT INTO public.student_year_snapshots (
        student_id,
        academic_year_id,
        school_standard,
        school_section,
        madrasa_standard,
        madrasa_section,
        hifz_mentor_id,
        status
    )
    SELECT
        s.adm_no,
        y.id,
        s.standard,
        NULL,
        NULLIF(s.madrassa_standard, ''),
        NULL,
        s.hifz_mentor_id,
        COALESCE(NULLIF(LOWER(s.status), ''), 'active')
    FROM selected_year y
    JOIN public.students s ON COALESCE(LOWER(s.status), 'active') <> 'alumni'
    ON CONFLICT (student_id, academic_year_id) DO NOTHING
    RETURNING student_id
),
counts AS (
    SELECT
        y.id AS academic_year_id,
        (SELECT COUNT(*) FROM public.students s WHERE COALESCE(LOWER(s.status), 'active') <> 'alumni')::integer AS total_students,
        (SELECT COUNT(*) FROM school_insert)::integer AS school_enrollments_created,
        (SELECT COUNT(*) FROM madrasa_insert)::integer AS madrasa_enrollments_created,
        (SELECT COUNT(*) FROM hifz_insert)::integer AS hifz_profiles_created,
        (SELECT COUNT(*) FROM snapshot_insert)::integer AS snapshots_created,
        (
            SELECT COUNT(*)
            FROM public.students s
            WHERE COALESCE(LOWER(s.status), 'active') <> 'alumni'
              AND COALESCE(s.standard, '') = ''
        )::integer AS skipped_missing_standard
    FROM selected_year y
)
INSERT INTO public.academic_year_migration_reports (
    migration_name,
    academic_year_id,
    total_students,
    school_enrollments_created,
    madrasa_enrollments_created,
    hifz_profiles_created,
    snapshots_created,
    skipped_missing_standard,
    warnings
)
SELECT
    '20260601001000_academic_year_baseline_backfill',
    counts.academic_year_id,
    counts.total_students,
    counts.school_enrollments_created,
    counts.madrasa_enrollments_created,
    counts.hifz_profiles_created,
    counts.snapshots_created,
    counts.skipped_missing_standard,
    jsonb_build_array(
        'students.standard was used only as the baseline school enrollment source.',
        'Madrasa enrollments were created only where students.madrassa_standard was already populated.',
        'Hifz profiles are lifecycle records only; Subh/Morning/Noon attendance remains schedule-based.',
        'Historical attendance, Hifz logs, leaves, fees, payments, exams, and reports were not modified.'
    )
FROM counts
WHERE counts.academic_year_id IS NOT NULL;
