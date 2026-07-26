-- Student discipline management foundation.
-- History is append-only; operational records use soft deletion where applicable.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.discipline_categories (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    color text NOT NULL DEFAULT 'slate',
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.discipline_offence_types (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id uuid NOT NULL REFERENCES public.discipline_categories(id),
    name text NOT NULL,
    default_severity text NOT NULL DEFAULT 'minor'
        CHECK (default_severity IN ('minor', 'moderate', 'major', 'critical')),
    default_marks integer NOT NULL DEFAULT 1 CHECK (default_marks >= 0),
    is_quick_report boolean NOT NULL DEFAULT false,
    parent_notification_default boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS public.discipline_incidents (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_no text NOT NULL UNIQUE,
    idempotency_key text,
    student_id text NOT NULL REFERENCES public.students(adm_no),
    category_id uuid NOT NULL REFERENCES public.discipline_categories(id),
    offence_type_id uuid NOT NULL REFERENCES public.discipline_offence_types(id),
    academic_year_id uuid REFERENCES public.academic_years(id),
    reported_by uuid REFERENCES public.staff(id),
    reviewed_by uuid REFERENCES public.staff(id),
    assigned_to uuid REFERENCES public.staff(id),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'submitted', 'under_review', 'waiting_student_explanation',
        'action_assigned', 'follow_up_pending', 'completed', 'cancelled'
    )),
    severity text NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    discipline_marks integer NOT NULL DEFAULT 0 CHECK (discipline_marks >= 0),
    reported_at timestamptz NOT NULL,
    location text,
    hostel text,
    floor text,
    room_number text,
    class_name text,
    division text,
    short_description text NOT NULL,
    immediate_action text,
    student_position text NOT NULL DEFAULT 'not_recorded'
        CHECK (student_position IN ('not_recorded', 'accepted', 'denied')),
    parent_notification_required boolean NOT NULL DEFAULT false,
    parent_notification_status text NOT NULL DEFAULT 'not_required' CHECK (parent_notification_status IN (
        'not_required', 'pending', 'message_sent', 'called', 'meeting_scheduled', 'acknowledged'
    )),
    private_staff_notes text,
    repeat_offence boolean NOT NULL DEFAULT false,
    escalated_at timestamptz,
    submitted_at timestamptz,
    reviewed_at timestamptz,
    closed_at timestamptz,
    cancelled_at timestamptz,
    deleted_at timestamptz,
    deleted_by uuid REFERENCES public.staff(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_witnesses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id) ON DELETE CASCADE,
    name text NOT NULL,
    details text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_evidence (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id) ON DELETE CASCADE,
    uploaded_by uuid REFERENCES public.staff(id),
    file_name text NOT NULL,
    file_url text NOT NULL,
    mime_type text,
    file_size integer CHECK (file_size IS NULL OR file_size >= 0),
    visibility text NOT NULL DEFAULT 'staff_only' CHECK (visibility IN ('staff_only', 'student_parent')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_student_responses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id),
    response_type text NOT NULL CHECK (response_type IN ('accepted', 'denied')),
    explanation text NOT NULL,
    witness_details text,
    attachment_url text,
    recorded_by uuid REFERENCES public.staff(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_actions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id),
    action_type text NOT NULL,
    instructions text,
    assigned_by uuid REFERENCES public.staff(id),
    supervisor_id uuid REFERENCES public.staff(id),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    due_date date,
    status text NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue', 'cancelled')),
    completion_note text,
    completion_evidence_url text,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_action_updates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id uuid NOT NULL REFERENCES public.discipline_actions(id),
    status text NOT NULL,
    note text,
    evidence_url text,
    updated_by uuid REFERENCES public.staff(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_marks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid REFERENCES public.discipline_incidents(id),
    student_id text NOT NULL REFERENCES public.students(adm_no),
    marks integer NOT NULL CHECK (marks >= 0),
    reason text NOT NULL,
    severity text NOT NULL CHECK (severity IN ('minor', 'moderate', 'major', 'critical')),
    effective_from date NOT NULL DEFAULT CURRENT_DATE,
    expires_at date,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'adjusted', 'cancelled')),
    created_by uuid REFERENCES public.staff(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_positive_marks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id text NOT NULL REFERENCES public.students(adm_no),
    category text NOT NULL,
    marks integer NOT NULL CHECK (marks > 0),
    note text,
    awarded_by uuid REFERENCES public.staff(id),
    awarded_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_parent_communications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id),
    status text NOT NULL CHECK (status IN (
        'not_required', 'pending', 'message_sent', 'called', 'meeting_scheduled', 'acknowledged'
    )),
    method text,
    notes text,
    contacted_by uuid REFERENCES public.staff(id),
    contacted_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_status_history (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid NOT NULL REFERENCES public.discipline_incidents(id),
    from_status text,
    to_status text NOT NULL,
    note text,
    changed_by uuid REFERENCES public.staff(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_notifications (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid REFERENCES public.discipline_incidents(id),
    recipient_staff_id uuid REFERENCES public.staff(id),
    recipient_role text,
    notification_type text NOT NULL,
    message text NOT NULL,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_audit_logs (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id uuid REFERENCES public.discipline_incidents(id),
    student_id text REFERENCES public.students(adm_no),
    actor_id uuid REFERENCES public.staff(id),
    action text NOT NULL,
    old_value jsonb,
    new_value jsonb,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discipline_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_by uuid REFERENCES public.staff(id),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.discipline_incidents
    ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_discipline_incidents_student_date ON public.discipline_incidents(student_id, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_status_date ON public.discipline_incidents(status, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_severity_date ON public.discipline_incidents(severity, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_category_date ON public.discipline_incidents(category_id, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_offence_date ON public.discipline_incidents(offence_type_id, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_hostel_date ON public.discipline_incidents(hostel, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_class_date ON public.discipline_incidents(class_name, division, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_reporter_date ON public.discipline_incidents(reported_by, reported_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_discipline_incidents_idempotency
    ON public.discipline_incidents(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_parent_status ON public.discipline_incidents(parent_notification_status, reported_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_discipline_actions_due_status ON public.discipline_actions(status, due_date) WHERE status IN ('not_started', 'in_progress', 'overdue');
CREATE INDEX IF NOT EXISTS idx_discipline_actions_supervisor ON public.discipline_actions(supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_discipline_marks_student_active ON public.discipline_marks(student_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_discipline_positive_student_date ON public.discipline_positive_marks(student_id, awarded_at DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_status_incident_date ON public.discipline_status_history(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_audit_incident_date ON public.discipline_audit_logs(incident_id, created_at DESC);

INSERT INTO public.discipline_settings (key, value) VALUES
('risk_thresholds', '{"good_standing":3,"needs_attention":7,"warning":12,"high_risk":20}'::jsonb),
('mark_expiry_days', '{"minor":30,"moderate":90,"major":null,"critical":null}'::jsonb),
('positive_marks_reduce_active', 'true'::jsonb),
('notification_rules', '{"major":true,"critical":true,"repeat_offence":true,"overdue_actions":true}'::jsonb),
('action_types', '["Verbal warning","Written warning","Counselling","Apology","Reflection note","Cleaning duty","Campus service","Mentor meeting","Behaviour improvement plan","Phone restriction","Recreation restriction","Parent call","Parent meeting","Final warning","Hostel restriction","Temporary suspension","Discipline committee review","Removal from hostel","Removal from institution"]'::jsonb),
('positive_behaviour_types', '["Good manners","Clean room","Helping others","Punctuality","Leadership","Completing corrective work","Following campus rules","Clear improvement"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

WITH category_seed(name, description, sort_order) AS (
    VALUES
      ('Behaviour', 'Conduct, respect, honesty, and interaction with others', 10),
      ('Hostel and Campus', 'Residential campus routines and movement', 20),
      ('Class and Study', 'Classroom conduct and academic responsibility', 30),
      ('Religious Activities', 'Prayer, masjid, Quran class, and routines', 40),
      ('Devices and Prohibited Items', 'Device misuse and restricted possessions', 50),
      ('Health and Safety', 'Safety, substances, and medical instructions', 60)
)
INSERT INTO public.discipline_categories(name, description, sort_order)
SELECT * FROM category_seed
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

WITH offence_seed(category_name, name, severity, marks, quick, notify) AS (
    VALUES
      ('Behaviour','Fighting','major',8,true,true), ('Behaviour','Bullying','major',8,false,true),
      ('Behaviour','Bad language','moderate',4,false,false), ('Behaviour','Disrespecting staff','moderate',5,false,false),
      ('Behaviour','Disturbing students','minor',2,false,false), ('Behaviour','Disobedience','moderate',4,false,false),
      ('Behaviour','Lying','moderate',3,false,false), ('Behaviour','Stealing','major',8,false,true),
      ('Behaviour','Property damage','major',8,false,true),
      ('Hostel and Campus','Late return','minor',2,false,false), ('Hostel and Campus','Missing roll call','moderate',3,true,false),
      ('Hostel and Campus','Leaving campus without permission','critical',12,true,true),
      ('Hostel and Campus','Entering restricted areas','major',6,false,true),
      ('Hostel and Campus','Unauthorized room change','moderate',4,false,false),
      ('Hostel and Campus','Noise after quiet hours','minor',2,true,false),
      ('Hostel and Campus','Visiting rooms at restricted times','moderate',3,false,false),
      ('Hostel and Campus','Poor room cleanliness','minor',1,false,false),
      ('Class and Study','Late to class','minor',1,true,false), ('Class and Study','Absence without permission','moderate',4,false,false),
      ('Class and Study','Sleeping in class','minor',2,false,false), ('Class and Study','Disturbing class','minor',2,false,false),
      ('Class and Study','Missing study materials','minor',1,false,false), ('Class and Study','Incomplete work','minor',1,false,false),
      ('Class and Study','Cheating','major',7,false,true), ('Class and Study','Disrespecting teachers','moderate',5,false,false),
      ('Religious Activities','Missing congregational prayer','moderate',3,true,false),
      ('Religious Activities','Late for prayer','minor',1,false,false),
      ('Religious Activities','Disturbing others in the masjid','moderate',3,false,false),
      ('Religious Activities','Misbehaviour during Quran class','moderate',4,false,false),
      ('Religious Activities','Not following assigned religious routines','minor',2,false,false),
      ('Devices and Prohibited Items','Unauthorized mobile phone','moderate',5,true,true),
      ('Devices and Prohibited Items','Internet misuse','major',7,false,true),
      ('Devices and Prohibited Items','Recording without permission','major',7,false,true),
      ('Devices and Prohibited Items','Prohibited media','major',8,false,true),
      ('Devices and Prohibited Items','Restricted items','major',8,false,true),
      ('Devices and Prohibited Items','Misuse of institution devices','moderate',4,false,false),
      ('Health and Safety','Unsafe behaviour','moderate',5,false,true), ('Health and Safety','Smoking','critical',12,false,true),
      ('Health and Safety','Prohibited substances','critical',15,false,true),
      ('Health and Safety','Dangerous items','critical',15,false,true),
      ('Health and Safety','Damaging safety equipment','major',10,false,true),
      ('Health and Safety','Ignoring medical or safety instructions','major',8,false,true)
)
INSERT INTO public.discipline_offence_types(category_id, name, default_severity, default_marks, is_quick_report, parent_notification_default)
SELECT c.id, o.name, o.severity, o.marks, o.quick, o.notify
FROM offence_seed o JOIN public.discipline_categories c ON c.name = o.category_name
ON CONFLICT (category_id, name) DO UPDATE SET
  default_severity = EXCLUDED.default_severity,
  default_marks = EXCLUDED.default_marks,
  is_quick_report = EXCLUDED.is_quick_report,
  parent_notification_default = EXCLUDED.parent_notification_default;
