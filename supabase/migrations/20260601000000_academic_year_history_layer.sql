-- Academic year history layer.
-- Additive and backward-compatible: does not delete, truncate, or rewrite production history.

CREATE TABLE IF NOT EXISTS public.academic_year_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL UNIQUE REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    school_fee_plan_id uuid,
    madrasa_fee_plan_id uuid,
    promotion_completed boolean NOT NULL DEFAULT false,
    year_locked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_school_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    school_standard text,
    school_section text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'completed')),
    joined_at timestamptz,
    left_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS public.student_madrasa_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    madrasa_standard text,
    madrasa_section text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'completed')),
    joined_at timestamptz,
    left_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS public.student_hifz_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL UNIQUE REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    mentor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    started_on date,
    completed_hifz boolean NOT NULL DEFAULT false,
    completed_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_year_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    school_standard text,
    school_section text,
    madrasa_standard text,
    madrasa_section text,
    hifz_mentor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (student_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS public.promotion_previews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    to_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    track_type text NOT NULL CHECK (track_type IN ('school', 'madrasa')),
    from_standard text,
    from_section text,
    to_standard text,
    to_section text,
    student_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled', 'expired')),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.promotion_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    to_academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    preview_id uuid REFERENCES public.promotion_previews(id) ON DELETE SET NULL,
    track_type text NOT NULL CHECK (track_type IN ('school', 'madrasa')),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promotion_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_batch_id uuid NOT NULL REFERENCES public.promotion_batches(id) ON DELETE RESTRICT,
    student_id text NOT NULL REFERENCES public.students(adm_no) ON DELETE RESTRICT,
    track_type text NOT NULL CHECK (track_type IN ('school', 'madrasa')),
    old_standard text,
    new_standard text,
    old_section text,
    new_section text,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_plans
    ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE RESTRICT;

ALTER TABLE public.exams
    ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE RESTRICT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'academic_year_settings'
          AND column_name = 'school_fee_plan_id'
    ) THEN
        ALTER TABLE public.academic_year_settings
            ADD CONSTRAINT academic_year_settings_school_fee_plan_fk
            FOREIGN KEY (school_fee_plan_id) REFERENCES public.fee_plans(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'academic_year_settings'
          AND column_name = 'madrasa_fee_plan_id'
    ) THEN
        ALTER TABLE public.academic_year_settings
            ADD CONSTRAINT academic_year_settings_madrasa_fee_plan_fk
            FOREIGN KEY (madrasa_fee_plan_id) REFERENCES public.fee_plans(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_school_enrollments_year_standard
    ON public.student_school_enrollments (academic_year_id, school_standard, school_section, status);

CREATE INDEX IF NOT EXISTS idx_student_school_enrollments_student_year
    ON public.student_school_enrollments (student_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_student_madrasa_enrollments_year_standard
    ON public.student_madrasa_enrollments (academic_year_id, madrasa_standard, madrasa_section, status);

CREATE INDEX IF NOT EXISTS idx_student_madrasa_enrollments_student_year
    ON public.student_madrasa_enrollments (student_id, academic_year_id);

CREATE INDEX IF NOT EXISTS idx_student_hifz_profiles_active_mentor
    ON public.student_hifz_profiles (active, mentor_id);

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_year_school
    ON public.student_year_snapshots (academic_year_id, school_standard, school_section, status);

CREATE INDEX IF NOT EXISTS idx_student_year_snapshots_year_madrasa
    ON public.student_year_snapshots (academic_year_id, madrasa_standard, madrasa_section, status);

CREATE INDEX IF NOT EXISTS idx_promotion_previews_status_expires
    ON public.promotion_previews (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_promotion_batches_year_track
    ON public.promotion_batches (from_academic_year_id, to_academic_year_id, track_type);

CREATE INDEX IF NOT EXISTS idx_promotion_logs_batch_student
    ON public.promotion_logs (promotion_batch_id, student_id);

CREATE INDEX IF NOT EXISTS idx_fee_plans_academic_year
    ON public.fee_plans (academic_year_id, effective_from);

CREATE INDEX IF NOT EXISTS idx_exams_academic_year
    ON public.exams (academic_year_id, department, start_date);

ALTER TABLE public.academic_year_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_school_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_madrasa_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_hifz_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_year_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academic year settings readable" ON public.academic_year_settings;
CREATE POLICY "Academic year settings readable" ON public.academic_year_settings
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages academic year settings" ON public.academic_year_settings;
CREATE POLICY "Admin manages academic year settings" ON public.academic_year_settings
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Academic history readable" ON public.student_school_enrollments;
CREATE POLICY "Academic history readable" ON public.student_school_enrollments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages school enrollment history" ON public.student_school_enrollments;
CREATE POLICY "Admin manages school enrollment history" ON public.student_school_enrollments
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Madrasa history readable" ON public.student_madrasa_enrollments;
CREATE POLICY "Madrasa history readable" ON public.student_madrasa_enrollments
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages madrasa enrollment history" ON public.student_madrasa_enrollments;
CREATE POLICY "Admin manages madrasa enrollment history" ON public.student_madrasa_enrollments
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Hifz profiles readable" ON public.student_hifz_profiles;
CREATE POLICY "Hifz profiles readable" ON public.student_hifz_profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages hifz profiles" ON public.student_hifz_profiles;
CREATE POLICY "Admin manages hifz profiles" ON public.student_hifz_profiles
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Student year snapshots readable" ON public.student_year_snapshots;
CREATE POLICY "Student year snapshots readable" ON public.student_year_snapshots
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages student year snapshots" ON public.student_year_snapshots;
CREATE POLICY "Admin manages student year snapshots" ON public.student_year_snapshots
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Promotion previews readable" ON public.promotion_previews;
CREATE POLICY "Promotion previews readable" ON public.promotion_previews
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages promotion previews" ON public.promotion_previews;
CREATE POLICY "Admin manages promotion previews" ON public.promotion_previews
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Promotion batches readable" ON public.promotion_batches;
CREATE POLICY "Promotion batches readable" ON public.promotion_batches
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages promotion batches" ON public.promotion_batches;
CREATE POLICY "Admin manages promotion batches" ON public.promotion_batches
    FOR ALL USING (public.is_admin_or_principal());

DROP POLICY IF EXISTS "Promotion logs readable" ON public.promotion_logs;
CREATE POLICY "Promotion logs readable" ON public.promotion_logs
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manages promotion logs" ON public.promotion_logs;
CREATE POLICY "Admin manages promotion logs" ON public.promotion_logs
    FOR ALL USING (public.is_admin_or_principal());

CREATE OR REPLACE FUNCTION public.academic_year_is_locked(p_academic_year_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((
        SELECT ays.year_locked
        FROM public.academic_year_settings ays
        WHERE ays.academic_year_id = p_academic_year_id
        LIMIT 1
    ), false);
$$;

CREATE OR REPLACE FUNCTION public.prevent_locked_academic_year_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    year_ids uuid[] := ARRAY[]::uuid[];
    year_id uuid;
BEGIN
    IF TG_TABLE_NAME = 'academic_year_settings' THEN
        IF TG_OP = 'DELETE' AND OLD.year_locked THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', OLD.academic_year_id;
        END IF;

        IF TG_OP = 'UPDATE'
           AND OLD.year_locked
           AND NEW.year_locked = OLD.year_locked
           AND (
                NEW.school_fee_plan_id IS DISTINCT FROM OLD.school_fee_plan_id
                OR NEW.madrasa_fee_plan_id IS DISTINCT FROM OLD.madrasa_fee_plan_id
                OR NEW.promotion_completed IS DISTINCT FROM OLD.promotion_completed
           ) THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', OLD.academic_year_id;
        END IF;

        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_TABLE_NAME IN ('student_school_enrollments', 'student_madrasa_enrollments', 'student_year_snapshots', 'classes', 'enrollments') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            year_ids := array_append(year_ids, OLD.academic_year_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            year_ids := array_append(year_ids, NEW.academic_year_id);
        END IF;
    ELSIF TG_TABLE_NAME IN ('weekly_schedule', 'class_events') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            SELECT array_append(year_ids, c.academic_year_id)
            INTO year_ids
            FROM public.classes c
            WHERE c.id = OLD.class_id;
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            SELECT array_append(year_ids, c.academic_year_id)
            INTO year_ids
            FROM public.classes c
            WHERE c.id = NEW.class_id;
        END IF;
    ELSIF TG_TABLE_NAME IN ('fee_plans', 'exams') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.academic_year_id IS NOT NULL THEN
            year_ids := array_append(year_ids, OLD.academic_year_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.academic_year_id IS NOT NULL THEN
            year_ids := array_append(year_ids, NEW.academic_year_id);
        END IF;
    ELSIF TG_TABLE_NAME IN ('promotion_previews', 'promotion_batches') THEN
        IF TG_OP IN ('UPDATE', 'DELETE') THEN
            year_ids := array_append(year_ids, OLD.from_academic_year_id);
            year_ids := array_append(year_ids, OLD.to_academic_year_id);
        END IF;
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            year_ids := array_append(year_ids, NEW.from_academic_year_id);
            year_ids := array_append(year_ids, NEW.to_academic_year_id);
        END IF;
    END IF;

    FOREACH year_id IN ARRAY year_ids LOOP
        IF year_id IS NOT NULL AND public.academic_year_is_locked(year_id) THEN
            RAISE EXCEPTION 'Academic year % is locked and cannot be modified without unlock.', year_id;
        END IF;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_locked_academic_year_settings ON public.academic_year_settings;
CREATE TRIGGER trg_guard_locked_academic_year_settings
BEFORE UPDATE OR DELETE ON public.academic_year_settings
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_school_enrollments ON public.student_school_enrollments;
CREATE TRIGGER trg_guard_locked_school_enrollments
BEFORE INSERT OR UPDATE OR DELETE ON public.student_school_enrollments
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_madrasa_enrollments ON public.student_madrasa_enrollments;
CREATE TRIGGER trg_guard_locked_madrasa_enrollments
BEFORE INSERT OR UPDATE OR DELETE ON public.student_madrasa_enrollments
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_year_snapshots ON public.student_year_snapshots;
CREATE TRIGGER trg_guard_locked_year_snapshots
BEFORE INSERT OR UPDATE OR DELETE ON public.student_year_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_fee_plans ON public.fee_plans;
CREATE TRIGGER trg_guard_locked_fee_plans
BEFORE INSERT OR UPDATE OR DELETE ON public.fee_plans
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_exams ON public.exams;
CREATE TRIGGER trg_guard_locked_exams
BEFORE INSERT OR UPDATE OR DELETE ON public.exams
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_promotion_previews ON public.promotion_previews;
CREATE TRIGGER trg_guard_locked_promotion_previews
BEFORE INSERT OR UPDATE OR DELETE ON public.promotion_previews
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_promotion_batches ON public.promotion_batches;
CREATE TRIGGER trg_guard_locked_promotion_batches
BEFORE INSERT OR UPDATE OR DELETE ON public.promotion_batches
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_classes ON public.classes;
CREATE TRIGGER trg_guard_locked_classes
BEFORE INSERT OR UPDATE OR DELETE ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_legacy_enrollments ON public.enrollments;
CREATE TRIGGER trg_guard_locked_legacy_enrollments
BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_weekly_schedule ON public.weekly_schedule;
CREATE TRIGGER trg_guard_locked_weekly_schedule
BEFORE INSERT OR UPDATE OR DELETE ON public.weekly_schedule
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();

DROP TRIGGER IF EXISTS trg_guard_locked_class_events ON public.class_events;
CREATE TRIGGER trg_guard_locked_class_events
BEFORE INSERT OR UPDATE OR DELETE ON public.class_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_academic_year_mutation();
