-- Additive performance helpers only.
-- This migration does not delete or mutate source history tables.
-- It creates current-state/summary tables that can be rebuilt from existing data.

CREATE TABLE IF NOT EXISTS public.student_current_presence (
    student_id text PRIMARY KEY REFERENCES public.students(adm_no) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'inside'
        CHECK (status IN ('inside', 'outside', 'on-campus')),
    active_leave_id uuid REFERENCES public.student_leaves(id) ON DELETE SET NULL,
    leave_type text,
    expected_return timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_current_presence_status
    ON public.student_current_presence (status, leave_type, expected_return);

CREATE INDEX IF NOT EXISTS idx_student_current_presence_leave
    ON public.student_current_presence (active_leave_id);

CREATE TABLE IF NOT EXISTS public.leave_dashboard_summary (
    id text PRIMARY KEY DEFAULT 'global',
    total_outside integer NOT NULL DEFAULT 0,
    out_campus integer NOT NULL DEFAULT 0,
    on_campus integer NOT NULL DEFAULT 0,
    institutional integer NOT NULL DEFAULT 0,
    outdoor integer NOT NULL DEFAULT 0,
    overdue integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_attendance_summary (
    summary_date date NOT NULL,
    scope text NOT NULL DEFAULT 'global',
    present integer NOT NULL DEFAULT 0,
    absent integer NOT NULL DEFAULT 0,
    late integer NOT NULL DEFAULT 0,
    leave_count integer NOT NULL DEFAULT 0,
    total integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (summary_date, scope)
);

CREATE TABLE IF NOT EXISTS public.student_report_summary (
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    attendance jsonb NOT NULL DEFAULT '{}'::jsonb,
    hifz_progress text,
    latest_exam_score text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_student_report_summary_period
    ON public.student_report_summary (period_start, period_end);

CREATE OR REPLACE FUNCTION public.refresh_student_current_presence_for_student(p_student_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.student_current_presence (
        student_id,
        status,
        active_leave_id,
        leave_type,
        expected_return,
        updated_at
    )
    SELECT
        s.adm_no,
        CASE
            WHEN active_leave.id IS NULL THEN 'inside'
            WHEN active_leave.leave_type IN ('on-campus', 'internal') THEN 'on-campus'
            ELSE 'outside'
        END,
        active_leave.id,
        active_leave.leave_type,
        active_leave.end_datetime,
        now()
    FROM public.students s
    LEFT JOIN LATERAL (
        SELECT sl.id, sl.leave_type, sl.end_datetime, sl.created_at
        FROM public.student_leaves sl
        WHERE sl.student_id = s.adm_no
          AND sl.status IN ('outside', 'approved', 'pending')
        ORDER BY
            CASE
                WHEN sl.status = 'outside' THEN 1
                WHEN sl.status = 'approved' THEN 2
                ELSE 3
            END,
            sl.created_at DESC
        LIMIT 1
    ) active_leave ON true
    WHERE s.adm_no = p_student_id
    ON CONFLICT (student_id) DO UPDATE SET
        status = EXCLUDED.status,
        active_leave_id = EXCLUDED.active_leave_id,
        leave_type = EXCLUDED.leave_type,
        expected_return = EXCLUDED.expected_return,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_student_current_presence_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.refresh_student_current_presence_for_student(OLD.student_id);
        RETURN OLD;
    END IF;

    PERFORM public.refresh_student_current_presence_for_student(NEW.student_id);

    IF TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id THEN
        PERFORM public.refresh_student_current_presence_for_student(OLD.student_id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_student_current_presence ON public.student_leaves;
CREATE TRIGGER trg_refresh_student_current_presence
AFTER INSERT OR UPDATE OR DELETE ON public.student_leaves
FOR EACH ROW EXECUTE FUNCTION public.refresh_student_current_presence_trigger();

CREATE OR REPLACE FUNCTION public.refresh_leave_dashboard_summary()
RETURNS void
LANGUAGE sql
AS $$
    INSERT INTO public.leave_dashboard_summary (
        id,
        total_outside,
        out_campus,
        on_campus,
        institutional,
        outdoor,
        overdue,
        updated_at
    )
    SELECT
        'global',
        COUNT(*) FILTER (WHERE status = 'outside')::integer,
        COUNT(*) FILTER (WHERE status = 'outside' AND leave_type IN ('out-campus', 'personal'))::integer,
        COUNT(*) FILTER (WHERE status = 'on-campus')::integer,
        COUNT(*) FILTER (WHERE status = 'outside' AND leave_type = 'institutional')::integer,
        COUNT(*) FILTER (WHERE status = 'outside' AND leave_type = 'outdoor')::integer,
        COUNT(*) FILTER (WHERE status IN ('outside', 'on-campus') AND expected_return IS NOT NULL AND expected_return < now())::integer,
        now()
    FROM public.student_current_presence
    ON CONFLICT (id) DO UPDATE SET
        total_outside = EXCLUDED.total_outside,
        out_campus = EXCLUDED.out_campus,
        on_campus = EXCLUDED.on_campus,
        institutional = EXCLUDED.institutional,
        outdoor = EXCLUDED.outdoor,
        overdue = EXCLUDED.overdue,
        updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.refresh_leave_dashboard_summary_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM public.refresh_leave_dashboard_summary();
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_leave_dashboard_summary ON public.student_current_presence;
CREATE TRIGGER trg_refresh_leave_dashboard_summary
AFTER INSERT OR UPDATE OR DELETE ON public.student_current_presence
FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_leave_dashboard_summary_trigger();

-- Initial backfill from existing data. This is safe and can be rerun.
INSERT INTO public.student_current_presence (
    student_id,
    status,
    active_leave_id,
    leave_type,
    expected_return,
    updated_at
)
SELECT
    s.adm_no,
    CASE
        WHEN active_leave.id IS NULL THEN 'inside'
        WHEN active_leave.leave_type IN ('on-campus', 'internal') THEN 'on-campus'
        ELSE 'outside'
    END,
    active_leave.id,
    active_leave.leave_type,
    active_leave.end_datetime,
    now()
FROM public.students s
LEFT JOIN LATERAL (
    SELECT sl.id, sl.leave_type, sl.end_datetime, sl.created_at
    FROM public.student_leaves sl
    WHERE sl.student_id = s.adm_no
      AND sl.status IN ('outside', 'approved', 'pending')
    ORDER BY
        CASE
            WHEN sl.status = 'outside' THEN 1
            WHEN sl.status = 'approved' THEN 2
            ELSE 3
        END,
        sl.created_at DESC
    LIMIT 1
) active_leave ON true
ON CONFLICT (student_id) DO UPDATE SET
    status = EXCLUDED.status,
    active_leave_id = EXCLUDED.active_leave_id,
    leave_type = EXCLUDED.leave_type,
    expected_return = EXCLUDED.expected_return,
    updated_at = now();

SELECT public.refresh_leave_dashboard_summary();

ANALYZE public.student_current_presence;
ANALYZE public.leave_dashboard_summary;
ANALYZE public.daily_attendance_summary;
ANALYZE public.student_report_summary;
