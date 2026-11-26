ALTER TABLE exam_subjects ADD COLUMN IF NOT EXISTS result_component_min_marks numeric
    CHECK (result_component_min_marks IS NULL OR (result_component_min_marks >= 0 AND result_component_min_marks <= max_marks));
COMMENT ON COLUMN exam_subjects.result_component_min_marks IS 'Optional individual minimum that must also be met within a combined result group.';
