const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://jbsirxvegnxsjqoeszdj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk'
);

async function run() {
    // 1. Fix MADRASA Shift 1 (09:30-12:30) → 5th, 6th, 7th
    const { error: e1 } = await supabase
        .from('academic_sessions')
        .update({ standards: ['5th', '6th', '7th'] })
        .eq('id', '2119cbd9-80f7-4259-990f-197ed1e83ab5');
    console.log('Shift 1 (5th,6th,7th):', e1 ? e1.message : 'OK');

    // 2. Fix MADRASA Shift 2 (13:30-16:30) → 8th, 9th, 10th
    const { error: e2 } = await supabase
        .from('academic_sessions')
        .update({ standards: ['8th', '9th', '10th'] })
        .eq('id', 'ef2e6bce-1b84-49f0-9a80-c40b14989e7c');
    console.log('Shift 2 (8th,9th,10th):', e2 ? e2.message : 'OK');

    // 3. Fix exams type CHECK constraint via raw SQL
    const sql = "ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_type_check; ALTER TABLE public.exams ADD CONSTRAINT exams_type_check CHECK (type IN ('School', 'Hifz', 'Madrassa'));";

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

    // Verify: test inserting with Madrassa type
    const { error: testErr } = await supabase.from('exams').insert({
        title: '__test_madrassa__',
        type: 'Madrassa',
        department: 'Madrassa',
        start_date: '2026-01-01',
        is_active: false
    });
    console.log('Test insert Madrassa exam:', testErr ? testErr.message : 'OK');

    // Clean up test
    if (!testErr) {
        await supabase.from('exams').delete().eq('title', '__test_madrassa__');
        console.log('Cleaned up test exam');
    }
}

run();
