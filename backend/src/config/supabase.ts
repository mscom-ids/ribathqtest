import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load the root .env.local file which contains the standard Supabase credentials
// For production, this will be set via Render/DigitalOcean env variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

// Load backend-specific env if needed
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment.");
  // We don't want to crash immediately on startup if they add it later, but Warn loudly.
}

// Create the Supabase Admin client using the Service Role Key
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://dummy.supabase.co', 
  supabaseServiceRoleKey || 'dummy_key', 
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
