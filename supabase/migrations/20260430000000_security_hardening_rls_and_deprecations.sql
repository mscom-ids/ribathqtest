-- Security hardening for tables that should not be exposed through the
-- Supabase Data API. The Express backend uses direct Postgres credentials, so
-- enabling RLS and revoking anon/authenticated grants blocks client-side table
-- access without changing backend behavior.

DO $$
DECLARE
    table_name text;
    restricted_tables text[] := ARRAY[
        'academic_breaks',
        'academic_calendar',
        'attendance_cancellations',
        'attendance_marks',
        'attendance_schedules',
        'chat_conversations',
        'chat_messages',
        'chat_participants',
        'events',
        'institutional_leaves',
        'leave_exceptions',
        'mentor_delegations',
        'staff_attendance',
        'student_attendance_marks',
        'student_leaves',
        'student_movements'
    ];
BEGIN
    FOREACH table_name IN ARRAY restricted_tables LOOP
        IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
        END IF;
    END LOOP;
END $$;

-- These legacy tables were checked as empty and have no application references.
-- Rename first instead of dropping, so rollback is possible if a hidden manual
-- workflow is discovered later.
DO $$
BEGIN
    IF to_regclass('public.finance_settings') IS NOT NULL
       AND to_regclass('public.deprecated_finance_settings_20260430') IS NULL THEN
        ALTER TABLE public.finance_settings RENAME TO deprecated_finance_settings_20260430;
    END IF;

    IF to_regclass('public.store_transactions') IS NOT NULL
       AND to_regclass('public.deprecated_store_transactions_20260430') IS NULL THEN
        ALTER TABLE public.store_transactions RENAME TO deprecated_store_transactions_20260430;
    END IF;

    IF to_regclass('public.store_wallet') IS NOT NULL
       AND to_regclass('public.deprecated_store_wallet_20260430') IS NULL THEN
        ALTER TABLE public.store_wallet RENAME TO deprecated_store_wallet_20260430;
    END IF;

    IF to_regclass('public.leaves') IS NOT NULL
       AND to_regclass('public.deprecated_leaves_20260430') IS NULL THEN
        ALTER TABLE public.leaves RENAME TO deprecated_leaves_20260430;
    END IF;
END $$;
