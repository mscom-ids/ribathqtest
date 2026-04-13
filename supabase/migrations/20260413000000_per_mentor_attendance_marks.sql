-- Fix attendance_marks to be per-mentor instead of global
-- Previously: UNIQUE (schedule_id, date) — one global record per session
-- Now: UNIQUE (schedule_id, date, marked_by) — one record per mentor per session

-- 1. Remove duplicate rows keeping the latest per (schedule_id, date, marked_by)
DELETE FROM attendance_marks
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY schedule_id, date, marked_by
             ORDER BY updated_at DESC
           ) AS r
    FROM attendance_marks
  ) t
  WHERE t.r > 1
);

-- 2. Drop the old global unique constraint
ALTER TABLE attendance_marks
  DROP CONSTRAINT IF EXISTS attendance_marks_schedule_id_date_key;

-- 3. Add new per-mentor unique constraint
ALTER TABLE attendance_marks
  ADD CONSTRAINT attendance_marks_schedule_date_mentor_key
  UNIQUE (schedule_id, date, marked_by);
