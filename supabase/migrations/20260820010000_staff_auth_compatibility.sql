-- The legacy staff password fallback is still read by the shared web/mobile
-- authentication service. Some long-lived production databases received this
-- column manually, so fresh environments must add it explicitly.
ALTER TABLE public.staff
    ADD COLUMN IF NOT EXISTS password_hash text;

COMMENT ON COLUMN public.staff.password_hash IS
    'Optional bcrypt fallback for legacy staff accounts; Supabase Auth is preferred.';
