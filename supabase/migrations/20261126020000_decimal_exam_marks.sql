BEGIN;
ALTER TABLE exam_portal_valuations ALTER COLUMN total TYPE numeric USING total::numeric;
COMMIT;
