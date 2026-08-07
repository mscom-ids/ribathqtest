-- Add effective date range to attendance_group_students so that
-- moving a student between groups preserves their history.
-- Previously, a group-change DELETE'd the old row; from now on
-- the old row gets effective_until set and a new row is inserted,
-- giving the attendance report the data it needs to count planned
-- class days correctly across both the old and the new group.

SET search_path = public, extensions;

-- 1. Add the two date columns (nullable first so the UPDATE can set them).
ALTER TABLE attendance_group_students
    ADD COLUMN IF NOT EXISTS effective_from date,
    ADD COLUMN IF NOT EXISTS effective_until date;

-- 2. Backfill effective_from from created_at for every existing row.
UPDATE attendance_group_students
    SET effective_from = created_at::date
    WHERE effective_from IS NULL;

-- 3. Now lock in NOT NULL + default for future inserts.
ALTER TABLE attendance_group_students
    ALTER COLUMN effective_from SET NOT NULL,
    ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

-- 4. Drop the old unique constraints that prevent a student from
--    having more than one row per (year, dept, student).
ALTER TABLE attendance_group_students
    DROP CONSTRAINT IF EXISTS attendance_group_students_academic_year_id_department_student_id_key,
    DROP CONSTRAINT IF EXISTS attendance_group_students_group_id_student_id_key;

-- 5. Partial unique index: only one *active* (effective_until IS NULL)
--    membership per (year, dept, student) at any given time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ags_active_student_dept_year
    ON attendance_group_students (academic_year_id, department, student_id)
    WHERE effective_until IS NULL;

-- 6. Supporting index for the attendance-report date-range query.
CREATE INDEX IF NOT EXISTS idx_ags_student_effective_dates
    ON attendance_group_students (student_id, academic_year_id, department, effective_from, effective_until);
