-- Migration: Add proper RLS policies on students table
-- This ensures authenticated admin/staff users can read students via the browser client

-- 1. Ensure RLS is enabled (idempotent)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 2. Admin / Principal / Vice-Principal / Accountant can SELECT all students
DROP POLICY IF EXISTS "Admin reads all students" ON public.students;
CREATE POLICY "Admin reads all students" ON public.students
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'principal', 'vice_principal', 'accountant')
        )
    );

-- 3. Admin can INSERT/UPDATE/DELETE students
DROP POLICY IF EXISTS "Admin manages students" ON public.students;
CREATE POLICY "Admin manages students" ON public.students
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- 4. Staff (mentors) can SELECT only their assigned students
DROP POLICY IF EXISTS "Staff reads assigned students" ON public.students;
CREATE POLICY "Staff reads assigned students" ON public.students
    FOR SELECT USING (
        assigned_usthad_id = auth.uid()
    );

-- 5. Also ensure profiles table has a read policy for authenticated users
-- (needed for the role lookups inside RLS policies above)
DROP POLICY IF EXISTS "Authenticated users read own profile" ON public.profiles;
CREATE POLICY "Authenticated users read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);
