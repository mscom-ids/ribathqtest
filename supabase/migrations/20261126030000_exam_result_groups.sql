BEGIN;
ALTER TABLE exam_subjects ADD COLUMN IF NOT EXISTS result_group text;
ALTER TABLE exam_subjects ADD COLUMN IF NOT EXISTS result_group_min_marks numeric;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'exam_subjects'::regclass AND conname = 'exam_subjects_result_group_pair') THEN
        ALTER TABLE exam_subjects ADD CONSTRAINT exam_subjects_result_group_pair CHECK (
            (result_group IS NULL AND result_group_min_marks IS NULL)
            OR (result_group IS NOT NULL AND length(trim(result_group)) > 0
                AND result_group_min_marks IS NOT NULL AND result_group_min_marks >= 0)
        );
    END IF;
END $$;
COMMENT ON COLUMN exam_subjects.result_group IS 'Subjects with the same group within a student standard share a combined pass threshold.';
COMMENT ON COLUMN exam_subjects.result_group_min_marks IS 'Minimum total required across the result group; every group must pass.';
COMMIT;
