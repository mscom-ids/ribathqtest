-- Add missing address and personal fields to students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS admission_date DATE,
  ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Indian',
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS post TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS place TEXT,
  ADD COLUMN IF NOT EXISTS local_body TEXT,
  ADD COLUMN IF NOT EXISTS aadhar TEXT,
  ADD COLUMN IF NOT EXISTS id_mark TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- Migrate existing data from comprehensive_details.basic into dedicated columns (non-destructive)
UPDATE students
SET
  gender       = COALESCE(gender,       comprehensive_details->'basic'->>'gender'),
  nationality  = COALESCE(nationality,  comprehensive_details->'basic'->>'nationality', 'Indian'),
  pincode      = COALESCE(pincode,      comprehensive_details->'basic'->>'pincode'),
  post         = COALESCE(post,         comprehensive_details->'basic'->>'post'),
  district     = COALESCE(district,     comprehensive_details->'basic'->>'district'),
  state        = COALESCE(state,        comprehensive_details->'basic'->>'state'),
  place        = COALESCE(place,        comprehensive_details->'basic'->>'place'),
  local_body   = COALESCE(local_body,   comprehensive_details->'basic'->>'local_body'),
  aadhar       = COALESCE(aadhar,       comprehensive_details->'basic'->>'aadhar'),
  id_mark      = COALESCE(id_mark,      comprehensive_details->'basic'->>'id_mark'),
  country      = COALESCE(country,      comprehensive_details->'basic'->>'country')
WHERE comprehensive_details IS NOT NULL AND comprehensive_details ? 'basic';
