-- Drop existing INSERT policy (which was named "Staff Create Logs" or similar, but better to drop by name if we know it, or just drop all and recreate to be safe, but dropping by name is safer for migration if we are sure).
-- Checking schema.sql, the name is "Staff Create Logs".

DROP POLICY IF EXISTS "Staff Create Logs" ON hifz_logs;

-- Re-create with 7-day restriction on INSERT
CREATE POLICY "Staff Create Logs" ON hifz_logs
  FOR INSERT WITH CHECK (
    (
      -- Must be staff/admin/etc to insert at all
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff'))
    )
    AND
    (
      -- Enforce 7 day rule unless Admin/Principal
      (entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
      OR
      is_admin_or_principal()
    )
  );

-- Also ensure Update/Delete policies are strictly enforcing this (they seem to be in schema.sql but let's re-verify or leave as is if they were correct).
-- Schema.sql showed:
-- UPDATE: (role='staff' AND date >= 7days) OR admin
-- This looks correct. But let's add a comment/log.
