-- Add 'pending' and 'rejected' statuses to student_leaves
ALTER TABLE public.student_leaves DROP CONSTRAINT student_leaves_status_check;
ALTER TABLE public.student_leaves ADD CONSTRAINT student_leaves_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'outside', 'completed', 'cancelled'));
