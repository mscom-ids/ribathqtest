-- Conflict-safe native mentor leave synchronization.

ALTER TABLE public.student_leaves
  ADD COLUMN IF NOT EXISTS mobile_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mobile_mutation_id uuid,
  ADD COLUMN IF NOT EXISTS return_status text;

ALTER TABLE public.student_leaves
  DROP CONSTRAINT IF EXISTS student_leaves_return_status_check;

ALTER TABLE public.student_leaves
  ADD CONSTRAINT student_leaves_return_status_check
  CHECK (return_status IS NULL OR return_status IN ('normal', 'late'));

-- Legacy databases used exit/return while current controllers consistently
-- read and write out/in. Normalize once so movements cannot disappear from
-- current-presence queries or fail their check constraint.
ALTER TABLE public.student_movements
  DROP CONSTRAINT IF EXISTS student_movements_direction_check;

UPDATE public.student_movements
SET direction = CASE direction WHEN 'exit' THEN 'out' WHEN 'return' THEN 'in' ELSE direction END
WHERE direction IN ('exit', 'return');

ALTER TABLE public.student_movements
  ADD CONSTRAINT student_movements_direction_check CHECK (direction IN ('out', 'in'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_leaves_mobile_mutation
  ON public.student_leaves (created_by, mobile_mutation_id)
  WHERE mobile_mutation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_student_leave_mobile_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mobile_revision := COALESCE(OLD.mobile_revision, 0) + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_leave_mobile_revision ON public.student_leaves;
CREATE TRIGGER trg_student_leave_mobile_revision
BEFORE UPDATE ON public.student_leaves
FOR EACH ROW
EXECUTE FUNCTION public.bump_student_leave_mobile_revision();

CREATE OR REPLACE FUNCTION public.publish_student_leave_mobile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_student_id text := COALESCE(NEW.student_id, OLD.student_id);
  changed_leave_id text := COALESCE(NEW.id, OLD.id)::text;
  changed_revision bigint := GREATEST(COALESCE(NEW.mobile_revision, 1), COALESCE(OLD.mobile_revision, 1));
BEGIN
  INSERT INTO public.mobile_sync_changes (
    audience_staff_id, entity_type, entity_id, operation, entity_version, payload
  )
  SELECT DISTINCT device.staff_id,
         'mentor_leaves',
         changed_leave_id,
         'invalidate',
         changed_revision,
         jsonb_build_object('student_id', changed_student_id)
  FROM public.mobile_devices device
  JOIN public.students student ON student.adm_no = changed_student_id
  WHERE device.revoked_at IS NULL
    AND device.staff_id IN (
      student.hifz_mentor_id,
      student.school_mentor_id,
      student.madrasa_mentor_id
    );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_student_leave_mobile_change ON public.student_leaves;
CREATE TRIGGER trg_publish_student_leave_mobile_change
AFTER INSERT OR UPDATE OR DELETE ON public.student_leaves
FOR EACH ROW
EXECUTE FUNCTION public.publish_student_leave_mobile_change();

CREATE OR REPLACE FUNCTION public.publish_institutional_leave_mobile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mobile_sync_changes (
    audience_staff_id, entity_type, entity_id, operation, entity_version, payload
  )
  SELECT DISTINCT device.staff_id,
         'mentor_leaves',
         COALESCE(NEW.id, OLD.id)::text,
         'invalidate',
         GREATEST(1, (extract(epoch FROM COALESCE(NEW.created_at, OLD.created_at, now())) * 1000)::bigint),
         jsonb_build_object('institutional', true)
  FROM public.mobile_devices device
  WHERE device.revoked_at IS NULL;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_institutional_leave_mobile_change ON public.institutional_leaves;
CREATE TRIGGER trg_publish_institutional_leave_mobile_change
AFTER INSERT OR UPDATE OR DELETE ON public.institutional_leaves
FOR EACH ROW
EXECUTE FUNCTION public.publish_institutional_leave_mobile_change();

CREATE OR REPLACE FUNCTION public.publish_mobile_delegation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mobile_sync_changes (
    audience_staff_id, entity_type, entity_id, operation, entity_version, payload
  )
  SELECT DISTINCT device.staff_id,
         'mentor_assignments',
         COALESCE(NEW.id, OLD.id)::text,
         'invalidate',
         GREATEST(1, (extract(epoch FROM COALESCE(NEW.updated_at, OLD.updated_at, now())) * 1000)::bigint),
         jsonb_build_object('status', COALESCE(NEW.status, OLD.status))
  FROM public.mobile_devices device
  WHERE device.revoked_at IS NULL
    AND device.staff_id IN (
      COALESCE(NEW.from_staff_id, OLD.from_staff_id),
      COALESCE(NEW.to_staff_id, OLD.to_staff_id)
    );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_mobile_delegation_change ON public.mentor_delegations;
CREATE TRIGGER trg_publish_mobile_delegation_change
AFTER INSERT OR UPDATE OR DELETE ON public.mentor_delegations
FOR EACH ROW
EXECUTE FUNCTION public.publish_mobile_delegation_change();
