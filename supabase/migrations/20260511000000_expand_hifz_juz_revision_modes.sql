-- Allow Hafiz-specific Juz revision modes used by the Hifz entry form.
ALTER TABLE public.hifz_logs
    DROP CONSTRAINT IF EXISTS hifz_logs_mode_check;

ALTER TABLE public.hifz_logs
    ADD CONSTRAINT hifz_logs_mode_check
    CHECK (mode IN (
        'New Verses',
        'Recent Revision',
        'Juz Revision',
        'Juz Revision (New)',
        'Juz Revision (Old)'
    ));
