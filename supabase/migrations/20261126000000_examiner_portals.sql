BEGIN;

ALTER TABLE exams ADD COLUMN IF NOT EXISTS portal_slug text UNIQUE;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE exams ADD CONSTRAINT exams_portal_slug_format CHECK (portal_slug IS NULL OR portal_slug ~ '^[a-z0-9][a-z0-9-]{1,79}$');
ALTER TABLE exam_subjects ADD COLUMN IF NOT EXISTS question_count integer;
ALTER TABLE exam_subjects ADD COLUMN IF NOT EXISTS question_max integer;
ALTER TABLE exam_subjects ADD CONSTRAINT exam_subjects_question_config CHECK (
 (question_count IS NULL AND question_max IS NULL) OR
 (question_count IS NOT NULL AND question_max IS NOT NULL AND question_count BETWEEN 1 AND 50 AND question_max BETWEEN 1 AND 100 AND max_marks = question_count * question_max)
);
UPDATE exams SET portal_slug = 'hifz-exam-' || left(id::text,8) WHERE department::text='Hifz' AND portal_slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exam_subjects_exam_id_id ON exam_subjects(exam_id,id);

CREATE TABLE exam_portal_centers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 code text NOT NULL,
 name text NOT NULL,
 examiner_name text NOT NULL DEFAULT '',
 passcode_hash text,
 locked boolean NOT NULL DEFAULT false,
 UNIQUE(exam_id,code), UNIQUE(exam_id,id)
);
CREATE TABLE exam_portal_allocations (
 exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 student_id text NOT NULL REFERENCES students(adm_no),
 center_id uuid NOT NULL,
 serial_no integer NOT NULL CHECK(serial_no > 0),
 student_name text NOT NULL,
 standard text NOT NULL,
 PRIMARY KEY(exam_id,student_id),
 UNIQUE(center_id,serial_no),
 FOREIGN KEY(exam_id,center_id) REFERENCES exam_portal_centers(exam_id,id) ON DELETE CASCADE
);
CREATE TABLE exam_portal_sessions (
 token_hash text PRIMARY KEY,
 center_id uuid NOT NULL REFERENCES exam_portal_centers(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_portal_sessions_center ON exam_portal_sessions(center_id);
CREATE TABLE exam_portal_valuations (
 exam_id uuid NOT NULL,
 student_id text NOT NULL,
 subject_id uuid NOT NULL,
 marks jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(marks)='array'),
 juz text NOT NULL DEFAULT '',
 remarks text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted')),
 total integer,
 examiner_name text NOT NULL,
 submitted_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 version integer NOT NULL DEFAULT 1,
 PRIMARY KEY(exam_id,student_id,subject_id),
 FOREIGN KEY(exam_id,student_id) REFERENCES exam_portal_allocations(exam_id,student_id) ON DELETE CASCADE,
 FOREIGN KEY(exam_id,subject_id) REFERENCES exam_subjects(exam_id,id) ON DELETE CASCADE
);
CREATE TABLE exam_portal_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 exam_id uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 actor text NOT NULL,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exam_portal_audit_exam ON exam_portal_audit(exam_id,created_at DESC);

-- Only the authenticated Express API may access examiner credentials and rosters.
ALTER TABLE exam_portal_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_portal_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_portal_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_portal_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON exam_portal_centers,exam_portal_allocations,exam_portal_sessions,exam_portal_valuations,exam_portal_audit FROM anon,authenticated;
COMMIT;
