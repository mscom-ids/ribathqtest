CREATE TABLE IF NOT EXISTS public.hifz_log_session_legacy (
    hifz_log_id UUID PRIMARY KEY REFERENCES public.hifz_logs(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.hifz_log_session_legacy ENABLE ROW LEVEL SECURITY;

INSERT INTO public.hifz_log_session_legacy (hifz_log_id, session_type)
SELECT id, session_type
FROM public.hifz_logs
WHERE session_type IS NOT NULL
ON CONFLICT (hifz_log_id) DO NOTHING;

ALTER TABLE public.hifz_logs
    DROP CONSTRAINT IF EXISTS hifz_logs_session_type_check;

ALTER TABLE public.hifz_logs
    DROP COLUMN IF EXISTS session_type;
