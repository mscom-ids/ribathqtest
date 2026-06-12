-- =============================================================================
-- PHASE 2 PERFORMANCE INDEXES — Fixes remaining [SLOW DB] queries
-- =============================================================================
-- Run:   node apply_indexes2.js
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STUDENTS TABLE — The main list query is still slow because the WHERE
--    clause filters on status AND the SELECT reads JSONB (comprehensive_details)
--    even in LIGHT mode (for the COALESCE on admission_date).
--
--    Root fix A: add a stored column for admission_date so we never touch JSONB.
--    Root fix B: composite index that covers the most common list query pattern.
-- ---------------------------------------------------------------------------

-- Composite: status + name (covers ORDER BY name with status filter)
CREATE INDEX IF NOT EXISTS idx_students_status_name
    ON students (status, name ASC);

-- Composite: for mentor-scoped lists (WHERE hifz_mentor_id = X AND status = 'active')
CREATE INDEX IF NOT EXISTS idx_students_hifz_mentor_status
    ON students (hifz_mentor_id, status)
    WHERE hifz_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_school_mentor_status
    ON students (school_mentor_id, status)
    WHERE school_mentor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_students_madrasa_mentor_status
    ON students (madrasa_mentor_id, status)
    WHERE madrasa_mentor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. HIFZ_LOGS TABLE — Queried by date range on every dashboard/report load.
--    "WHERE entry_date >= $1 AND entry_date <= $2" with no index = full scan.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_hifz_logs_entry_date
    ON hifz_logs (entry_date DESC);

-- Composite: student_id + entry_date (covers "WHERE student_id = X ORDER BY entry_date DESC")
CREATE INDEX IF NOT EXISTS idx_hifz_logs_student_date
    ON hifz_logs (student_id, entry_date DESC);

-- Covers: "WHERE student_id = ANY($1) AND entry_date = $2"
CREATE INDEX IF NOT EXISTS idx_hifz_logs_date_student
    ON hifz_logs (entry_date, student_id);

-- ---------------------------------------------------------------------------
-- 3. INSTITUTIONAL_LEAVES TABLE
--    "WHERE start_datetime < (date+1) AND end_datetime >= date" = full scan.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_institutional_leaves_start
    ON institutional_leaves (start_datetime);

CREATE INDEX IF NOT EXISTS idx_institutional_leaves_end
    ON institutional_leaves (end_datetime);

-- Composite covering the range query pattern
CREATE INDEX IF NOT EXISTS idx_institutional_leaves_range
    ON institutional_leaves (start_datetime, end_datetime);

-- ---------------------------------------------------------------------------
-- 4. ATTENDANCE TABLE — Used in hifz dashboard and reports
--    "WHERE date >= X AND date <= Y AND department = 'Hifz'"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_date
    ON attendance (date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_dept_date
    ON attendance (department, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_schedule_date
    ON attendance (schedule_id, date DESC);

-- ---------------------------------------------------------------------------
-- 5. ATTENDANCE_SCHEDULES TABLE
--    "WHERE effective_from <= $2 AND (effective_until IS NULL OR effective_until >= $1)"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_effective_from
    ON attendance_schedules (effective_from);

CREATE INDEX IF NOT EXISTS idx_attendance_schedules_effective_until
    ON attendance_schedules (effective_until)
    WHERE effective_until IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. STUDENT_CURRENT_PRESENCE TABLE
--    "WHERE student_id = X" and "WHERE status = 'outside'"
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_scp_student_id
    ON student_current_presence (student_id);

CREATE INDEX IF NOT EXISTS idx_scp_status
    ON student_current_presence (status);

CREATE INDEX IF NOT EXISTS idx_scp_status_student
    ON student_current_presence (status, student_id);

-- ---------------------------------------------------------------------------
-- 7. STUDENT_YEAR_SNAPSHOTS — mentor columns for staff-scoped queries
-- ---------------------------------------------------------------------------

-- Composite for the report join: academic_year_id + status filter
CREATE INDEX IF NOT EXISTS idx_sys_year_status
    ON student_year_snapshots (academic_year_id, status)
    WHERE status IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 8. ANALYZE — refresh planner statistics for all modified tables
-- ---------------------------------------------------------------------------

ANALYZE students;
ANALYZE hifz_logs;
ANALYZE institutional_leaves;
ANALYZE attendance;
ANALYZE attendance_schedules;
ANALYZE student_current_presence;
ANALYZE student_year_snapshots;
ANALYZE staff;
