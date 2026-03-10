import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
    const { data: classSessions } = await supabase.from('class_sessions').select('*');
    console.log('--- CLASS SESSIONS ---');
    console.log(JSON.stringify(classSessions, null, 2));

    const { data: calendarDay } = await supabase.from('academic_calendar').select('*').eq('date', '2026-02-19');
    console.log('\n--- CALENDAR DATE (2026-02-19) ---');
    console.log(JSON.stringify(calendarDay, null, 2));
}

run();
