BEGIN;
CREATE TABLE IF NOT EXISTS exam_portal_admin_credentials (
 exam_id uuid PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
 passcode_hash text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exam_portal_admin_sessions (
 token_hash text PRIMARY KEY,
 exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_portal_admin_sessions_exam ON exam_portal_admin_sessions(exam_id);
ALTER TABLE exam_portal_allocations ADD COLUMN IF NOT EXISTS mark_revision integer NOT NULL DEFAULT 0;
ALTER TABLE exam_portal_admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_portal_admin_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exam_portal_admin_credentials,exam_portal_admin_sessions FROM anon,authenticated;
COMMIT;
