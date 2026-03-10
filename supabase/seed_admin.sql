-- Create a default admin user
-- NOTE: This must be run in the Supabase SQL Editor as it accesses auth.users

-- 1. Create the user in auth.users
-- You can generate a UUID or let Supabase do it, but we need it for the profile.
-- Since we can't easily insert into auth.users directly without superuser privileges in some setups,
-- the BEST way for you to do this is:
--   1. Go to Authentication -> Users -> Add User (supabase dashboard)
--   2. Create user: admin@institution.os / [YourPassword]
--   3. Copy the UUID of the new user.
--   4. Run the SQL below (replace UUID):

insert into public.profiles (id, role, full_name)
values 
  ('bc89f557-9801-4acc-bead-19a8df6203b3', 'admin', 'System Administrator');

insert into public.staff (profile_id, name, email, role)
values
  ('bc89f557-9801-4acc-bead-19a8df6203b3', 'System Administrator', 'admin@institution.os', 'admin');

-- Example if you could run a script (for local development ONLY if you have access to auth schema):
/*
DO $$
DECLARE
  new_uid uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, aud, email, encrypted_password, email_confirmed_at, role)
  VALUES (new_uid, 'authenticated', 'admin@institution.os', crypt('admin123', gen_salt('bf')), now(), 'authenticated');
  
  INSERT INTO public.profiles (id, role, full_name)
  VALUES (new_uid, 'admin', 'System Administrator');

  INSERT INTO public.staff (profile_id, name, email, role)
  VALUES (new_uid, 'System Administrator', 'admin@institution.os', 'admin');
END $$;
*/
