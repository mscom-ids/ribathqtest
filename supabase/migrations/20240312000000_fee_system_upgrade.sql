-- Migration: Complete Fee Management System Schema Updates
-- Adds: fee_plans, store_wallet tables
-- Modifies: students (custom_monthly_fee), student_charges (paid_amount)

-- 1. Fee Plans table (historical fee amounts with effective dates)
-- 1. Fee Plans table (historical fee amounts with effective dates)
CREATE TABLE IF NOT EXISTS public.fee_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    amount NUMERIC(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add label column if it doesn't exist (table may have been created earlier)
ALTER TABLE public.fee_plans ADD COLUMN IF NOT EXISTS label TEXT;

-- Enable RLS
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;

-- Admin can manage fee plans
DROP POLICY IF EXISTS "Admin manages fee_plans" ON public.fee_plans;
CREATE POLICY "Admin manages fee_plans" ON public.fee_plans
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );

-- Authenticated users can read
DROP POLICY IF EXISTS "Auth reads fee_plans" ON public.fee_plans;
CREATE POLICY "Auth reads fee_plans" ON public.fee_plans
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Add custom_monthly_fee to students
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS custom_monthly_fee NUMERIC(10,2) DEFAULT NULL;

-- 3. Store Wallet table (credit balance per student)
CREATE TABLE IF NOT EXISTS public.store_wallet (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id)
);

ALTER TABLE public.store_wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages store_wallet" ON public.store_wallet;
CREATE POLICY "Admin manages store_wallet" ON public.store_wallet
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );

DROP POLICY IF EXISTS "Auth reads store_wallet" ON public.store_wallet;
CREATE POLICY "Auth reads store_wallet" ON public.store_wallet
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 4. Add paid_amount to student_charges for partial payment tracking
ALTER TABLE public.student_charges ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) DEFAULT 0;

-- 5. Store wallet transactions log (for audit trail)
CREATE TABLE IF NOT EXISTS public.store_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.store_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages store_transactions" ON public.store_transactions;
CREATE POLICY "Admin manages store_transactions" ON public.store_transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );

DROP POLICY IF EXISTS "Auth reads store_transactions" ON public.store_transactions;
CREATE POLICY "Auth reads store_transactions" ON public.store_transactions
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 6. Seed some default fee plan
INSERT INTO public.fee_plans (amount, effective_from, label)
VALUES (7000, '2023-06-01', 'Default Fee - June 2023')
ON CONFLICT DO NOTHING;
