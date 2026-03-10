-- 1. Remove duplicates for (student_id, date) keeping latest
DELETE FROM attendance
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY student_id, date
             ORDER BY created_at DESC
           ) as r
    FROM attendance
  ) t
  WHERE t.r > 1
);

-- 2. Drop old constraint if exists (it might not exist if previous run failed partially, but safe to try)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_session_date_unique;

-- 3. Add new constraint
ALTER TABLE attendance ADD CONSTRAINT attendance_student_date_unique UNIQUE (student_id, date);
