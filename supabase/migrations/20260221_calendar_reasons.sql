-- Migration: Calendar Enhancement - Leave & Cancellation Management
-- Adds columns for per-session cancellation, standard-specific leave, and reason tracking

-- 1. Cancellation reason for full holidays
ALTER TABLE public.academic_calendar 
  ADD COLUMN IF NOT EXISTS cancellation_reason_type TEXT;

ALTER TABLE public.academic_calendar 
  ADD COLUMN IF NOT EXISTS cancellation_reason_text TEXT;

-- 2. Per-session cancellation: { "session_id": { "reason_type": "...", "reason_text": "..." } }
ALTER TABLE public.academic_calendar 
  ADD COLUMN IF NOT EXISTS cancelled_sessions JSONB DEFAULT '{}';

-- 3. Standard-specific leave: ["5th", "6th", "7th"]
ALTER TABLE public.academic_calendar 
  ADD COLUMN IF NOT EXISTS leave_standards TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 4. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
