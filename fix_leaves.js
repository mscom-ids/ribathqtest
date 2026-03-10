const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://jbsirxvegnxsjqoeszdj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk'
);

async function run() {
    const sql = "ALTER TABLE public.student_leaves DROP CONSTRAINT IF EXISTS student_leaves_status_check; ALTER TABLE public.student_leaves ADD CONSTRAINT student_leaves_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'outside', 'completed', 'cancelled'));";

    const res = await fetch('https://jbsirxvegnxsjqoeszdj.supabase.co/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk'
        },
        body: JSON.stringify({ sql })
    });
    const txt = await res.text();
    console.log('SQL constraint update status:', res.status, txt);
}

run();
