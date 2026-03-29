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
  console.log("Testing Supabase createUser...");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: 'test_creation@example.com',
    password: 'password123',
    email_confirm: true,
  });
  if (error) {
    console.error("Error creating user:", error);
  } else {
    console.log("User created successfully:", data);
  }
}

test();
