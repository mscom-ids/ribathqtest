-- Migration: Fee Management System
-- Description: Complete finance tables with RLS policies for fee management

-- 0. Add 'accountant' to the valid roles (update any check constraints if they exist)
-- Since the profiles/staff role is a TEXT field, we just need to be aware that 'accountant' is now valid.

-- 0b. Add custom_monthly_fee column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS custom_monthly_fee NUMERIC(10,2) DEFAULT NULL;

-- 1. Finance Settings (passcode, config)
CREATE TABLE IF NOT EXISTS public.finance_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    passcode_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Fee Plans (historical fee amounts)
CREATE TABLE IF NOT EXISTS public.fee_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'Default',
    amount NUMERIC(10,2) NOT NULL,
    effective_from DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Monthly Fees (per-student, per-month records)
CREATE TABLE IF NOT EXISTS public.monthly_fees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month (2026-03-01)
    base_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    final_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, month)
);

-- 4. Charge Categories (configurable)
CREATE TABLE IF NOT EXISTS public.charge_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default charge categories
INSERT INTO public.charge_categories (name, description) VALUES
    ('Medical', 'Medical and health related charges'),
    ('Laundry', 'Laundry service charges'),
    ('Store', 'Store purchases (notebooks, stationery)'),
    ('School Books', 'School textbook charges'),
    ('Madrasa Books', 'Madrasa textbook charges'),
    ('Exam Fees', 'Examination related fees'),
    ('Uniform', 'Uniform and clothing charges'),
    ('Other', 'Miscellaneous charges')
ON CONFLICT (name) DO NOTHING;

-- 5. Student Charges
CREATE TABLE IF NOT EXISTS public.student_charges (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.charge_categories(id) ON DELETE RESTRICT,
    description TEXT,
    amount NUMERIC(10,2) NOT NULL,
    is_settled BOOLEAN DEFAULT false,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Payment Accounts (UPI/Bank account holders)
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_holder TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK (account_type IN ('upi', 'bank')),
    details TEXT, -- UPI ID or bank account info
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Payments
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank')),
    payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
    receipt_number TEXT,
    payment_type TEXT NOT NULL DEFAULT 'fee' CHECK (payment_type IN ('fee', 'charge')),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Store Wallet
CREATE TABLE IF NOT EXISTS public.store_wallet (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL UNIQUE REFERENCES public.students(adm_no) ON DELETE CASCADE,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== INDEXES =====
CREATE INDEX IF NOT EXISTS idx_monthly_fees_student ON public.monthly_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_monthly_fees_month ON public.monthly_fees(month);
CREATE INDEX IF NOT EXISTS idx_monthly_fees_status ON public.monthly_fees(status);
CREATE INDEX IF NOT EXISTS idx_student_charges_student ON public.student_charges(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(date);

-- ===== ENABLE RLS =====
ALTER TABLE public.finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_wallet ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES =====

-- Helper: Finance roles (admin, principal, vice_principal, accountant)
-- Used consistently across all finance tables

-- finance_settings: Only admin can manage
DROP POLICY IF EXISTS "Admin manages finance settings" ON public.finance_settings;
CREATE POLICY "Admin manages finance settings" ON public.finance_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- fee_plans: Finance roles can read, admin can modify
DROP POLICY IF EXISTS "Finance roles read fee plans" ON public.fee_plans;
CREATE POLICY "Finance roles read fee plans" ON public.fee_plans
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );
DROP POLICY IF EXISTS "Admin manages fee plans" ON public.fee_plans;
CREATE POLICY "Admin manages fee plans" ON public.fee_plans
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- monthly_fees: Finance roles can read all, admin/accountant can modify
DROP POLICY IF EXISTS "Finance roles read monthly fees" ON public.monthly_fees;
CREATE POLICY "Finance roles read monthly fees" ON public.monthly_fees
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );
DROP POLICY IF EXISTS "Admin/Accountant manage monthly fees" ON public.monthly_fees;
CREATE POLICY "Admin/Accountant manage monthly fees" ON public.monthly_fees
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );
-- Staff can view their students' monthly fees
DROP POLICY IF EXISTS "Staff read own students monthly fees" ON public.monthly_fees;
CREATE POLICY "Staff read own students monthly fees" ON public.monthly_fees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.adm_no = monthly_fees.student_id
            AND s.assigned_usthad_id = auth.uid()
        )
    );

-- charge_categories: All authenticated can read, admin manages
DROP POLICY IF EXISTS "Authenticated read charge categories" ON public.charge_categories;
CREATE POLICY "Authenticated read charge categories" ON public.charge_categories
    FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Admin manages charge categories" ON public.charge_categories;
CREATE POLICY "Admin manages charge categories" ON public.charge_categories
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- student_charges: Finance roles full access, staff read own students
DROP POLICY IF EXISTS "Finance roles manage charges" ON public.student_charges;
CREATE POLICY "Finance roles manage charges" ON public.student_charges
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );
DROP POLICY IF EXISTS "Finance roles read all charges" ON public.student_charges;
CREATE POLICY "Finance roles read all charges" ON public.student_charges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );
DROP POLICY IF EXISTS "Staff read own students charges" ON public.student_charges;
CREATE POLICY "Staff read own students charges" ON public.student_charges
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.adm_no = student_charges.student_id
            AND s.assigned_usthad_id = auth.uid()
        )
    );

-- payment_accounts: Finance roles manage
DROP POLICY IF EXISTS "Finance roles manage payment accounts" ON public.payment_accounts;
CREATE POLICY "Finance roles manage payment accounts" ON public.payment_accounts
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );
DROP POLICY IF EXISTS "Finance roles read payment accounts" ON public.payment_accounts;
CREATE POLICY "Finance roles read payment accounts" ON public.payment_accounts
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );

-- payments: Admin/accountant can record, finance roles can read
DROP POLICY IF EXISTS "Admin/Accountant record payments" ON public.payments;
CREATE POLICY "Admin/Accountant record payments" ON public.payments
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );
DROP POLICY IF EXISTS "Finance roles read payments" ON public.payments;
CREATE POLICY "Finance roles read payments" ON public.payments
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );

-- store_wallet: Finance roles full access, staff read own students
DROP POLICY IF EXISTS "Finance roles manage store wallet" ON public.store_wallet;
CREATE POLICY "Finance roles manage store wallet" ON public.store_wallet
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'accountant'))
    );
DROP POLICY IF EXISTS "Finance roles read wallets" ON public.store_wallet;
CREATE POLICY "Finance roles read wallets" ON public.store_wallet
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'accountant'))
    );
DROP POLICY IF EXISTS "Staff read own students wallets" ON public.store_wallet;
CREATE POLICY "Staff read own students wallets" ON public.store_wallet
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.adm_no = store_wallet.student_id
            AND s.assigned_usthad_id = auth.uid()
        )
    );

-- ===== TRIGGERS =====
CREATE OR REPLACE FUNCTION update_monthly_fees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monthly_fees_updated_at ON public.monthly_fees;
CREATE TRIGGER trg_monthly_fees_updated_at
BEFORE UPDATE ON public.monthly_fees
FOR EACH ROW EXECUTE FUNCTION update_monthly_fees_updated_at();

CREATE OR REPLACE FUNCTION update_store_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_wallet_updated_at ON public.store_wallet;
CREATE TRIGGER trg_store_wallet_updated_at
BEFORE UPDATE ON public.store_wallet
FOR EACH ROW EXECUTE FUNCTION update_store_wallet_updated_at();
