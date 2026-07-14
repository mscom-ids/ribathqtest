-- Department-specific attendance groups for Hifz, School, and Madrasa.
-- Academic standard remains in academic_student_placements; attendance grouping is independent per department.

CREATE TABLE IF NOT EXISTS public.attendance_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    department text NOT NULL CHECK (department IN ('hifz', 'school', 'madrasa')),
    standard text NOT NULL CHECK (standard IN ('Non-class', '5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two')),
    division text NOT NULL CHECK (length(trim(division)) > 0),
    mentor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (academic_year_id, department, standard, division),
    UNIQUE (id, academic_year_id, department)
);

CREATE TABLE IF NOT EXISTS public.attendance_group_students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    academic_year_id uuid NOT NULL,
    department text NOT NULL CHECK (department IN ('hifz', 'school', 'madrasa')),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (group_id, academic_year_id, department)
        REFERENCES public.attendance_groups(id, academic_year_id, department)
        ON DELETE CASCADE,
    UNIQUE (academic_year_id, department, student_id),
    UNIQUE (group_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_groups_mentor_year_department
    ON public.attendance_groups (mentor_id, academic_year_id, department, standard)
    WHERE mentor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_groups_year_department_standard
    ON public.attendance_groups (academic_year_id, department, standard, division);
CREATE INDEX IF NOT EXISTS idx_attendance_group_students_group_student
    ON public.attendance_group_students (group_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_group_students_student_year
    ON public.attendance_group_students (student_id, academic_year_id, department);

ALTER TABLE public.attendance_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_group_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Attendance groups readable" ON public.attendance_groups;
CREATE POLICY "Attendance groups readable" ON public.attendance_groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manages attendance groups" ON public.attendance_groups;
CREATE POLICY "Admin manages attendance groups" ON public.attendance_groups
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Attendance group students readable" ON public.attendance_group_students;
CREATE POLICY "Attendance group students readable" ON public.attendance_group_students FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manages attendance group students" ON public.attendance_group_students;
CREATE POLICY "Admin manages attendance group students" ON public.attendance_group_students
    FOR ALL USING (public.is_admin_or_principal());