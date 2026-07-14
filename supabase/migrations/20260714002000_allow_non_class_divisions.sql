-- Non-class is a valid standard and may optionally use divisions.
-- This only widens validation; existing placement data is untouched.

ALTER TABLE public.academic_standard_divisions
    DROP CONSTRAINT IF EXISTS academic_standard_divisions_standard_check;

ALTER TABLE public.academic_standard_divisions
    ADD CONSTRAINT academic_standard_divisions_standard_check
    CHECK (standard IN ('Non-class', '5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two'));

ALTER TABLE public.academic_student_placements
    DROP CONSTRAINT IF EXISTS academic_student_placements_check;

ALTER TABLE public.academic_student_placements
    DROP CONSTRAINT IF EXISTS academic_student_placements_standard_check;
