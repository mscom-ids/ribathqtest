-- Migration: Add Department Structure
-- This adds department-specific standard columns to students, and a department column to attendance and exams

-- 1. Update Students Table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS hifz_standard text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_standard text;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS madrassa_standard text;

-- If they already had a standard, let's migrate it to 'school_standard' as a default to avoid data loss
UPDATE public.students SET school_standard = standard WHERE standard IS NOT NULL AND school_standard IS NULL;

-- 2. Update Exams Table
-- Create an enum for departments to ensure data integrity
DO $$ BEGIN
    CREATE TYPE department_enum AS ENUM ('Hifz', 'School', 'Madrassa');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS department department_enum DEFAULT 'School';

-- 3. Update Attendance Table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS department department_enum DEFAULT 'School';

-- 4. Fix exams type CHECK constraint to include 'Madrassa'
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_type_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_type_check CHECK (type IN ('School', 'Hifz', 'Madrassa'));

-- 5. Update Schema Cache
NOTIFY pgrst, 'reload schema';
