-- Conflict-safe native attendance synchronization.
--
-- A timetable revision protects schedule/roster topology while the per-date
-- revision survives cancel -> restore cycles. Native drafts send both values
-- plus a roster-state hash and are rejected when any authoritative state moved.

ALTER TABLE public.attendance_schedules
  ADD COLUMN IF NOT EXISTS mobile_revision bigint NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.mobile_attendance_session_revisions (
  schedule_id uuid NOT NULL REFERENCES public.attendance_schedules(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_mobile_attendance_session_revisions_updated
  ON public.mobile_attendance_session_revisions(updated_at DESC);

CREATE OR REPLACE FUNCTION public.bump_attendance_schedule_mobile_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mobile_revision = OLD.mobile_revision THEN
    NEW.mobile_revision := OLD.mobile_revision + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_schedule_mobile_revision ON public.attendance_schedules;
CREATE TRIGGER trg_attendance_schedule_mobile_revision
BEFORE UPDATE ON public.attendance_schedules
FOR EACH ROW EXECUTE FUNCTION public.bump_attendance_schedule_mobile_revision();

CREATE OR REPLACE FUNCTION public.bump_mobile_attendance_session_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_schedule uuid := COALESCE(NEW.schedule_id, OLD.schedule_id);
  target_date date := COALESCE(NEW.date, OLD.date);
BEGIN
  INSERT INTO public.mobile_attendance_session_revisions(schedule_id, session_date, revision, updated_at)
  VALUES (target_schedule, target_date, 1, now())
  ON CONFLICT (schedule_id, session_date) DO UPDATE
  SET revision = public.mobile_attendance_session_revisions.revision + 1,
      updated_at = now();
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mobile_attendance_cancellation_revision ON public.attendance_cancellations;
CREATE TRIGGER trg_mobile_attendance_cancellation_revision
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_cancellations
FOR EACH ROW EXECUTE FUNCTION public.bump_mobile_attendance_session_revision();

DROP TRIGGER IF EXISTS trg_mobile_attendance_mark_revision ON public.attendance_marks;
CREATE TRIGGER trg_mobile_attendance_mark_revision
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_marks
FOR EACH ROW EXECUTE FUNCTION public.bump_mobile_attendance_session_revision();

CREATE OR REPLACE FUNCTION public.bump_mobile_schedule_for_schedule_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.attendance_schedules
  SET mobile_revision = mobile_revision + 1
  WHERE id IN (COALESCE(NEW.schedule_id, OLD.schedule_id), COALESCE(OLD.schedule_id, NEW.schedule_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mobile_schedule_group_revision ON public.attendance_schedule_groups;
CREATE TRIGGER trg_mobile_schedule_group_revision
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_schedule_groups
FOR EACH ROW EXECUTE FUNCTION public.bump_mobile_schedule_for_schedule_group();

CREATE OR REPLACE FUNCTION public.bump_mobile_schedules_for_group_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.attendance_schedules schedule
  SET mobile_revision = schedule.mobile_revision + 1
  FROM public.attendance_schedule_groups link
  WHERE link.schedule_id = schedule.id
    AND link.group_id IN (COALESCE(NEW.group_id, OLD.group_id), COALESCE(OLD.group_id, NEW.group_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mobile_group_membership_revision ON public.attendance_group_students;
CREATE TRIGGER trg_mobile_group_membership_revision
AFTER INSERT OR UPDATE OR DELETE ON public.attendance_group_students
FOR EACH ROW EXECUTE FUNCTION public.bump_mobile_schedules_for_group_membership();

CREATE OR REPLACE FUNCTION public.bump_mobile_schedules_for_group_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.attendance_schedules schedule
  SET mobile_revision = schedule.mobile_revision + 1
  FROM public.attendance_schedule_groups link
  WHERE link.schedule_id = schedule.id
    AND link.group_id IN (COALESCE(NEW.id, OLD.id), COALESCE(OLD.id, NEW.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_mobile_group_revision ON public.attendance_groups;
CREATE TRIGGER trg_mobile_group_revision
AFTER UPDATE ON public.attendance_groups
FOR EACH ROW EXECUTE FUNCTION public.bump_mobile_schedules_for_group_change();

INSERT INTO public.mobile_attendance_session_revisions(schedule_id, session_date, revision, updated_at)
SELECT schedule_id, date, 1, COALESCE(created_at, now())
FROM public.attendance_cancellations
WHERE schedule_id IS NOT NULL
ON CONFLICT (schedule_id, session_date) DO NOTHING;

COMMENT ON TABLE public.mobile_attendance_session_revisions IS
  'Monotonic per-session revision used to reject stale native attendance drafts after cancel/restore changes.';
