-- Link weekly attendance schedules to the exact department/division rosters they serve.
-- Existing schedules remain valid and continue to use their standards fallback.

CREATE TABLE IF NOT EXISTS public.attendance_schedule_groups (
    schedule_id uuid NOT NULL REFERENCES public.attendance_schedules(id) ON DELETE CASCADE,
    group_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    department text NOT NULL CHECK (department IN ('hifz', 'school', 'madrasa')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (schedule_id, group_id),
    FOREIGN KEY (group_id, academic_year_id, department)
        REFERENCES public.attendance_groups(id, academic_year_id, department)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_attendance_schedule_groups_group
    ON public.attendance_schedule_groups (group_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_attendance_schedule_groups_schedule
    ON public.attendance_schedule_groups (schedule_id);

ALTER TABLE public.attendance_schedule_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendance schedule groups readable" ON public.attendance_schedule_groups;
CREATE POLICY "Attendance schedule groups readable"
    ON public.attendance_schedule_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages attendance schedule groups" ON public.attendance_schedule_groups;
CREATE POLICY "Admin manages attendance schedule groups"
    ON public.attendance_schedule_groups FOR ALL USING (public.is_admin_or_principal());
