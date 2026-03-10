const https = require('https');

const PROJECT_REF = 'jbsirxvegnxsjqoeszdj';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2lyeHZlZ254c2pxb2VzemRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA1NzM3NCwiZXhwIjoyMDg1NjMzMzc0fQ.8iRIWPN8ULHvILhrB0gK7ZamT2ROFpoOnOcxDqqDdkk';

const sql = `
ALTER TABLE public.exams DROP CONSTRAINT IF EXISTS exams_type_check;
ALTER TABLE public.exams ADD CONSTRAINT exams_type_check CHECK (type IN ('School', 'Hifz', 'Madrassa'));
`;

async function run() {
    // Use the Supabase Management API v1 to run SQL
    const url = `https://${PROJECT_REF}.supabase.co/pg/query`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ query: sql })
    });

    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
}

run();
