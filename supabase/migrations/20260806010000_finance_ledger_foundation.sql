-- Canonical finance ledger foundation.
--
-- This migration is deliberately additive. Existing fee_plans, monthly_fees,
-- student_charges, payments, charge_categories, and payment_accounts remain in
-- place and are never deleted or rewritten. Canonical rows retain a stable
-- legacy_source/legacy_id so this migration can be run repeatedly without
-- duplicating financial history.

-- ---------------------------------------------------------------------------
-- Reusable trigger helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finance_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Finance history is immutable; void, reverse, or archive this record instead.';
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_guard_fee_schedule_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
       OR NEW.standard IS DISTINCT FROM OLD.standard
       OR NEW.division IS DISTINCT FROM OLD.division
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.legacy_source IS DISTINCT FROM OLD.legacy_source
       OR NEW.legacy_id IS DISTINCT FROM OLD.legacy_id THEN
        RAISE EXCEPTION 'A fee schedule version cannot be edited; create a new effective-dated version.';
    END IF;

    IF OLD.archived_at IS NOT NULL AND (
        NEW.archived_at IS DISTINCT FROM OLD.archived_at
        OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
        OR NEW.status IS DISTINCT FROM OLD.status
    ) THEN
        RAISE EXCEPTION 'An archived fee schedule cannot be changed.';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_guard_fee_agreement_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.adjustment_type IS DISTINCT FROM OLD.adjustment_type
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
       OR NEW.reason IS DISTINCT FROM OLD.reason
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.legacy_source IS DISTINCT FROM OLD.legacy_source
       OR NEW.legacy_id IS DISTINCT FROM OLD.legacy_id THEN
        RAISE EXCEPTION 'A student fee agreement cannot be edited; create a new effective-dated version.';
    END IF;

    IF OLD.archived_at IS NOT NULL AND (
        NEW.archived_at IS DISTINCT FROM OLD.archived_at
        OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
        OR NEW.status IS DISTINCT FROM OLD.status
    ) THEN
        RAISE EXCEPTION 'An archived student fee agreement cannot be changed.';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Extend reusable setup tables without replacing them
-- ---------------------------------------------------------------------------

ALTER TABLE public.charge_categories
    ADD COLUMN IF NOT EXISTS code text,
    ADD COLUMN IF NOT EXISTS allocation_priority integer NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS allow_staff_entry boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.charge_categories
SET code = lower(regexp_replace(trim(name), '[^a-zA-Z0-9]+', '_', 'g'))
           || '_' || left(id::text, 8)
WHERE code IS NULL OR btrim(code) = '';

CREATE OR REPLACE FUNCTION public.finance_assign_charge_category_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    code_base text;
BEGIN
    IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
        code_base := lower(regexp_replace(trim(NEW.name), '[^a-zA-Z0-9]+', '_', 'g'));
        code_base := trim(BOTH '_' FROM code_base);
        IF code_base = '' THEN
            code_base := 'category';
        END IF;
        -- NEW.id already contains its default before BEFORE INSERT triggers run,
        -- making this deterministic for retries of the same row and collision-safe.
        NEW.code := code_base || '_' || left(NEW.id::text, 8);
    ELSE
        NEW.code := lower(btrim(NEW.code));
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_charge_categories_assign_code ON public.charge_categories;
CREATE TRIGGER trg_finance_charge_categories_assign_code
BEFORE INSERT ON public.charge_categories
FOR EACH ROW EXECUTE FUNCTION public.finance_assign_charge_category_code();

ALTER TABLE public.charge_categories
    ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'charge_categories_code_not_blank'
          AND conrelid = 'public.charge_categories'::regclass
    ) THEN
        ALTER TABLE public.charge_categories
            ADD CONSTRAINT charge_categories_code_not_blank CHECK (btrim(code) <> '');
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_categories_code
    ON public.charge_categories (lower(code));

CREATE INDEX IF NOT EXISTS idx_charge_categories_active_priority
    ON public.charge_categories (is_active, allocation_priority, name);

DROP TRIGGER IF EXISTS trg_finance_charge_categories_updated_at ON public.charge_categories;
CREATE TRIGGER trg_finance_charge_categories_updated_at
BEFORE UPDATE ON public.charge_categories
FOR EACH ROW EXECUTE FUNCTION public.finance_set_updated_at();

ALTER TABLE public.payment_accounts
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_finance_payment_accounts_updated_at ON public.payment_accounts;
CREATE TRIGGER trg_finance_payment_accounts_updated_at
BEFORE UPDATE ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.finance_set_updated_at();

-- ---------------------------------------------------------------------------
-- Effective-dated fee setup
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_fee_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    scope_type text NOT NULL CHECK (scope_type IN ('institution', 'standard', 'division')),
    standard text,
    division text,
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    effective_from date NOT NULL,
    effective_until date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    notes text,
    created_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    archived_at timestamptz,
    archived_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    legacy_source text,
    legacy_id text,
    CONSTRAINT finance_fee_schedules_scope_check CHECK (
        (scope_type = 'institution' AND standard IS NULL AND division IS NULL)
        OR (scope_type = 'standard' AND standard IS NOT NULL AND division IS NULL)
        OR (scope_type = 'division' AND standard IS NOT NULL AND division IS NOT NULL)
    ),
    CONSTRAINT finance_fee_schedules_dates_check CHECK (
        effective_until IS NULL OR effective_until >= effective_from
    ),
    CONSTRAINT finance_fee_schedules_month_start_check CHECK (
        effective_from = date_trunc('month', effective_from)::date
    ),
    CONSTRAINT finance_fee_schedules_archive_check CHECK (
        (status = 'active' AND archived_at IS NULL AND archived_by IS NULL)
        OR (status = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
    ),
    CONSTRAINT finance_fee_schedules_legacy_key UNIQUE (legacy_source, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_fee_schedules_resolution
    ON public.finance_fee_schedules (
        status,
        scope_type,
        standard,
        division,
        effective_from DESC,
        effective_until
    );

-- Multiple effective-dated versions may overlap; resolution intentionally uses
-- the latest effective_from. Only an identical start for the same scope is
-- forbidden. The INSERT advisory lock below closes the pre-index race window.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_fee_schedules_scope_start
    ON public.finance_fee_schedules (
        scope_type,
        COALESCE(standard, ''),
        COALESCE(division, ''),
        effective_from
    )
    WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_finance_fee_schedules_guard ON public.finance_fee_schedules;
CREATE TRIGGER trg_finance_fee_schedules_guard
BEFORE UPDATE ON public.finance_fee_schedules
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_fee_schedule_version();

DROP TRIGGER IF EXISTS trg_finance_fee_schedules_no_delete ON public.finance_fee_schedules;
CREATE TRIGGER trg_finance_fee_schedules_no_delete
BEFORE DELETE ON public.finance_fee_schedules
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

CREATE TABLE IF NOT EXISTS public.finance_student_fee_agreements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    adjustment_type text NOT NULL CHECK (
        adjustment_type IN ('fixed', 'discount_amount', 'discount_percent', 'surcharge', 'waiver')
    ),
    amount numeric(12,2) NOT NULL CHECK (amount >= 0),
    effective_from date NOT NULL,
    effective_until date,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    archived_at timestamptz,
    archived_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    legacy_source text,
    legacy_id text,
    CONSTRAINT finance_student_fee_agreements_dates_check CHECK (
        effective_until IS NULL OR effective_until >= effective_from
    ),
    CONSTRAINT finance_student_fee_agreements_month_start_check CHECK (
        effective_from = date_trunc('month', effective_from)::date
        AND (effective_until IS NULL OR effective_until = date_trunc('month', effective_until)::date)
    ),
    CONSTRAINT finance_student_fee_agreements_value_check CHECK (
        (adjustment_type = 'waiver' AND amount = 0)
        OR (adjustment_type = 'discount_percent' AND amount >= 0 AND amount <= 100)
        OR (adjustment_type IN ('fixed', 'discount_amount', 'surcharge') AND amount >= 0)
    ),
    CONSTRAINT finance_student_fee_agreements_archive_check CHECK (
        (status = 'active' AND archived_at IS NULL AND archived_by IS NULL)
        OR (status = 'archived' AND archived_at IS NOT NULL AND archived_by IS NOT NULL)
    ),
    CONSTRAINT finance_student_fee_agreements_legacy_key UNIQUE (legacy_source, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_student_fee_agreements_resolution
    ON public.finance_student_fee_agreements (
        student_id,
        status,
        effective_from DESC,
        effective_until
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_student_fee_agreements_version_start
    ON public.finance_student_fee_agreements (student_id, effective_from)
    WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_finance_student_fee_agreements_guard ON public.finance_student_fee_agreements;
CREATE TRIGGER trg_finance_student_fee_agreements_guard
BEFORE UPDATE ON public.finance_student_fee_agreements
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_fee_agreement_version();

DROP TRIGGER IF EXISTS trg_finance_student_fee_agreements_no_delete ON public.finance_student_fee_agreements;
CREATE TRIGGER trg_finance_student_fee_agreements_no_delete
BEFORE DELETE ON public.finance_student_fee_agreements
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

-- ---------------------------------------------------------------------------
-- Billing, obligations, payments, and allocation ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_billing_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_month date NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'publishing', 'published', 'void')),
    student_count integer NOT NULL DEFAULT 0 CHECK (student_count >= 0),
    total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    idempotency_key text NOT NULL UNIQUE,
    created_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    published_at timestamptz,
    voided_at timestamptz,
    voided_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    void_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_billing_runs_month_start_check CHECK (
        service_month = date_trunc('month', service_month)::date
    ),
    CONSTRAINT finance_billing_runs_publish_check CHECK (
        (status IN ('draft', 'publishing') AND published_at IS NULL)
        OR (status = 'published' AND published_at IS NOT NULL)
        OR status = 'void'
    ),
    CONSTRAINT finance_billing_runs_void_check CHECK (
        (status <> 'void' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
        OR (status = 'void' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_finance_billing_runs_month_status
    ON public.finance_billing_runs (service_month DESC, status);

DROP TRIGGER IF EXISTS trg_finance_billing_runs_no_delete ON public.finance_billing_runs;
CREATE TRIGGER trg_finance_billing_runs_no_delete
BEFORE DELETE ON public.finance_billing_runs
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

CREATE TABLE IF NOT EXISTS public.finance_obligations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    obligation_type text NOT NULL CHECK (
        obligation_type IN ('monthly_fee', 'charge', 'opening_balance', 'adjustment')
    ),
    category_id uuid REFERENCES public.charge_categories(id) ON DELETE RESTRICT,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    legacy_paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (legacy_paid_amount >= 0),
    paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    balance numeric(12,2) NOT NULL,
    service_month date NOT NULL,
    due_date date NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'void')),
    allocation_priority integer NOT NULL DEFAULT 100,
    fee_schedule_id uuid REFERENCES public.finance_fee_schedules(id) ON DELETE RESTRICT,
    fee_agreement_id uuid REFERENCES public.finance_student_fee_agreements(id) ON DELETE RESTRICT,
    billing_run_id uuid REFERENCES public.finance_billing_runs(id) ON DELETE RESTRICT,
    legacy_source text,
    legacy_id text,
    idempotency_key text NOT NULL UNIQUE,
    created_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    requires_approval boolean NOT NULL DEFAULT false,
    approval_status text NOT NULL DEFAULT 'approved' CHECK (
        approval_status IN ('pending', 'approved', 'rejected')
    ),
    approved_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    approved_at timestamptz,
    voided_at timestamptz,
    voided_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    void_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_obligations_amount_check CHECK (
        (obligation_type = 'adjustment' AND amount <> 0
            AND legacy_paid_amount = 0 AND paid_amount = 0 AND balance = amount)
        OR (obligation_type <> 'adjustment' AND amount >= 0
            AND legacy_paid_amount <= paid_amount
            AND paid_amount <= amount
            AND balance >= 0)
    ),
    CONSTRAINT finance_obligations_balance_check CHECK (balance = amount - paid_amount),
    CONSTRAINT finance_obligations_state_check CHECK (
        (status = 'void'
            AND legacy_paid_amount = 0
            AND paid_amount = 0
            AND balance = amount)
        OR (
            obligation_type = 'adjustment'
            AND paid_amount = 0
            AND status = 'open'
        )
        OR (
            obligation_type <> 'adjustment'
            AND (
                (balance = 0 AND status = 'paid')
                OR (balance = amount AND paid_amount = 0 AND status = 'open')
                OR (balance > 0 AND paid_amount > 0 AND status = 'partial')
            )
        )
    ),
    CONSTRAINT finance_obligations_month_start_check CHECK (
        service_month = date_trunc('month', service_month)::date
    ),
    CONSTRAINT finance_obligations_category_check CHECK (
        obligation_type <> 'charge' OR category_id IS NOT NULL
    ),
    CONSTRAINT finance_obligations_void_check CHECK (
        (status <> 'void' AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
        OR (status = 'void' AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
    ),
    CONSTRAINT finance_obligations_approval_check CHECK (
        (NOT requires_approval AND approval_status = 'approved')
        OR (
            requires_approval
            AND approval_status IN ('pending', 'rejected')
            AND approved_at IS NULL
            AND approved_by IS NULL
        )
        OR (
            requires_approval
            AND approval_status = 'approved'
            AND approved_at IS NOT NULL
            AND approved_by IS NOT NULL
        )
    ),
    CONSTRAINT finance_obligations_legacy_key UNIQUE (legacy_source, legacy_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_obligations_student_monthly_fee
    ON public.finance_obligations (student_id, service_month)
    WHERE obligation_type = 'monthly_fee';

CREATE INDEX IF NOT EXISTS idx_finance_obligations_student_open
    ON public.finance_obligations (student_id, status, due_date, allocation_priority, created_at)
    WHERE status IN ('open', 'partial');

CREATE INDEX IF NOT EXISTS idx_finance_obligations_month_status
    ON public.finance_obligations (service_month DESC, status, obligation_type);

CREATE INDEX IF NOT EXISTS idx_finance_obligations_category_date
    ON public.finance_obligations (category_id, due_date DESC)
    WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_obligations_billing_run
    ON public.finance_obligations (billing_run_id)
    WHERE billing_run_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_finance_obligations_no_delete ON public.finance_obligations;
CREATE TRIGGER trg_finance_obligations_no_delete
BEFORE DELETE ON public.finance_obligations
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

CREATE TABLE IF NOT EXISTS public.finance_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    allocated_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
    unapplied_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (unapplied_amount >= 0),
    method text NOT NULL CHECK (method IN ('cash', 'upi', 'bank')),
    payment_account_id uuid REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
    receipt_number text,
    date date NOT NULL DEFAULT CURRENT_DATE,
    notes text,
    status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
    allocation_status text NOT NULL DEFAULT 'strict'
        CHECK (allocation_status IN ('strict', 'legacy_snapshot')),
    idempotency_key text NOT NULL UNIQUE,
    recorded_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    reversed_at timestamptz,
    reversed_by uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    reversal_reason text,
    reverses_payment_id uuid REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
    legacy_source text,
    legacy_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_payments_allocation_check CHECK (
        (allocation_status = 'strict' AND allocated_amount + unapplied_amount = amount)
        OR (
            allocation_status = 'legacy_snapshot'
            AND allocated_amount = amount
            AND unapplied_amount = 0
            AND legacy_source = 'payments'
        )
    ),
    CONSTRAINT finance_payments_account_check CHECK (
        (method = 'cash' AND payment_account_id IS NULL)
        OR (method IN ('upi', 'bank') AND payment_account_id IS NOT NULL)
        OR legacy_source = 'payments'
    ),
    CONSTRAINT finance_payments_reversal_check CHECK (
        (status = 'posted' AND reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
        OR (status = 'reversed' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL AND reversal_reason IS NOT NULL)
    ),
    CONSTRAINT finance_payments_legacy_key UNIQUE (legacy_source, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_receipt
    ON public.finance_payments (lower(receipt_number))
    WHERE receipt_number IS NOT NULL AND status = 'posted';

CREATE INDEX IF NOT EXISTS idx_finance_payments_student_date
    ON public.finance_payments (student_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_payments_account_date
    ON public.finance_payments (payment_account_id, date DESC)
    WHERE payment_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_finance_payments_no_delete ON public.finance_payments;
CREATE TRIGGER trg_finance_payments_no_delete
BEFORE DELETE ON public.finance_payments
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

CREATE TABLE IF NOT EXISTS public.finance_payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
    obligation_id uuid NOT NULL REFERENCES public.finance_obligations(id) ON DELETE RESTRICT,
    amount numeric(12,2) NOT NULL CHECK (amount > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_payment_allocations_payment_obligation_key UNIQUE (payment_id, obligation_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_payment_allocations_obligation
    ON public.finance_payment_allocations (obligation_id, payment_id);

DROP TRIGGER IF EXISTS trg_finance_payment_allocations_no_delete ON public.finance_payment_allocations;
CREATE TRIGGER trg_finance_payment_allocations_no_delete
BEFORE DELETE ON public.finance_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

-- ---------------------------------------------------------------------------
-- Staff capabilities and immutable audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.finance_staff_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    capability text NOT NULL CHECK (
        capability IN ('ledger:view', 'payment:collect', 'charge:create')
    ),
    category_id uuid REFERENCES public.charge_categories(id) ON DELETE RESTRICT,
    student_scope text NOT NULL DEFAULT 'assigned' CHECK (student_scope IN ('assigned', 'all')),
    amount_limit numeric(12,2) CHECK (amount_limit IS NULL OR amount_limit > 0),
    valid_from date NOT NULL DEFAULT CURRENT_DATE,
    valid_until date,
    granted_by uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT finance_staff_permissions_dates_check CHECK (
        (valid_until IS NULL OR valid_until >= valid_from)
        AND (revoked_at IS NULL OR revoked_at >= created_at)
    ),
    CONSTRAINT finance_staff_permissions_category_check CHECK (
        (capability = 'charge:create' AND category_id IS NOT NULL)
        OR (capability <> 'charge:create' AND category_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_staff_permissions_active
    ON public.finance_staff_permissions (
        staff_id,
        capability,
        COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_finance_staff_permissions_lookup
    ON public.finance_staff_permissions (
        staff_id,
        capability,
        valid_from,
        valid_until,
        revoked_at
    );

DROP TRIGGER IF EXISTS trg_finance_staff_permissions_no_delete ON public.finance_staff_permissions;
CREATE TRIGGER trg_finance_staff_permissions_no_delete
BEFORE DELETE ON public.finance_staff_permissions
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

CREATE TABLE IF NOT EXISTS public.finance_audit_events (
    id bigserial PRIMARY KEY,
    actor_id uuid REFERENCES public.staff(id) ON DELETE RESTRICT,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    student_id text REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_audit_events_entity
    ON public.finance_audit_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_finance_audit_events_student
    ON public.finance_audit_events (student_id, created_at DESC)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_audit_events_actor
    ON public.finance_audit_events (actor_id, created_at DESC)
    WHERE actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_finance_audit_events_no_update ON public.finance_audit_events;
CREATE TRIGGER trg_finance_audit_events_no_update
BEFORE UPDATE OR DELETE ON public.finance_audit_events
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_delete();

-- ---------------------------------------------------------------------------
-- Concurrent schedule version creation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finance_lock_fee_schedule_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    scope_lock_key text;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    -- Re-running the migration must reach its legacy ON CONFLICT handler.
    IF NEW.legacy_source IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.finance_fee_schedules existing
        WHERE existing.legacy_source = NEW.legacy_source
          AND existing.legacy_id = NEW.legacy_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Serialize writers for one scope, not one date. Later open-ended versions
    -- remain valid and latest-effective_from resolution remains deterministic.
    scope_lock_key := concat_ws(
        '|',
        'finance_fee_schedule',
        NEW.scope_type,
        COALESCE(NEW.standard, ''),
        COALESCE(NEW.division, '')
    );
    PERFORM pg_advisory_xact_lock(hashtextextended(scope_lock_key, 0));

    -- Recheck after waiting: a concurrent idempotent importer may have inserted
    -- this exact legacy version while this transaction waited for the lock.
    IF NEW.legacy_source IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.finance_fee_schedules existing
        WHERE existing.legacy_source = NEW.legacy_source
          AND existing.legacy_id = NEW.legacy_id
    ) THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.finance_fee_schedules existing
        WHERE existing.status = 'active'
          AND existing.scope_type = NEW.scope_type
          AND existing.standard IS NOT DISTINCT FROM NEW.standard
          AND existing.division IS NOT DISTINCT FROM NEW.division
          AND existing.effective_from = NEW.effective_from
    ) THEN
        RAISE EXCEPTION 'An active fee schedule already starts on % for this scope.', NEW.effective_from
            USING ERRCODE = 'unique_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_fee_schedules_scope_lock ON public.finance_fee_schedules;
CREATE TRIGGER trg_finance_fee_schedules_scope_lock
BEFORE INSERT ON public.finance_fee_schedules
FOR EACH ROW EXECUTE FUNCTION public.finance_lock_fee_schedule_scope();

-- ---------------------------------------------------------------------------
-- Idempotent legacy backfill
-- ---------------------------------------------------------------------------

-- Transition guards created by an earlier idempotent run permit this one
-- narrowly scoped legacy billing-total refresh.
SELECT set_config('app.finance_legacy_backfill', 'on', true);

INSERT INTO public.finance_fee_schedules (
    name,
    scope_type,
    standard,
    division,
    amount,
    effective_from,
    status,
    notes,
    created_at,
    legacy_source,
    legacy_id
)
SELECT
    COALESCE(NULLIF(fp.label, ''), NULLIF(fp.name, ''), 'Legacy base fee'),
    'institution',
    NULL,
    NULL,
    fp.amount,
    date_trunc('month', fp.effective_from)::date,
    'active',
    'Imported from fee_plans; effective date normalized to its monthly boundary and the legacy source row remains unchanged.',
    COALESCE(fp.created_at, now()),
    'fee_plans',
    fp.id::text
FROM public.fee_plans fp
ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

INSERT INTO public.finance_student_fee_agreements (
    student_id,
    adjustment_type,
    amount,
    effective_from,
    reason,
    status,
    created_at,
    legacy_source,
    legacy_id
)
SELECT
    s.adm_no,
    'fixed',
    s.custom_monthly_fee,
    DATE '2026-08-01',
    'Imported at the finance-ledger cutover from students.custom_monthly_fee; prior monthly rows retain their own legacy snapshots.',
    'active',
    COALESCE(s.created_at, now()),
    'students.custom_monthly_fee',
    s.adm_no
FROM public.students s
WHERE s.custom_monthly_fee IS NOT NULL
ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

INSERT INTO public.finance_billing_runs (
    service_month,
    status,
    student_count,
    total_amount,
    idempotency_key,
    published_at,
    created_at
)
SELECT
    mf.month,
    'published',
    count(*)::integer,
    COALESCE(sum(mf.final_fee), 0),
    'legacy:monthly_fees:' || to_char(mf.month, 'YYYY-MM'),
    max(COALESCE(mf.updated_at, mf.created_at, now())),
    min(COALESCE(mf.created_at, now()))
FROM public.monthly_fees mf
GROUP BY mf.month
ON CONFLICT (idempotency_key) DO UPDATE
SET student_count = EXCLUDED.student_count,
    total_amount = EXCLUDED.total_amount,
    published_at = EXCLUDED.published_at
WHERE public.finance_billing_runs.idempotency_key LIKE 'legacy:monthly_fees:%';

INSERT INTO public.finance_obligations (
    student_id,
    obligation_type,
    description,
    amount,
    legacy_paid_amount,
    paid_amount,
    balance,
    service_month,
    due_date,
    status,
    allocation_priority,
    fee_schedule_id,
    fee_agreement_id,
    billing_run_id,
    legacy_source,
    legacy_id,
    idempotency_key,
    approval_status,
    created_at
)
SELECT
    mf.student_id,
    'monthly_fee',
    'Monthly fee - ' || to_char(mf.month, 'FMMonth YYYY'),
    mf.final_fee,
    COALESCE(mf.paid_amount, 0),
    COALESCE(mf.paid_amount, 0),
    mf.final_fee - COALESCE(mf.paid_amount, 0),
    mf.month,
    mf.month,
    CASE
        WHEN COALESCE(mf.paid_amount, 0) >= mf.final_fee THEN 'paid'
        WHEN COALESCE(mf.paid_amount, 0) > 0 THEN 'partial'
        ELSE 'open'
    END,
    10,
    schedule.id,
    agreement.id,
    run.id,
    'monthly_fees',
    mf.id::text,
    'legacy:monthly_fees:' || mf.id::text,
    'approved',
    COALESCE(mf.created_at, now())
FROM public.monthly_fees mf
JOIN public.finance_billing_runs run
  ON run.idempotency_key = 'legacy:monthly_fees:' || to_char(mf.month, 'YYYY-MM')
LEFT JOIN LATERAL (
    SELECT ffs.id
    FROM public.finance_fee_schedules ffs
    WHERE ffs.status = 'active'
      AND ffs.scope_type = 'institution'
      AND ffs.effective_from <= mf.month
      AND (ffs.effective_until IS NULL OR ffs.effective_until >= mf.month)
    ORDER BY ffs.effective_from DESC, ffs.created_at DESC
    LIMIT 1
) schedule ON true
LEFT JOIN LATERAL (
    SELECT fsa.id
    FROM public.finance_student_fee_agreements fsa
    WHERE fsa.student_id = mf.student_id
      AND fsa.status = 'active'
      AND fsa.effective_from <= mf.month
      AND (fsa.effective_until IS NULL OR fsa.effective_until >= mf.month)
    ORDER BY fsa.effective_from DESC, fsa.created_at DESC
    LIMIT 1
) agreement ON true
ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

INSERT INTO public.finance_obligations (
    student_id,
    obligation_type,
    category_id,
    description,
    amount,
    legacy_paid_amount,
    paid_amount,
    balance,
    service_month,
    due_date,
    status,
    allocation_priority,
    legacy_source,
    legacy_id,
    idempotency_key,
    approval_status,
    created_by,
    created_at
)
SELECT
    sc.student_id,
    'charge',
    sc.category_id,
    COALESCE(NULLIF(sc.description, ''), cc.name, 'Additional charge'),
    sc.amount,
    GREATEST(
        COALESCE(sc.paid_amount, 0),
        CASE WHEN COALESCE(sc.is_settled, false) THEN sc.amount ELSE 0 END
    ),
    GREATEST(
        COALESCE(sc.paid_amount, 0),
        CASE WHEN COALESCE(sc.is_settled, false) THEN sc.amount ELSE 0 END
    ),
    sc.amount - GREATEST(
        COALESCE(sc.paid_amount, 0),
        CASE WHEN COALESCE(sc.is_settled, false) THEN sc.amount ELSE 0 END
    ),
    date_trunc('month', sc.date)::date,
    sc.date,
    CASE
        WHEN GREATEST(COALESCE(sc.paid_amount, 0), CASE WHEN COALESCE(sc.is_settled, false) THEN sc.amount ELSE 0 END) >= sc.amount THEN 'paid'
        WHEN GREATEST(COALESCE(sc.paid_amount, 0), CASE WHEN COALESCE(sc.is_settled, false) THEN sc.amount ELSE 0 END) > 0 THEN 'partial'
        ELSE 'open'
    END,
    COALESCE(cc.allocation_priority, 100),
    'student_charges',
    sc.id::text,
    'legacy:student_charges:' || sc.id::text,
    'approved',
    actor.id,
    COALESCE(sc.created_at, now())
FROM public.student_charges sc
JOIN public.charge_categories cc ON cc.id = sc.category_id
LEFT JOIN LATERAL (
    SELECT st.id
    FROM public.staff st
    WHERE st.id = sc.created_by OR st.profile_id = sc.created_by
    LIMIT 1
) actor ON true
ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

-- Legacy payments do not identify the obligation(s) they settled. Preserve
-- them as fully accounted payment headers without inventing allocations. The
-- imported monthly_fees/student_charges paid_amount snapshots preserve the
-- corresponding obligation balances.
INSERT INTO public.finance_payments (
    student_id,
    amount,
    allocated_amount,
    unapplied_amount,
    method,
    payment_account_id,
    receipt_number,
    date,
    notes,
    status,
    allocation_status,
    idempotency_key,
    recorded_by,
    legacy_source,
    legacy_id,
    created_at
)
SELECT
    p.student_id,
    p.amount,
    p.amount,
    0,
    p.payment_method,
    p.payment_account_id,
    p.receipt_number,
    p.date,
    concat_ws(E'\n', p.notes, 'Imported legacy payment; allocation was already reflected in legacy paid totals.'),
    'posted',
    'legacy_snapshot',
    'legacy:payments:' || p.id::text,
    actor.id,
    'payments',
    p.id::text,
    COALESCE(p.created_at, now())
FROM public.payments p
LEFT JOIN LATERAL (
    SELECT st.id
    FROM public.staff st
    WHERE st.id = p.recorded_by OR st.profile_id = p.recorded_by
    LIMIT 1
) actor ON true
ON CONFLICT (legacy_source, legacy_id) DO NOTHING;

-- Verify the immutable source rows and the canonical snapshot agree before
-- enabling runtime transition guards. Exact numeric comparison is intentional:
-- finance amounts are NUMERIC, so no floating-point tolerance is necessary.
DO $$
DECLARE
    monthly_source_count bigint;
    monthly_ledger_count bigint;
    monthly_source_total numeric;
    monthly_ledger_total numeric;
    charge_source_count bigint;
    charge_ledger_count bigint;
    charge_source_total numeric;
    charge_ledger_total numeric;
BEGIN
    SELECT count(*), COALESCE(sum(final_fee), 0)
    INTO monthly_source_count, monthly_source_total
    FROM public.monthly_fees;

    SELECT count(*), COALESCE(sum(amount), 0)
    INTO monthly_ledger_count, monthly_ledger_total
    FROM public.finance_obligations
    WHERE legacy_source = 'monthly_fees';

    IF monthly_ledger_count IS DISTINCT FROM monthly_source_count
       OR monthly_ledger_total IS DISTINCT FROM monthly_source_total THEN
        RAISE EXCEPTION
            'Monthly fee backfill mismatch: source % rows/% total, ledger % rows/% total.',
            monthly_source_count, monthly_source_total,
            monthly_ledger_count, monthly_ledger_total;
    END IF;

    SELECT count(*), COALESCE(sum(amount), 0)
    INTO charge_source_count, charge_source_total
    FROM public.student_charges;

    SELECT count(*), COALESCE(sum(amount), 0)
    INTO charge_ledger_count, charge_ledger_total
    FROM public.finance_obligations
    WHERE legacy_source = 'student_charges';

    IF charge_ledger_count IS DISTINCT FROM charge_source_count
       OR charge_ledger_total IS DISTINCT FROM charge_source_total THEN
        RAISE EXCEPTION
            'Charge backfill mismatch: source % rows/% total, ledger % rows/% total.',
            charge_source_count, charge_source_total,
            charge_ledger_count, charge_ledger_total;
    END IF;
END;
$$;

SELECT set_config('app.finance_legacy_backfill', 'off', true);
-- Runtime rows are append-only except for narrowly defined lifecycle changes.
CREATE OR REPLACE FUNCTION public.finance_guard_billing_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    legacy_refresh boolean :=
        current_setting('app.finance_legacy_backfill', true) = 'on'
        AND OLD.idempotency_key LIKE 'legacy:monthly_fees:%';
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.service_month IS DISTINCT FROM OLD.service_month
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Billing-run identity and authorship are immutable.';
    END IF;

    IF legacy_refresh THEN
        IF OLD.status <> 'published'
           OR NEW.status <> 'published'
           OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
           OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
           OR NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN
            RAISE EXCEPTION 'Legacy billing refresh may update totals and published time only.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'void' THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A void billing run is immutable.';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'draft' AND NEW.status IN ('draft', 'publishing', 'void'))
        OR (OLD.status = 'publishing' AND NEW.status IN ('publishing', 'published', 'void'))
        OR (OLD.status = 'published' AND NEW.status IN ('published', 'void'))
    ) THEN
        RAISE EXCEPTION 'Invalid billing-run transition from % to %.', OLD.status, NEW.status;
    END IF;

    IF (NEW.student_count IS DISTINCT FROM OLD.student_count
        OR NEW.total_amount IS DISTINCT FROM OLD.total_amount)
       AND OLD.status NOT IN ('draft', 'publishing') THEN
        RAISE EXCEPTION 'Published billing totals are immutable.';
    END IF;

    IF NEW.published_at IS DISTINCT FROM OLD.published_at
       AND NOT (
           OLD.status = 'publishing'
           AND NEW.status = 'published'
           AND OLD.published_at IS NULL
           AND NEW.published_at IS NOT NULL
       ) THEN
        RAISE EXCEPTION 'Published time can only be set while publishing a run.';
    END IF;

    IF NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
       OR NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN
        IF NOT (OLD.status <> 'void' AND NEW.status = 'void') THEN
            RAISE EXCEPTION 'Void attribution can only be set while voiding a billing run.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_billing_runs_guard ON public.finance_billing_runs;
CREATE TRIGGER trg_finance_billing_runs_guard
BEFORE UPDATE ON public.finance_billing_runs
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_billing_run_transition();

CREATE OR REPLACE FUNCTION public.finance_guard_obligation_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.obligation_type IS DISTINCT FROM OLD.obligation_type
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.legacy_paid_amount IS DISTINCT FROM OLD.legacy_paid_amount
       OR NEW.service_month IS DISTINCT FROM OLD.service_month
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.allocation_priority IS DISTINCT FROM OLD.allocation_priority
       OR NEW.fee_schedule_id IS DISTINCT FROM OLD.fee_schedule_id
       OR NEW.fee_agreement_id IS DISTINCT FROM OLD.fee_agreement_id
       OR NEW.billing_run_id IS DISTINCT FROM OLD.billing_run_id
       OR NEW.legacy_source IS DISTINCT FROM OLD.legacy_source
       OR NEW.legacy_id IS DISTINCT FROM OLD.legacy_id
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Obligation source, amount, ownership, and authorship are immutable.';
    END IF;

    IF OLD.status = 'void' THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A void obligation is immutable.';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('open', 'partial', 'paid', 'void') THEN
        RAISE EXCEPTION 'Invalid obligation status %.', NEW.status;
    END IF;

    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
        IF OLD.approval_status <> 'pending'
           OR NEW.approval_status NOT IN ('approved', 'rejected')
           OR NEW.status = 'void' THEN
            RAISE EXCEPTION 'Approval may only move once from pending to approved or rejected.';
        END IF;

        IF NEW.approval_status = 'approved'
           AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN
            RAISE EXCEPTION 'Approval requires an approving staff member and timestamp.';
        END IF;

        IF NEW.approval_status = 'rejected'
           AND (NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL) THEN
            RAISE EXCEPTION 'Rejected obligations cannot carry approval attribution.';
        END IF;
    ELSIF NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN
        RAISE EXCEPTION 'Approval attribution is immutable outside the approval transition.';
    END IF;

    IF NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
       OR NEW.void_reason IS DISTINCT FROM OLD.void_reason THEN
        IF NEW.status <> 'void' OR OLD.status = 'void' THEN
            RAISE EXCEPTION 'Void attribution can only be set while voiding an obligation.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_obligations_guard ON public.finance_obligations;
CREATE TRIGGER trg_finance_obligations_guard
BEFORE UPDATE ON public.finance_obligations
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_obligation_transition();
CREATE OR REPLACE FUNCTION public.finance_guard_payment_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.payment_account_id IS DISTINCT FROM OLD.payment_account_id
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.date IS DISTINCT FROM OLD.date
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.allocation_status IS DISTINCT FROM OLD.allocation_status
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
       OR NEW.reverses_payment_id IS DISTINCT FROM OLD.reverses_payment_id
       OR NEW.legacy_source IS DISTINCT FROM OLD.legacy_source
       OR NEW.legacy_id IS DISTINCT FROM OLD.legacy_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Payment source, amount, ownership, and authorship are immutable.';
    END IF;

    IF OLD.status = 'reversed' THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A reversed payment is immutable.';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'posted' AND NEW.status = 'posted')
        OR (OLD.status = 'posted' AND NEW.status = 'reversed')
    ) THEN
        RAISE EXCEPTION 'Invalid payment transition from % to %.', OLD.status, NEW.status;
    END IF;

    IF NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
       OR NEW.unapplied_amount IS DISTINCT FROM OLD.unapplied_amount THEN
        IF OLD.status <> 'posted'
           OR NEW.status <> 'posted'
           OR NEW.allocated_amount < OLD.allocated_amount
           OR NEW.unapplied_amount > OLD.unapplied_amount THEN
            RAISE EXCEPTION 'Posted payment allocation totals may only move from unapplied to allocated.';
        END IF;
    END IF;

    IF NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
       OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
       OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason THEN
        IF OLD.status <> 'posted'
           OR NEW.status <> 'reversed'
           OR NEW.reversed_at IS NULL
           OR NEW.reversed_by IS NULL
           OR NEW.reversal_reason IS NULL THEN
            RAISE EXCEPTION 'Reversal attribution can only be set while reversing a posted payment.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_payments_guard ON public.finance_payments;
CREATE TRIGGER trg_finance_payments_guard
BEFORE UPDATE ON public.finance_payments
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_payment_transition();

CREATE OR REPLACE FUNCTION public.finance_reject_allocation_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Payment allocations are immutable; reverse the payment instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_payment_allocations_no_update ON public.finance_payment_allocations;
CREATE TRIGGER trg_finance_payment_allocations_no_update
BEFORE UPDATE ON public.finance_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.finance_reject_allocation_update();

CREATE OR REPLACE FUNCTION public.finance_guard_staff_permission_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.staff_id IS DISTINCT FROM OLD.staff_id
       OR NEW.capability IS DISTINCT FROM OLD.capability
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.student_scope IS DISTINCT FROM OLD.student_scope
       OR NEW.amount_limit IS DISTINCT FROM OLD.amount_limit
       OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
       OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
       OR NEW.granted_by IS DISTINCT FROM OLD.granted_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'A finance permission grant is immutable; revoke and create a new grant.';
    END IF;

    IF OLD.revoked_at IS NOT NULL THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A revoked finance permission is immutable.';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.revoked_at IS NULL THEN
        IF NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'A finance permission may only be changed by revoking it.';
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_staff_permissions_guard ON public.finance_staff_permissions;
CREATE TRIGGER trg_finance_staff_permissions_guard
BEFORE UPDATE ON public.finance_staff_permissions
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_staff_permission_transition();
-- Allocation eligibility is checked immediately. Cross-row sums are checked by
-- deferred constraint triggers so a transaction may insert its allocation rows
-- before updating the related obligation totals.
CREATE OR REPLACE FUNCTION public.finance_guard_allocation_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    payment_row public.finance_payments%ROWTYPE;
    obligation_row public.finance_obligations%ROWTYPE;
BEGIN
    SELECT * INTO payment_row
    FROM public.finance_payments
    WHERE id = NEW.payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation payment % does not exist.', NEW.payment_id;
    END IF;

    -- Every allocation for one student is serialized, including allocations
    -- from different payments, closing concurrent over-allocation races.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('finance-allocation-student:' || payment_row.student_id, 0)
    );

    SELECT * INTO payment_row
    FROM public.finance_payments
    WHERE id = NEW.payment_id;

    SELECT * INTO obligation_row
    FROM public.finance_obligations
    WHERE id = NEW.obligation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allocation obligation % does not exist.', NEW.obligation_id;
    END IF;

    IF payment_row.status <> 'posted'
       OR payment_row.allocation_status <> 'strict' THEN
        RAISE EXCEPTION 'Only posted strict-ledger payments may receive allocations.';
    END IF;

    IF obligation_row.student_id IS DISTINCT FROM payment_row.student_id THEN
        RAISE EXCEPTION 'Payment and obligation must belong to the same student.';
    END IF;

    IF obligation_row.approval_status <> 'approved'
       OR obligation_row.status = 'void'
       OR obligation_row.balance <= 0 THEN
        RAISE EXCEPTION 'Allocations require an approved, non-void obligation with a balance.';
    END IF;

    IF NEW.amount > obligation_row.balance THEN
        RAISE EXCEPTION 'Allocation % exceeds obligation balance %.', NEW.amount, obligation_row.balance;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_payment_allocations_insert_guard ON public.finance_payment_allocations;
CREATE TRIGGER trg_finance_payment_allocations_insert_guard
BEFORE INSERT ON public.finance_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.finance_guard_allocation_insert();

CREATE OR REPLACE FUNCTION public.finance_assert_payment_reconciled(target_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    payment_row public.finance_payments%ROWTYPE;
    allocation_total numeric(12,2);
    allocation_count bigint;
BEGIN
    SELECT * INTO payment_row
    FROM public.finance_payments
    WHERE id = target_payment_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(sum(amount), 0), count(*)
    INTO allocation_total, allocation_count
    FROM public.finance_payment_allocations
    WHERE payment_id = target_payment_id;

    IF payment_row.allocation_status = 'legacy_snapshot' THEN
        IF allocation_count <> 0
           OR payment_row.allocated_amount <> payment_row.amount
           OR payment_row.unapplied_amount <> 0 THEN
            RAISE EXCEPTION 'Legacy snapshot payment % cannot carry allocation rows.', target_payment_id;
        END IF;
        RETURN;
    END IF;

    IF allocation_total IS DISTINCT FROM payment_row.allocated_amount
       OR payment_row.allocated_amount + payment_row.unapplied_amount <> payment_row.amount
       OR allocation_total > payment_row.amount THEN
        RAISE EXCEPTION
            'Payment % is not reconciled: allocation rows %, header allocated %, payment amount %.',
            target_payment_id, allocation_total,
            payment_row.allocated_amount, payment_row.amount;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.finance_payment_allocations allocation
        JOIN public.finance_obligations obligation
          ON obligation.id = allocation.obligation_id
        WHERE allocation.payment_id = target_payment_id
          AND obligation.student_id IS DISTINCT FROM payment_row.student_id
    ) THEN
        RAISE EXCEPTION 'Payment % contains an allocation for another student.', target_payment_id;
    END IF;

    IF payment_row.status = 'posted' AND EXISTS (
        SELECT 1
        FROM public.finance_payment_allocations allocation
        JOIN public.finance_obligations obligation
          ON obligation.id = allocation.obligation_id
        WHERE allocation.payment_id = target_payment_id
          AND (
              obligation.approval_status <> 'approved'
              OR obligation.status = 'void'
          )
    ) THEN
        RAISE EXCEPTION 'Posted payment % is allocated to an ineligible obligation.', target_payment_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_assert_obligation_reconciled(target_obligation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    obligation_row public.finance_obligations%ROWTYPE;
    posted_allocation_total numeric(12,2);
BEGIN
    SELECT * INTO obligation_row
    FROM public.finance_obligations
    WHERE id = target_obligation_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT COALESCE(sum(allocation.amount), 0)
    INTO posted_allocation_total
    FROM public.finance_payment_allocations allocation
    JOIN public.finance_payments payment
      ON payment.id = allocation.payment_id
    WHERE allocation.obligation_id = target_obligation_id
      AND payment.status = 'posted'
      AND payment.allocation_status = 'strict';

    IF obligation_row.obligation_type = 'adjustment'
       AND posted_allocation_total <> 0 THEN
        RAISE EXCEPTION 'Adjustment obligation % cannot receive payments.', target_obligation_id;
    END IF;

    IF posted_allocation_total > 0
       AND (
           obligation_row.approval_status <> 'approved'
           OR obligation_row.status = 'void'
       ) THEN
        RAISE EXCEPTION 'Obligation % has posted allocations but is not eligible.', target_obligation_id;
    END IF;

    IF obligation_row.legacy_paid_amount + posted_allocation_total
       IS DISTINCT FROM obligation_row.paid_amount THEN
        RAISE EXCEPTION
            'Obligation % is not reconciled: legacy paid %, posted allocations %, header paid %.',
            target_obligation_id, obligation_row.legacy_paid_amount,
            posted_allocation_total, obligation_row.paid_amount;
    END IF;

    IF obligation_row.obligation_type <> 'adjustment'
       AND obligation_row.legacy_paid_amount + posted_allocation_total > obligation_row.amount THEN
        RAISE EXCEPTION 'Obligation % is over-allocated.', target_obligation_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_deferred_check_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    obligation_key uuid;
BEGIN
    PERFORM public.finance_assert_payment_reconciled(NEW.id);

    FOR obligation_key IN
        SELECT allocation.obligation_id
        FROM public.finance_payment_allocations allocation
        WHERE allocation.payment_id = NEW.id
    LOOP
        PERFORM public.finance_assert_obligation_reconciled(obligation_key);
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_deferred_check_obligation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.finance_assert_obligation_reconciled(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_deferred_check_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.finance_assert_payment_reconciled(OLD.payment_id);
        PERFORM public.finance_assert_obligation_reconciled(OLD.obligation_id);
    ELSE
        PERFORM public.finance_assert_payment_reconciled(NEW.payment_id);
        PERFORM public.finance_assert_obligation_reconciled(NEW.obligation_id);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_payments_reconcile ON public.finance_payments;
CREATE CONSTRAINT TRIGGER trg_finance_payments_reconcile
AFTER INSERT OR UPDATE ON public.finance_payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.finance_deferred_check_payment();

DROP TRIGGER IF EXISTS trg_finance_obligations_reconcile ON public.finance_obligations;
CREATE CONSTRAINT TRIGGER trg_finance_obligations_reconcile
AFTER INSERT OR UPDATE ON public.finance_obligations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.finance_deferred_check_obligation();

DROP TRIGGER IF EXISTS trg_finance_payment_allocations_reconcile ON public.finance_payment_allocations;
CREATE CONSTRAINT TRIGGER trg_finance_payment_allocations_reconcile
AFTER INSERT OR UPDATE OR DELETE ON public.finance_payment_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.finance_deferred_check_allocation();
-- ---------------------------------------------------------------------------
-- Restrict direct Data API access. The Express API performs capability checks
-- and connects through the server-side database role.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    finance_table text;
    finance_tables text[] := ARRAY[
        'finance_fee_schedules',
        'finance_student_fee_agreements',
        'finance_billing_runs',
        'finance_obligations',
        'finance_payments',
        'finance_payment_allocations',
        'finance_staff_permissions',
        'finance_audit_events',
        'charge_categories',
        'payment_accounts'
    ];
BEGIN
    FOREACH finance_table IN ARRAY finance_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', finance_table);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', finance_table);
    END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.finance_audit_events_id_seq FROM anon, authenticated;

