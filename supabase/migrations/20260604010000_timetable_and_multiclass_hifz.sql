-- Database migration to link academic year classes, timetables, and backfill enrollments.
-- Backward-compatible and safe.

-- 1. Create School and Hifz classes for academic year 2025-2026
-- This matches the standard/section values in student_school_enrollments to make placements load correctly.
INSERT INTO public.classes (id, academic_year_id, name, type, standard, section)
VALUES
  ('a5f5e510-1111-4444-a001-c54d72851d21', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '5th', 'School', '5th', NULL),
  ('a5f5e510-2222-4444-a001-c54d72851d22', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '6th', 'School', '6th', NULL),
  ('a5f5e510-3333-4444-a001-c54d72851d23', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '7th', 'School', '7th', NULL),
  ('a5f5e510-4444-4444-a001-c54d72851d24', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '8th', 'School', '8th', NULL),
  ('a5f5e510-5555-4444-a001-c54d72851d25', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '9th', 'School', '9th', NULL),
  ('a5f5e510-6666-4444-a001-c54d72851d26', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', '10th', 'School', '10th', NULL),
  ('a5f5e510-7777-4444-a001-c54d72851d27', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Plus One', 'School', 'Plus One', NULL),
  ('a5f5e510-8888-4444-a001-c54d72851d28', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Plus Two', 'School', 'Plus Two', NULL),
  ('a5f5e510-9999-4444-a001-c54d72851d29', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Hifz', 'School', 'Hifz', NULL),
  -- Hifz timing classes for 2025-2026
  ('a5f5e510-aaaa-4444-a001-c54d72851da0', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Subh', 'Hifz', 'Hifz', NULL),
  ('a5f5e510-bbbb-4444-a001-c54d72851db0', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Morning', 'Hifz', 'Hifz', NULL),
  ('a5f5e510-cccc-4444-a001-c54d72851dc0', 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6', 'Noon', 'Hifz', 'Hifz', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. Align standard naming conventions for 2026-2027 classes
UPDATE public.classes
SET standard = 'Plus One', name = 'Plus One A'
WHERE standard = '+1' AND type = 'School';

UPDATE public.classes
SET standard = 'Plus Two', name = 'Plus Two A'
WHERE standard = '+2' AND type = 'School';

-- 3. Link existing timetables (which have class_id & academic_year_id = NULL) to Hifz classes for 2025-2026
UPDATE public.attendance_schedules
SET academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'::uuid,
    class_id = CASE
        WHEN LOWER(name) LIKE '%subh%' THEN 'a5f5e510-aaaa-4444-a001-c54d72851da0'::uuid
        WHEN LOWER(name) LIKE '%morning%' THEN 'a5f5e510-bbbb-4444-a001-c54d72851db0'::uuid
        WHEN LOWER(name) LIKE '%noon%' THEN 'a5f5e510-cccc-4444-a001-c54d72851dc0'::uuid
        ELSE NULL
    END
WHERE academic_year_id IS NULL;

-- 4. Copy the timetables to academic year 2026-2027, linking them to target year Hifz classes
INSERT INTO public.attendance_schedules (
    academic_year_id, class_id, class_type, name, standards, day_of_week, start_time, end_time, duration_mins, effective_from, is_deleted
)
SELECT
    '5366c88b-859e-498c-8a0e-9463ab354b17'::uuid AS academic_year_id,
    CASE
        WHEN LOWER(name) LIKE '%subh%' THEN 'b4ae55d6-0e97-4020-af18-a66b59f75be8'::uuid
        WHEN LOWER(name) LIKE '%morning%' THEN 'bba3abb7-d564-403b-84bc-1038a8d6a37d'::uuid
        WHEN LOWER(name) LIKE '%noon%' THEN '5ada2432-cc5a-45d7-9f33-fab35c25df40'::uuid
        ELSE NULL
    END AS class_id,
    class_type,
    name,
    standards,
    day_of_week,
    start_time,
    end_time,
    duration_mins,
    '2026-06-05'::date AS effective_from,
    false AS is_deleted
FROM public.attendance_schedules
WHERE academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'::uuid;

-- 5. Backfill the enrollments table for Hifz class placements in 2025-2026
-- We enroll Hifz students in Subh, Morning, and Noon classes by default so they appear on their mentor's Hifz lists.
INSERT INTO public.enrollments (student_id, class_id, academic_year_id)
SELECT
    shp.student_id,
    c.id AS class_id,
    'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'::uuid AS academic_year_id
FROM public.student_hifz_profiles shp
CROSS JOIN (
    SELECT id FROM public.classes
    WHERE academic_year_id = 'f3608a97-d4ed-43ff-8012-c9bb0408e5d6'
      AND type = 'Hifz'
) c
WHERE shp.active = true
ON CONFLICT (student_id, academic_year_id, class_id) DO NOTHING;

-- 6. Backfill school enrollments into public.enrollments table for year 2025-2026
INSERT INTO public.enrollments (student_id, class_id, academic_year_id)
SELECT
    se.student_id,
    c.id AS class_id,
    se.academic_year_id
FROM public.student_school_enrollments se
JOIN public.classes c
  ON c.academic_year_id = se.academic_year_id
 AND c.type = 'School'
 AND c.standard = se.school_standard
 AND COALESCE(c.section, '') = COALESCE(se.school_section, '')
ON CONFLICT (student_id, academic_year_id, class_id) DO NOTHING;

-- 7. Backfill school enrollments into public.enrollments table for year 2026-2027
INSERT INTO public.enrollments (student_id, class_id, academic_year_id)
SELECT
    se.student_id,
    c.id AS class_id,
    se.academic_year_id
FROM public.student_school_enrollments se
JOIN public.classes c
  ON c.academic_year_id = se.academic_year_id
 AND c.type = 'School'
 AND c.standard = se.school_standard
 AND COALESCE(c.section, '') = COALESCE(se.school_section, '')
ON CONFLICT (student_id, academic_year_id, class_id) DO NOTHING;
