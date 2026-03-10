-- Create table for storing manual monthly report data
CREATE TABLE IF NOT EXISTS public.monthly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    report_month DATE NOT NULL, -- Storing first day of the month usually, e.g. 2024-02-01
    hifz_pages NUMERIC(5,2) DEFAULT 0,
    recent_pages INT DEFAULT 0,
    juz_revision NUMERIC(5,2) DEFAULT 0,
    total_juz NUMERIC(5,2) DEFAULT 0, -- Allow manually setting total if needed
    attendance TEXT, 
    grade TEXT,
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_student_month UNIQUE (student_id, report_month)
);

-- Enable RLS
ALTER TABLE public.monthly_reports ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform all operations
CREATE POLICY "Enable all for authenticated users" ON public.monthly_reports
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Notify schema reload
NOTIFY pgrst, 'reload config';
