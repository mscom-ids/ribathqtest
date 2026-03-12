-- 1. Academic Years
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  promotion_window_open BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Trigger to ensure only one current academic year
CREATE OR REPLACE FUNCTION set_single_current_academic_year()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE academic_years SET is_current = false WHERE id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_single_current_academic_year ON academic_years;
CREATE TRIGGER enforce_single_current_academic_year
BEFORE INSERT OR UPDATE OF is_current ON academic_years
FOR EACH ROW
WHEN (NEW.is_current = true)
EXECUTE FUNCTION set_single_current_academic_year();

-- 2. Classes
CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('Hifz', 'School', 'Madrassa')) NOT NULL,
  standard TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(adm_no) ON DELETE CASCADE,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(student_id, academic_year_id, class_id)
);

-- 4. Weekly Schedule
CREATE TABLE IF NOT EXISTS weekly_schedule (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teacher_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Class Events (Daily Instances)
CREATE TABLE IF NOT EXISTS class_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teacher_id UUID REFERENCES staff(id) ON DELETE SET NULL,
  source_type TEXT CHECK (source_type IN ('weekly', 'manual')) DEFAULT 'weekly' NOT NULL,
  status TEXT CHECK (status IN ('scheduled', 'completed', 'cancelled')) DEFAULT 'scheduled' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(class_id, date, start_time) -- Ensure we don't duplicate events for the same class and time
);

-- 6. Modify Attendance Table
-- Instead of deleting the old attendance table, we add a reference to class_events
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS class_event_id UUID REFERENCES class_events(id) ON DELETE CASCADE;

-- Drop old constraint that forced session_id to be unique per date (as session_id is being deprecated)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_session_date_unique;

-- Add new constraint for class events
-- A student can only have one attendance record per class event
ALTER TABLE attendance ADD CONSTRAINT attendance_student_event_unique UNIQUE(student_id, class_event_id);


-- 7. RLS Policies
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_events ENABLE ROW LEVEL SECURITY;

-- Assuming is_admin_or_principal() function exists from schema.sql
DROP POLICY IF EXISTS "Public Read Academic Years" ON academic_years;
CREATE POLICY "Public Read Academic Years" ON academic_years FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin Manage Academic Years" ON academic_years;
CREATE POLICY "Admin Manage Academic Years" ON academic_years FOR ALL USING (is_admin_or_principal());

DROP POLICY IF EXISTS "Public Read Classes" ON classes;
CREATE POLICY "Public Read Classes" ON classes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin Manage Classes" ON classes;
CREATE POLICY "Admin Manage Classes" ON classes FOR ALL USING (is_admin_or_principal());

DROP POLICY IF EXISTS "Public Read Enrollments" ON enrollments;
CREATE POLICY "Public Read Enrollments" ON enrollments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin Manage Enrollments" ON enrollments;
CREATE POLICY "Admin Manage Enrollments" ON enrollments FOR ALL USING (is_admin_or_principal());

DROP POLICY IF EXISTS "Public Read Weekly Schedule" ON weekly_schedule;
CREATE POLICY "Public Read Weekly Schedule" ON weekly_schedule FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin Manage Weekly Schedule" ON weekly_schedule;
CREATE POLICY "Admin Manage Weekly Schedule" ON weekly_schedule FOR ALL USING (is_admin_or_principal());

DROP POLICY IF EXISTS "Public Read Class Events" ON class_events;
CREATE POLICY "Public Read Class Events" ON class_events FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin Manage Class Events" ON class_events;
CREATE POLICY "Admin Manage Class Events" ON class_events FOR ALL USING (is_admin_or_principal());
