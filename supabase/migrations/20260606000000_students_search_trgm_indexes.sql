CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_students_name_trgm
    ON public.students
    USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_students_adm_no_trgm
    ON public.students
    USING gin (adm_no gin_trgm_ops);

ANALYZE public.students;
