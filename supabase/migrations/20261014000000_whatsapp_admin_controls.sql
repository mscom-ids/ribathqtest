CREATE TABLE public.whatsapp_notification_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
    enabled BOOLEAN NOT NULL DEFAULT false,
    sender_id TEXT,
    production_started_at TIMESTAMPTZ,
    hourly_limit INTEGER NOT NULL DEFAULT 30 CHECK (hourly_limit BETWEEN 1 AND 500),
    daily_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_limit BETWEEN 1 AND 2000),
    min_interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (min_interval_seconds BETWEEN 20 AND 3600),
    max_age_hours INTEGER NOT NULL DEFAULT 24 CHECK (max_age_hours BETWEEN 1 AND 48),
    last_attempt_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.whatsapp_notification_settings(singleton) VALUES (true);

CREATE TABLE public.whatsapp_notification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE,
    notification_id UUID,
    kind TEXT NOT NULL CHECK (kind IN ('production', 'test')),
    sender_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'api_accepted', 'failed', 'uncertain')),
    error_code TEXT,
    actor_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_notification_attempts_time_idx ON public.whatsapp_notification_attempts(created_at);
CREATE INDEX whatsapp_notification_attempts_recipient_idx ON public.whatsapp_notification_attempts(recipient, created_at);

CREATE TABLE public.whatsapp_notification_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.whatsapp_notification_unlock_attempts (
    actor_id TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notification_unlock_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_notification_settings, public.whatsapp_notification_attempts,
    public.whatsapp_notification_audit, public.whatsapp_notification_unlock_attempts FROM anon, authenticated;
