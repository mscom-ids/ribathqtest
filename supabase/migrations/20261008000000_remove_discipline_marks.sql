-- Discipline is severity-based. Remove the retired mark model and its data.
DELETE FROM public.discipline_settings
WHERE key IN ('risk_thresholds', 'mark_expiry_days', 'positive_marks_reduce_active');

DROP TABLE IF EXISTS public.discipline_positive_marks CASCADE;
DROP TABLE IF EXISTS public.discipline_marks CASCADE;

ALTER TABLE public.discipline_incidents
    DROP COLUMN IF EXISTS discipline_marks;

ALTER TABLE public.discipline_offence_types
    DROP COLUMN IF EXISTS default_marks;
