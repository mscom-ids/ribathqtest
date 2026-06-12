-- =============================================================================
-- PHASE 3 PERFORMANCE INDEXES — Fixes remaining [SLOW DB] queries
-- =============================================================================
-- Run:  node apply_indexes3.js
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STAFF TABLE
--    "SELECT id FROM staff WHERE id = $1 OR profile_id = $1 OR email = $2"
--    runs on EVERY API request via getStaffId(). OR queries can't use a
--    single index efficiently. We add individual indexes so Postgres uses
--    an index scan per branch and merges via BitmapOr.
-- ---------------------------------------------------------------------------

-- id column (may already be PK, added for safety)
CREATE INDEX IF NOT EXISTS idx_staff_id_btree
    ON staff (id);

-- profile_id — used in the OR lookup
CREATE INDEX IF NOT EXISTS idx_staff_profile_id_lookup
    ON staff (profile_id)
    WHERE profile_id IS NOT NULL;

-- email — used in the OR lookup
CREATE INDEX IF NOT EXISTS idx_staff_email_lookup
    ON staff (email)
    WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. STUDENT_ATTENDANCE_MARKS TABLE
--    "WHERE student_id = ANY($1) AND date = $2"
--    "WHERE schedule_id = $1 AND date = $2"
--    "WHERE student_id = X AND date BETWEEN X AND Y"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_sam_student_date
    ON student_attendance_marks (student_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_sam_schedule_date
    ON student_attendance_marks (schedule_id, date DESC);

-- Composite for "date = $2 AND student_id = ANY($1)" pattern
CREATE INDEX IF NOT EXISTS idx_sam_date_student
    ON student_attendance_marks (date DESC, student_id);

-- ---------------------------------------------------------------------------
-- 3. MENTOR_DELEGATIONS TABLE
--    "WHERE from_staff_id = $1 AND status = 'approved'"
--    "WHERE to_staff_id = $1 AND status = 'approved'"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_delegations_from_status
    ON mentor_delegations (from_staff_id, status);

CREATE INDEX IF NOT EXISTS idx_delegations_to_status
    ON mentor_delegations (to_staff_id, status);

-- ---------------------------------------------------------------------------
-- 4. HIFZ_LOGS TABLE — Composite indexes for the two hot query patterns
--
--    Pattern A: DISTINCT ON per student, filter by mode
--    "WHERE student_id = ANY($1) AND mode = 'New Verses'
--     ORDER BY student_id, entry_date DESC, created_at"
--
--    Pattern B: per student, per date
--    "WHERE student_id = ANY($1) AND entry_date = $2"
-- ---------------------------------------------------------------------------

-- Covers pattern A (most expensive DISTINCT ON query)
CREATE INDEX IF NOT EXISTS idx_hifz_logs_student_mode_date
    ON hifz_logs (student_id, mode, entry_date DESC);

-- Covers pattern B (daily staff view)
CREATE INDEX IF NOT EXISTS idx_hifz_logs_student_entrydate
    ON hifz_logs (student_id, entry_date DESC);

-- created_at for tie-breaking in ORDER BY
CREATE INDEX IF NOT EXISTS idx_hifz_logs_created_at
    ON hifz_logs (created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. ATTENDANCE_SCHEDULES TABLE
--    "WHERE academic_year_id = $1 AND (is_deleted = false OR is_deleted IS NULL)
--       AND effective_from <= $2 AND ..."
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_year_active
    ON attendance_schedules (academic_year_id, effective_from)
    WHERE is_deleted IS DISTINCT FROM true;

-- ---------------------------------------------------------------------------
-- 6. ATTENDANCE TABLE (class events / marks tables)
--    "WHERE date >= X AND date <= Y AND department = 'Hifz'"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_date_dept
    ON attendance (date, department);

-- ---------------------------------------------------------------------------
-- 7. ANALYZE all modified tables
-- ---------------------------------------------------------------------------

ANALYZE staff;
ANALYZE student_attendance_marks;
ANALYZE mentor_delegations;
ANALYZE hifz_logs;
ANALYZE attendance_schedules;
ANALYZE attendance;
