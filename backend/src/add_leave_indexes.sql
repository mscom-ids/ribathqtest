-- Performance indexes for student_leaves & student_movements
-- These are critical for the /leaves/outside-students endpoint and all leave queries.
-- Run once against the database:
--   psql $DATABASE_URL -f src/add_leave_indexes.sql

-- 1. student_leaves: filter by status (the most common filter is status='outside')
CREATE INDEX IF NOT EXISTS idx_student_leaves_status
  ON student_leaves (status);

-- 2. student_leaves: composite for the outside-students query
CREATE INDEX IF NOT EXISTS idx_student_leaves_status_student
  ON student_leaves (status, student_id);

-- 3. student_leaves: lookup by student_id (used in almost every leave query)
CREATE INDEX IF NOT EXISTS idx_student_leaves_student_id
  ON student_leaves (student_id);

-- 4. student_leaves: lookup by institutional_leave_id
CREATE INDEX IF NOT EXISTS idx_student_leaves_institutional
  ON student_leaves (institutional_leave_id)
  WHERE institutional_leave_id IS NOT NULL;

-- 5. student_leaves: lookup by group_id
CREATE INDEX IF NOT EXISTS idx_student_leaves_group_id
  ON student_leaves (group_id)
  WHERE group_id IS NOT NULL;

-- 6. student_leaves: ordering by created_at (used in getLeavesFilter, getAllLeaves)
CREATE INDEX IF NOT EXISTS idx_student_leaves_created_at
  ON student_leaves (created_at DESC);

-- 7. student_movements: lookup by leave_id + direction (critical for the LATERAL join)
CREATE INDEX IF NOT EXISTS idx_student_movements_leave_dir
  ON student_movements (leave_id, direction, timestamp DESC);

-- 8. student_movements: lookup by student_id
CREATE INDEX IF NOT EXISTS idx_student_movements_student_id
  ON student_movements (student_id);

-- 9. student_movements: ordering by timestamp (for movement history)
CREATE INDEX IF NOT EXISTS idx_student_movements_timestamp
  ON student_movements (timestamp DESC);

-- 10. staff: lookup by profile_id (used in JOINs for recorded_by)
CREATE INDEX IF NOT EXISTS idx_staff_profile_id
  ON staff (profile_id)
  WHERE profile_id IS NOT NULL;
