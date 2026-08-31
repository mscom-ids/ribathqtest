-- Auditable link from an offline mobile mutation to its domain row.
ALTER TABLE public.hifz_logs
    ADD COLUMN IF NOT EXISTS mobile_mutation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hifz_logs_mobile_mutation
    ON public.hifz_logs (created_by, mobile_mutation_id)
    WHERE mobile_mutation_id IS NOT NULL;
