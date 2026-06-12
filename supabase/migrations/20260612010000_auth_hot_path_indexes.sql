-- Keep auth lookups fast when login normalizes staff emails with LOWER(TRIM(email)).
-- Safe additive index only; no data is changed.

CREATE INDEX IF NOT EXISTS idx_staff_email_normalized
    ON public.staff (LOWER(TRIM(email)))
    WHERE email IS NOT NULL;

ANALYZE public.staff;
