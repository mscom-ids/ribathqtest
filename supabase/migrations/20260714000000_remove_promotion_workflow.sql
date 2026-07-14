-- Remove the retired promotion workflow. Student placement history, class history,
-- attendance, Hifz records, and academic years are intentionally preserved.
-- Replace the academic-year lock trigger before dropping its retired field.
CREATE OR REPLACE FUNCTION public.prevent_locked_academic_year_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    year_ids uuid[] := ARRAY[]::uuid[];
    year_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'academic_year_settings' THEN
        IF TG_OP = 'DELETE' AND OLD.year_locked THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', OLD.academic_year_id;
        END IF;

        IF TG_OP = 'UPDATE'
           AND OLD.year_locked
           AND NEW.year_locked = OLD.year_locked
           AND (
                NEW.school_fee_plan_id IS DISTINCT FROM OLD.school_fee_plan_id
                OR NEW.madrasa_fee_plan_id IS DISTINCT FROM OLD.madrasa_fee_plan_id
           ) THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', OLD.academic_year_id;
        END IF;

        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_TABLE_NAME IN ('student_school_enrollments', 'student_madrasa_enrollments', 'student_year_snapshots', 'classes', 'enrollments') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            year_ids := array_append(year_ids, OLD.academic_year_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            year_ids := array_append(year_ids, NEW.academic_year_id);
        END IF;
    ELSIF TG_TABLE_NAME IN ('weekly_schedule', 'class_events') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT array_append(year_ids, c.academic_year_id)
            INTO year_ids
            FROM public.classes c
            WHERE c.id = OLD.class_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT array_append(year_ids, c.academic_year_id)
            INTO year_ids
            FROM public.classes c
            WHERE c.id = NEW.class_id;
        END IF;
    ELSIF TG_TABLE_NAME IN ('fee_plans', 'exams') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.academic_year_id IS NOT NULL THEN
            year_ids := array_append(year_ids, OLD.academic_year_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.academic_year_id IS NOT NULL THEN
            year_ids := array_append(year_ids, NEW.academic_year_id);
        END IF;
    END IF;

    FOREACH year_id IN ARRAY year_ids LOOP
        IF year_id IS NOT NULL AND public.academic_year_is_locked(year_id) THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', year_id;
        END IF;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TABLE IF EXISTS public.promotion_logs;
DROP TABLE IF EXISTS public.promotion_batches;
DROP TABLE IF EXISTS public.promotion_previews;

ALTER TABLE IF EXISTS public.academic_year_settings
    DROP COLUMN IF EXISTS promotion_completed;

ALTER TABLE IF EXISTS public.academic_years
    DROP COLUMN IF EXISTS promotion_window_open;