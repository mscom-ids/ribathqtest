const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function test() {
  console.log("Testing Supabase Login...");
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({
    email: 'hamid@gmail.com',
    password: '123456'
  });
  console.log("Error:", error?.message || 'None');
  console.log("Data session exists?", !!data.session);
  if (data.user) {
    console.log("User ID:", data.user.id);
  }
}

test();
