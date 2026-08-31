BEGIN;

CREATE OR REPLACE FUNCTION public.publish_finance_mobile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_row jsonb := COALESCE(to_jsonb(NEW), to_jsonb(OLD));
  changed_id text := COALESCE(changed_row ->> 'id', TG_TABLE_NAME);
  changed_type text := CASE TG_TABLE_NAME
    WHEN 'finance_obligations' THEN 'finance_obligation'
    WHEN 'finance_payments' THEN 'finance_payment'
    WHEN 'finance_payment_allocations' THEN 'finance_allocation'
    WHEN 'finance_staff_permissions' THEN 'finance_permission'
    ELSE 'finance_setup'
  END;
BEGIN
  INSERT INTO public.mobile_sync_changes (
    audience_staff_id, entity_type, entity_id, operation, entity_version, payload
  )
  SELECT device.staff_id,
         changed_type,
         changed_id,
         'invalidate',
         (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
         '{}'::jsonb
  FROM public.mobile_devices device
  WHERE device.revoked_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_obligations_mobile_change ON public.finance_obligations;
CREATE TRIGGER trg_finance_obligations_mobile_change
AFTER INSERT OR UPDATE ON public.finance_obligations
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

DROP TRIGGER IF EXISTS trg_finance_payments_mobile_change ON public.finance_payments;
CREATE TRIGGER trg_finance_payments_mobile_change
AFTER INSERT OR UPDATE ON public.finance_payments
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

DROP TRIGGER IF EXISTS trg_finance_allocations_mobile_change ON public.finance_payment_allocations;
CREATE TRIGGER trg_finance_allocations_mobile_change
AFTER INSERT OR UPDATE ON public.finance_payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

DROP TRIGGER IF EXISTS trg_finance_permissions_mobile_change ON public.finance_staff_permissions;
CREATE TRIGGER trg_finance_permissions_mobile_change
AFTER INSERT OR UPDATE ON public.finance_staff_permissions
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

DROP TRIGGER IF EXISTS trg_charge_categories_mobile_change ON public.charge_categories;
CREATE TRIGGER trg_charge_categories_mobile_change
AFTER INSERT OR UPDATE ON public.charge_categories
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

DROP TRIGGER IF EXISTS trg_payment_accounts_mobile_change ON public.payment_accounts;
CREATE TRIGGER trg_payment_accounts_mobile_change
AFTER INSERT OR UPDATE ON public.payment_accounts
FOR EACH ROW EXECUTE FUNCTION public.publish_finance_mobile_change();

COMMIT;
