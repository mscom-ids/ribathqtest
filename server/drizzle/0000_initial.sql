CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE academic_year_status AS ENUM ('open', 'locked', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'mentor', 'parent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE student_status AS ENUM ('active', 'inactive', 'alumni');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE enrollment_status AS ENUM ('active', 'promoted', 'transferred', 'left');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE group_type AS ENUM ('hifz', 'tajweed', 'school', 'madrasa', 'revision', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status tenant_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  new_lesson_label text NOT NULL DEFAULT 'New Lesson',
  revision_label text NOT NULL DEFAULT 'Revision',
  retention_label text NOT NULL DEFAULT 'Retention',
  parent_audio_enabled boolean NOT NULL DEFAULT false,
  parent_discipline_visibility boolean NOT NULL DEFAULT false,
  late_feeds_discipline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  status academic_year_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_valid_range CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_tenant_label_idx ON academic_years(tenant_id, label);
CREATE UNIQUE INDEX IF NOT EXISTS academic_years_one_active_per_tenant_idx ON academic_years(tenant_id) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  password_hash text NOT NULL,
  status user_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS users_tenant_role_idx ON users(tenant_id, role);
CREATE INDEX IF NOT EXISTS users_tenant_status_idx ON users(tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_phone_unique_idx ON users(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_unique_idx ON users(tenant_id, email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_tenant_idx ON refresh_tokens(tenant_id);

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  admission_no text NOT NULL,
  full_name text NOT NULL,
  preferred_name text,
  date_of_birth date,
  joined_on date,
  status student_status NOT NULL DEFAULT 'active',
  mentor_id uuid REFERENCES users(id),
  parent_user_id uuid REFERENCES users(id),
  guardian_name text,
  guardian_phone text,
  address text,
  health_notes text,
  learning_plan text,
  current_surah integer,
  current_ayah integer,
  current_juz integer,
  current_page integer,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS students_tenant_admission_no_idx ON students(tenant_id, admission_no);
CREATE INDEX IF NOT EXISTS students_tenant_status_idx ON students(tenant_id, status);
CREATE INDEX IF NOT EXISTS students_tenant_mentor_status_idx ON students(tenant_id, mentor_id, status);
CREATE INDEX IF NOT EXISTS students_tenant_parent_status_idx ON students(tenant_id, parent_user_id, status);

CREATE TABLE IF NOT EXISTS student_progress_summary (
  student_id uuid PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  current_surah integer,
  current_ayah integer,
  current_juz integer,
  current_page integer,
  last_record_id uuid,
  last_recited_at timestamptz,
  approved_record_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_progress_summary_tenant_idx ON student_progress_summary(tenant_id);

CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS grades_tenant_name_idx ON grades(tenant_id, name);

CREATE TABLE IF NOT EXISTS divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS divisions_grade_name_idx ON divisions(grade_id, name);
CREATE INDEX IF NOT EXISTS divisions_tenant_idx ON divisions(tenant_id);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_type group_type NOT NULL DEFAULT 'custom',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS groups_year_name_idx ON groups(academic_year_id, name);
CREATE INDEX IF NOT EXISTS groups_tenant_year_idx ON groups(tenant_id, academic_year_id);

CREATE TABLE IF NOT EXISTS student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade_id uuid REFERENCES grades(id),
  division_id uuid REFERENCES divisions(id),
  status enrollment_status NOT NULL DEFAULT 'active',
  promoted_from_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS student_enrollments_year_student_idx ON student_enrollments(academic_year_id, student_id);
CREATE INDEX IF NOT EXISTS student_enrollments_tenant_year_idx ON student_enrollments(tenant_id, academic_year_id);
CREATE INDEX IF NOT EXISTS student_enrollments_student_idx ON student_enrollments(student_id);

CREATE TABLE IF NOT EXISTS group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_group_student_year_idx ON group_memberships(group_id, student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS group_memberships_tenant_year_idx ON group_memberships(tenant_id, academic_year_id);
CREATE INDEX IF NOT EXISTS group_memberships_student_idx ON group_memberships(student_id);

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenant_settings', 'academic_years', 'users', 'refresh_tokens', 'students',
    'student_progress_summary', 'grades', 'divisions', 'groups',
    'student_enrollments', 'group_memberships'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      tbl
    );
  END LOOP;
END $$;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);