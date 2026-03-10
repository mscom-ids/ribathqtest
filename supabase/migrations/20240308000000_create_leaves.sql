-- Migration: Create Leave Management tables
-- Description: student_leaves and student_movements tables with RLS policies

-- 1. Create student_leaves table
CREATE TABLE public.student_leaves (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('internal', 'personal', 'institutional')),
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    actual_exit_datetime TIMESTAMPTZ,
    actual_return_datetime TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'outside', 'completed', 'cancelled')),
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create student_movements table
CREATE TABLE public.student_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES public.students(adm_no) ON DELETE CASCADE,
    leave_id UUID NOT NULL REFERENCES public.student_leaves(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('exit', 'return')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_late BOOLEAN DEFAULT false,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_student_leaves_student_id ON public.student_leaves(student_id);
CREATE INDEX idx_student_leaves_status ON public.student_leaves(status);
CREATE INDEX idx_student_movements_leave_id ON public.student_movements(leave_id);

-- 3. Enable RLS
ALTER TABLE public.student_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_movements ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for student_leaves

-- Policy 1: Admins/Principals/VPs can do everything
CREATE POLICY "Admins have full access to leaves" ON public.student_leaves
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = auth.uid()
            AND s.role IN ('admin', 'principal', 'vice_principal')
        )
    );

-- Policy 2: Staff mentors can manage leaves for their assigned students
CREATE POLICY "Mentors can manage leaves for their students" ON public.student_leaves
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.students st
            WHERE st.adm_no = student_leaves.student_id
            AND st.assigned_usthad_id = auth.uid()
        )
    );

-- 5. RLS Policies for student_movements

-- Policy 1: Admins/Principals/VPs can do everything
CREATE POLICY "Admins have full access to movements" ON public.student_movements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = auth.uid()
            AND s.role IN ('admin', 'principal', 'vice_principal')
        )
    );

-- Policy 2: Staff mentors can view movements for their assigned students
CREATE POLICY "Mentors can view movements for their students" ON public.student_movements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.students st
            WHERE st.adm_no = student_movements.student_id
            AND st.assigned_usthad_id = auth.uid()
        )
    );

-- Trigger to update updated_at on student_leaves
CREATE OR REPLACE FUNCTION update_student_leaves_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_leaves_updated_at_trigger
BEFORE UPDATE ON public.student_leaves
FOR EACH ROW
EXECUTE FUNCTION update_student_leaves_updated_at();

-- Add 'Leave' to attendance status enum if it's not already handled generically
-- (The existing attendance table uses checking so we'll just insert 'Leave' string)
