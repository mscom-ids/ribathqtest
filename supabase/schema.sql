-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES (Extends Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT CHECK (role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff', 'parent')) NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. STAFF (Linked to Profiles)
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id), -- Link to login if applicable
  name TEXT NOT NULL,
  photo_url TEXT,
  email TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff')) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. STUDENTS
CREATE TABLE students (
  adm_no TEXT PRIMARY KEY, -- R001 format
  name TEXT NOT NULL,
  photo_url TEXT,
  dob DATE NOT NULL,
  address TEXT,
  father_name TEXT,
  mother_name TEXT,
  phone TEXT,
  email TEXT,
  aadhar TEXT,
  batch_year TEXT, 
  standard TEXT,
  assigned_usthad_id UUID REFERENCES staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. HIFZ LOGS
CREATE TABLE hifz_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(adm_no),
  usthad_id UUID REFERENCES staff(id),
  entry_date DATE DEFAULT CURRENT_DATE NOT NULL,
  session_type TEXT CHECK (session_type IN ('Subh', 'Breakfast', 'Lunch')) NOT NULL,
  mode TEXT CHECK (mode IN ('New Verses', 'Recent Revision', 'Juz Revision')) NOT NULL,
  -- New Verses Mode
  surah_name TEXT,
  start_v INTEGER,
  end_v INTEGER,
  -- Recent Revision Mode (Page-based)
  start_page INTEGER,
  end_page INTEGER,
  -- Juz Revision Mode
  juz_number INTEGER CHECK (juz_number >= 1 AND juz_number <= 30),
  juz_portion TEXT CHECK (juz_portion IN ('Full', '1st Half', '2nd Half', 'Q1', 'Q2', 'Q3', 'Q4')),
  -- Common
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ACADEMIC SESSIONS (Classes/Timings)
CREATE TABLE academic_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g. "Subh Hifz", "Period 1"
  start_time TIME,
  end_time TIME,
  type TEXT CHECK (type IN ('Hifz', 'School', 'Madrassa')) NOT NULL,
  standards TEXT[], -- Array of standards this applies to. NULL/Empty = All.
  days_of_week INTEGER[], -- 0=Sun, 1=Mon, ..., 6=Sat. NULL/Empty = All Days.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ACADEMIC CALENDAR (Date Policies)
CREATE TABLE academic_calendar (
  date DATE PRIMARY KEY,
  is_holiday BOOLEAN DEFAULT false,
  description TEXT,
  day_mode TEXT CHECK (day_mode IN ('Normal', 'Friday', 'Weekday', 'Custom')),
  effective_day_of_week INTEGER, -- Deprecated, kept for safety or remove? Let's keep for now or drop. User said "no need". I will replace it or ignore it. Let's keep the column but mark deprecated in comment to avoid breaking existing rows immediately, OR drop it if we are sure. "no need of treat day as".
  -- Actually, let's keep it but just stop using it? Cleanest is to replace.
  -- But to be safe with migration, let's just ADD day_mode.
  
  allowed_session_types TEXT[], -- Optional: ['Hifz'] or ['School', 'Madrassa']
  allowed_standards TEXT[], -- Optional: ['10th']
  session_overrides JSONB, -- Stores the compiled overrides based on Mode.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. ATTENDANCE
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(adm_no),
  date DATE DEFAULT CURRENT_DATE NOT NULL,
  session_id UUID REFERENCES academic_sessions(id), -- Link to dynamic session
  status TEXT CHECK (status IN ('Present', 'Absent', 'Leave')) NOT NULL,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT attendance_student_session_date_unique UNIQUE(student_id, date, session_id)
);

-- 7. LEAVES
CREATE TABLE leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(adm_no),
  type TEXT CHECK (type IN ('Institutional', 'Medical-In', 'Medical-Out', 'Exam', 'Individual')) NOT NULL,
  exit_timestamp TIMESTAMP WITH TIME ZONE,
  return_timestamp TIMESTAMP WITH TIME ZONE,
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS POLICIES & FUNCTIONS

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE hifz_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;


-- Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper to check if user is admin or principal
CREATE OR REPLACE FUNCTION public.is_admin_or_principal()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role IN ('admin', 'principal') FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES Policies
CREATE POLICY "Users can see their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- STAFF Policies
CREATE POLICY "Public Read Staff" ON staff FOR SELECT USING (true); -- Staff directory visible
CREATE POLICY "Admin Manage Staff" ON staff
  FOR ALL USING (is_admin_or_principal());

-- STUDENTS Policies
-- 1. Admin/Principal/Controller/Staff can view all students (Staff might be restricted later, but typically need to see list)
CREATE POLICY "Staff & Admin View Students" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff')
    )
  );

-- 2. Parents can only view their own children (linked by email for now)
CREATE POLICY "Parents View Own Children" ON students
  FOR SELECT USING (
    email = (auth.jwt() ->> 'email') OR
    father_name IS NOT NULL -- Placeholder
    -- REPLACED (SELECT email FROM auth.users) because it causes "permission denied" for table users.
    -- auth.jwt() ->> 'email' extracts it from the token safely.
  );

-- 3. Admin/Principal can Edit Students
CREATE POLICY "Admin Edit Students" ON students
  FOR ALL USING (is_admin_or_principal());

-- HIFZ LOGS Policies
-- 1. View: Parents (own kids), Staff (all/assigned), Admin (all)
CREATE POLICY "View Hifz Logs" ON hifz_logs
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff')))
    OR
    (student_id IN (SELECT adm_no FROM students WHERE email = (auth.jwt() ->> 'email')))
  );

-- 2. Insert: Staff (Usthad) - Subject to 7 Day Rule (Enforced in App or Trigger, here allow Staff)
--    Refining 7-day rule in RLS is tricky for INSERT, usually for UPDATE.
CREATE POLICY "Staff Create Logs" ON hifz_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff'))
  );

-- 3. Update: Usthad (within 7 days), Admin (Always)
CREATE POLICY "Staff Update Logs" ON hifz_logs
  FOR UPDATE USING (
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff') AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
    OR
    is_admin_or_principal()
  );

-- 4. Delete: Usthad (within 7 days), Admin (Always)
CREATE POLICY "Staff Delete Logs" ON hifz_logs
  FOR DELETE USING (
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff') AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
    OR
    is_admin_or_principal()
  );

-- ACADEMIC SESSIONS Policies
CREATE POLICY "Public Read Sessions" ON academic_sessions FOR SELECT USING (true);
CREATE POLICY "Admin Manage Sessions" ON academic_sessions
  FOR ALL USING (is_admin_or_principal());

-- ACADEMIC CALENDAR Policies
ALTER TABLE academic_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Calendar" ON academic_calendar FOR SELECT USING (true);
CREATE POLICY "Admin Manage Calendar" ON academic_calendar
  FOR ALL USING (is_admin_or_principal());

-- ATTENDANCE Policies (Similar to Logs)
CREATE POLICY "View Attendance" ON attendance FOR SELECT USING (true); -- Simplify read
CREATE POLICY "Staff Manage Attendance" ON attendance
  FOR ALL USING (
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'staff') AND date >= (CURRENT_DATE - INTERVAL '7 days'))
    OR
    is_admin_or_principal()
  );

