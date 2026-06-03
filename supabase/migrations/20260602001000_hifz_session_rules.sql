-- Hifz Session Rules
-- Additive only: this does not alter attendance history, Hifz logs, or existing schedules.

CREATE TABLE IF NOT EXISTS hifz_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    name text NOT NULL,
    code text NOT NULL,
    start_time time,
    end_time time,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hifz_sessions ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hifz_sessions_year_code_unique
ON hifz_sessions (academic_year_id, lower(code));

CREATE INDEX IF NOT EXISTS idx_hifz_sessions_year_active
ON hifz_sessions (academic_year_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS hifz_session_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    hifz_session_id uuid NOT NULL REFERENCES hifz_sessions(id) ON DELETE CASCADE,
    standard text NOT NULL,
    section text,
    mentor_id uuid REFERENCES staff(id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    effective_from date,
    effective_until date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hifz_session_rules ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hifz_session_rules_unique
ON hifz_session_rules (
    academic_year_id,
    hifz_session_id,
    standard,
    COALESCE(section, ''),
    COALESCE(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS idx_hifz_session_rules_lookup
ON hifz_session_rules (academic_year_id, hifz_session_id, standard, section)
WHERE is_active = true;

CREATE TABLE IF NOT EXISTS student_hifz_session_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    student_id text NOT NULL REFERENCES students(adm_no) ON DELETE CASCADE,
    hifz_session_id uuid NOT NULL REFERENCES hifz_sessions(id) ON DELETE CASCADE,
    assignment_type text NOT NULL CHECK (assignment_type IN ('include', 'exclude')),
    reason text,
    effective_from date,
    effective_until date,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_hifz_session_assignments ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_hifz_session_assignments_unique
ON student_hifz_session_assignments (academic_year_id, student_id, hifz_session_id);

CREATE INDEX IF NOT EXISTS idx_student_hifz_session_assignments_lookup
ON student_hifz_session_assignments (academic_year_id, hifz_session_id, student_id)
WHERE is_active = true;
