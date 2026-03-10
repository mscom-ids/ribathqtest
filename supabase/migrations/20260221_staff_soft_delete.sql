-- Add is_active column to staff table for soft deletion
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing staff to active
UPDATE public.staff SET is_active = true WHERE is_active IS NULL;
