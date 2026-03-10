-- Create Disciplinary Records Table
CREATE TABLE IF NOT EXISTS disciplinary_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id TEXT REFERENCES students(adm_no) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')) NOT NULL,
  points INTEGER DEFAULT 0,
  action_date DATE DEFAULT CURRENT_DATE NOT NULL,
  status TEXT CHECK (status IN ('Pending', 'Resolved', 'Archived')) DEFAULT 'Pending',
  recorded_by UUID REFERENCES staff(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Policies
ALTER TABLE disciplinary_records ENABLE ROW LEVEL SECURITY;

-- 1. View: Admin, Principal, Vice Principal, Staff (all records), Parents (own child)
CREATE POLICY "View Disciplinary Records" ON disciplinary_records
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff')))
    OR
    (student_id IN (SELECT adm_no FROM students WHERE email = (auth.jwt() ->> 'email')))
  );

-- 2. Insert: Admin, Principal, Vice Principal, Staff
CREATE POLICY "Staff Create Disciplinary Records" ON disciplinary_records
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'principal', 'vice_principal', 'controller', 'staff'))
  );

-- 3. Update: Admin, Principal (Always), Staff (own records within 24 hours?) - Let's keep it simple: Admin/Principal/VP only for now to avoid tampering.
CREATE POLICY "Admin Manage Disciplinary Records" ON disciplinary_records
  FOR ALL USING (
    is_admin_or_principal()
  );
