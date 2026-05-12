CREATE TABLE IF NOT EXISTS public.hifz_monthly_report_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_month DATE NOT NULL UNIQUE,
    expected_class_days INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_hifz_monthly_report_settings_days
        CHECK (expected_class_days IS NULL OR expected_class_days >= 0)
);

ALTER TABLE public.hifz_monthly_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for authenticated users" ON public.hifz_monthly_report_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

NOTIFY pgrst, 'reload config';
