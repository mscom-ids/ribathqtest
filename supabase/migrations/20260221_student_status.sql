-- Add status column to students table for Active/Completed/Dropout tracking
ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'completed', 'dropout'));

-- Update existing students to 'active'
UPDATE students SET status = 'active' WHERE status IS NULL;
