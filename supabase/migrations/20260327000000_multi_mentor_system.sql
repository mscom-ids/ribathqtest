-- 1. Add the three new mentor columns
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS hifz_mentor_id UUID REFERENCES staff(id),
ADD COLUMN IF NOT EXISTS school_mentor_id UUID REFERENCES staff(id),
ADD COLUMN IF NOT EXISTS madrasa_mentor_id UUID REFERENCES staff(id);

-- 2. Migrate existing assigned usthad to hifz_mentor_id (only if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'assigned_usthad_id') THEN
        UPDATE students SET hifz_mentor_id = assigned_usthad_id WHERE assigned_usthad_id IS NOT NULL;
    END IF;
END $$;

-- 3. Drop the old column
ALTER TABLE students DROP COLUMN IF EXISTS assigned_usthad_id;
