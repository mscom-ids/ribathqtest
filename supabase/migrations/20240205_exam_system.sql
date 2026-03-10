-- Create Exams Table
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('School', 'Hifz')),
  start_date date not null,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Create Exam Subjects Table
create table if not exists exam_subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  name text not null,
  max_marks integer default 100,
  min_marks integer default 40,
  standard text, -- e.g. '5th', '6th', or null for All
  order_index integer default 0,
  created_at timestamptz default now()
);

-- Create Exam Results Table
create table if not exists exam_results (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  student_id text references students(adm_no),
  subject_id uuid references exam_subjects(id) on delete cascade,
  marks_obtained numeric not null check (marks_obtained >= 0),
  grader_id uuid references auth.users(id),
  remarks text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(student_id, subject_id)
);

-- Add Exam Controller Flag to Staff
alter table staff add column if not exists is_exam_controller boolean default false;

-- RLS Policies
alter table exams enable row level security;
alter table exam_subjects enable row level security;
alter table exam_results enable row level security;

-- Policies
create policy "Admins and Staff can view exams" on exams for select using (true);
create policy "Admins can manage exams" on exams for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'principal', 'vice_principal'))
);

create policy "Admins and Staff can view subjects" on exam_subjects for select using (true);
create policy "Admins can manage subjects" on exam_subjects for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'principal', 'vice_principal'))
);

create policy "Admins and Staff can view results" on exam_results for select using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'principal', 'vice_principal', 'staff'))
);

create policy "Controllers and Admins can manage results" on exam_results for all using (
  exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'principal', 'vice_principal'))
  or
  exists (select 1 from staff where profile_id = auth.uid() and is_exam_controller = true)
);
