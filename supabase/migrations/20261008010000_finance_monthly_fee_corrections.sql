-- A published monthly bill remains in the ledger when corrected. Only the
-- current (non-void) version must be unique for a student and service month.
DROP INDEX IF EXISTS public.uq_finance_obligations_student_monthly_fee;
CREATE UNIQUE INDEX uq_finance_obligations_student_monthly_fee
    ON public.finance_obligations (student_id, service_month)
    WHERE obligation_type = 'monthly_fee' AND status <> 'void';
