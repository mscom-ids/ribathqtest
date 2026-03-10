-- Fix for reported schema issues
-- 1. Add 'updated_at' to 'profiles' table if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'updated_at') THEN
        ALTER TABLE "public"."profiles" ADD COLUMN "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- 2. Add 'phone' to 'staff' table if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'phone') THEN
        ALTER TABLE "public"."staff" ADD COLUMN "phone" TEXT;
    END IF;
END $$;

-- 3. Verify 'profiles' constraints (optional, ensuring id matches auth.users)
-- (No change needed unless constraint is missing, but usually profiles is created via trigger or manual insert as seen in code)

-- 4. Reload schema cache (In Supabase dashboard, this might happen automatically or via button, but running this SQL helps ensure it's applied)
NOTIFY pgrst, 'reload config';
