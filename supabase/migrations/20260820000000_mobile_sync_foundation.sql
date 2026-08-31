-- Native mobile synchronization foundation.
--
-- This migration intentionally creates the transport/infrastructure tables
-- only. Domain tables are enrolled in synchronization one workflow at a time
-- so that authorization and conflict rules remain explicit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  installation_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  device_name text,
  app_version text,
  os_version text,
  push_token text,
  last_sync_cursor bigint NOT NULL DEFAULT 0 CHECK (last_sync_cursor >= 0),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (staff_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_devices_staff_active
  ON public.mobile_devices (staff_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mobile_devices_push_token
  ON public.mobile_devices (push_token)
  WHERE push_token IS NOT NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mobile_refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  replaced_by uuid REFERENCES public.mobile_refresh_sessions(id),
  expires_at timestamptz NOT NULL,
  family_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS idx_mobile_refresh_sessions_family
  ON public.mobile_refresh_sessions (family_id);

CREATE INDEX IF NOT EXISTS idx_mobile_refresh_sessions_device_active
  ON public.mobile_refresh_sessions (device_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mobile_sync_changes (
  sequence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  audience_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete', 'invalidate')),
  entity_version bigint NOT NULL DEFAULT 1 CHECK (entity_version > 0),
  payload jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_sync_changes_audience_sequence
  ON public.mobile_sync_changes (audience_staff_id, sequence_id);

CREATE TABLE IF NOT EXISTS public.mobile_mutation_receipts (
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.mobile_devices(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'rejected')),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_mutation_receipts_device_created
  ON public.mobile_mutation_receipts (device_id, created_at DESC);

ALTER TABLE public.mobile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_refresh_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_sync_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_mutation_receipts ENABLE ROW LEVEL SECURITY;

-- The Express API uses the server connection and remains the sole security
-- boundary for mobile sync. Browser/client Supabase roles get no direct access.
REVOKE ALL ON public.mobile_devices FROM anon, authenticated;
REVOKE ALL ON public.mobile_refresh_sessions FROM anon, authenticated;
REVOKE ALL ON public.mobile_sync_changes FROM anon, authenticated;
REVOKE ALL ON public.mobile_mutation_receipts FROM anon, authenticated;
