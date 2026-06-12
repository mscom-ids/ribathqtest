-- =============================================================================
-- PERFORMANCE INDEXES — Run once to fix all slow queries
-- =============================================================================
-- All queries in the [SLOW DB] log are simple lookups/joins on unindexed cols.
-- This file adds every missing index. Safe to re-run (IF NOT EXISTS).
--
-- Apply with:
--   psql $DATABASE_URL -f src/add_performance_indexes.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STUDENTS TABLE
--    Root cause of the 300-1500ms student queries: full-table scans.
-- ---------------------------------------------------------------------------

-- PRIMARY lookup: adm_no is the natural PK used in every query
-- (may already be a PK, but ensure a plain btree index too for JOIN efficiency)
CREATE INDEX IF NOT EXISTS idx_students_adm_no
    ON students (adm_no);

-- Status filter — almost every query has WHERE status = 'active'
CREATE INDEX IF NOT EXISTS idx_students_status
    ON students (status);

-- Composite: status + adm_no — covers the most common "active student by id" pattern
CREATE INDEX IF NOT EXISTS idx_students_status_adm_no
    ON students (status, adm_no);

-- Mentor lookups — used in every mentor-scoped student list
CREATE INDEX IF NOT EXISTS idx_students_hifz_mentor
    ON students (hifz_mentor_id)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_mentor
    ON students (school_mentor_id)
    WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_madrasa_mentor
    ON students (madrasa_mentor_id)
    WHERE madrasa_mentor_id IS NOT NULL;

-- Name search (ILIKE '%x%') — partial match; a pg_trgm index helps if extension is enabled
-- Run ONLY if pg_trgm is enabled: CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX IF NOT EXISTS idx_students_name_trgm ON students USING gin (name gin_trgm_ops);

-- Sorting by standard (used by sort=standard)
CREATE INDEX IF NOT EXISTS idx_students_standard
    ON students (standard);

-- ---------------------------------------------------------------------------
-- 2. STAFF TABLE
--    The "SELECT ... FROM staff WHERE id = $1" query took ~1000ms every time.
--    Staff id is likely a UUID PK — but the join via profile_id is unindexed.
-- ---------------------------------------------------------------------------

-- Ensure staff.id has a regular btree index (may already be PK)
CREATE INDEX IF NOT EXISTS idx_staff_id
    ON staff (id);

-- profile_id is used in auth middleware to resolve staff from JWT sub
CREATE INDEX IF NOT EXISTS idx_staff_profile_id_uniq
    ON staff (profile_id)
    WHERE profile_id IS NOT NULL;

-- email lookup (login)
CREATE INDEX IF NOT EXISTS idx_staff_email
    ON staff (email)
    WHERE email IS NOT NULL;

-- role filter (used in staff listing and scoping)
CREATE INDEX IF NOT EXISTS idx_staff_role
    ON staff (role);

-- ---------------------------------------------------------------------------
-- 3. ACADEMIC_YEARS TABLE
--    "SELECT id FROM academic_years WHERE is_current = true" took 1041ms.
--    This runs on EVERY API request (via getAcademicYearContext).
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_academic_years_is_current
    ON academic_years (is_current)
    WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_academic_years_start_date
    ON academic_years (start_date DESC);

-- ---------------------------------------------------------------------------
-- 4. STUDENT_LEAVES TABLE
--    Covered by add_leave_indexes.sql — included here for completeness.
--    Safe to re-run (IF NOT EXISTS).
-- ---------------------------------------------------------------------------

-- Composite: the JOIN in getStudentById and the outside-students check
CREATE INDEX IF NOT EXISTS idx_student_leaves_student_status
    ON student_leaves (student_id, status);

-- ---------------------------------------------------------------------------
-- 5. STUDENT_YEAR_SNAPSHOTS TABLE
--    Used in getStudentYearSnapshotMap — hits academic_year_id + student_id.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sys_academic_year
    ON student_year_snapshots (academic_year_id);

CREATE INDEX IF NOT EXISTS idx_sys_student_id
    ON student_year_snapshots (student_id);

-- Composite: the exact query pattern used by getStudentYearSnapshotMap
CREATE INDEX IF NOT EXISTS idx_sys_year_student
    ON student_year_snapshots (academic_year_id, student_id);

-- Mentor lookups within snapshots (used in staff-scoped queries)
CREATE INDEX IF NOT EXISTS idx_sys_hifz_mentor
    ON student_year_snapshots (hifz_mentor_id)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sys_school_mentor
    ON student_year_snapshots (school_mentor_id)
    WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sys_madrasa_mentor
    ON student_year_snapshots (madrasa_mentor_id)
    WHERE madrasa_mentor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. ENROLLMENTS TABLE
--    Used by the new promotion workflow — needs indexes for fast filtering.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_enrollments_academic_year
    ON enrollments (academic_year_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id
    ON enrollments (student_id);

CREATE INDEX IF NOT EXISTS idx_enrollments_class_id
    ON enrollments (class_id);

-- Composite: filter by year + student (most common join pattern)
CREATE INDEX IF NOT EXISTS idx_enrollments_year_student
    ON enrollments (academic_year_id, student_id);

-- ---------------------------------------------------------------------------
-- 7. CLASSES TABLE
--    Filtered by academic_year_id + type on every class-setup / enrollment load.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_classes_academic_year
    ON classes (academic_year_id);

CREATE INDEX IF NOT EXISTS idx_classes_type
    ON classes (type);

CREATE INDEX IF NOT EXISTS idx_classes_year_type
    ON classes (academic_year_id, type);

-- ---------------------------------------------------------------------------
-- 8. ATTENDANCE_SCHEDULES TABLE
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_academic_year
    ON attendance_schedules (academic_year_id)
    WHERE academic_year_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. ANALYZE — updates planner statistics so new indexes are used immediately
-- ---------------------------------------------------------------------------

ANALYZE students;
ANALYZE staff;
ANALYZE academic_years;
ANALYZE student_leaves;
ANALYZE student_year_snapshots;
ANALYZE classes;
ANALYZE enrollments;
