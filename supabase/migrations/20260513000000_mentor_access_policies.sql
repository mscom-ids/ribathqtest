CREATE TABLE IF NOT EXISTS public.mentor_access_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature TEXT NOT NULL UNIQUE,
    default_window_days INTEGER NOT NULL DEFAULT 7,
    unlock_start_date DATE,
    unlock_end_date DATE,
    note TEXT,
    updated_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT mentor_access_policies_feature_check
        CHECK (feature IN ('attendance', 'hifz_recording')),
    CONSTRAINT mentor_access_policies_window_check
        CHECK (default_window_days >= 1),
    CONSTRAINT mentor_access_policies_unlock_range_check
        CHECK (
            unlock_start_date IS NULL
            OR unlock_end_date IS NULL
            OR unlock_start_date <= unlock_end_date
        )
);

INSERT INTO public.mentor_access_policies (feature, default_window_days)
VALUES
    ('attendance', 7),
    ('hifz_recording', 7)
ON CONFLICT (feature) DO NOTHING;

ALTER TABLE public.mentor_access_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON public.mentor_access_policies
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload config';
