-- Drop existing check constraints on role columns
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add updated constraints that include 'usthad', 'teacher', and retain 'staff' (for legacy rows)
ALTER TABLE public.staff ADD CONSTRAINT staff_role_check CHECK (role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff', 'usthad', 'teacher'));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff', 'parent', 'usthad', 'teacher'));
