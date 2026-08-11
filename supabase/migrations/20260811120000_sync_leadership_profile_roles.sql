-- Align stale profiles.role to the admin-managed staff.role for leadership.
--
-- Roles live in two tables: staff.role (edited via the admin Mentors UI — the
-- source of truth) and profiles.role (legacy Supabase). The admin role editor
-- only writes staff.role, so promotions never propagated to profiles.role.
-- Login previously minted the JWT from profiles.role, so a Vice Principal still
-- carried `usthad` in their token and was denied supervisor access.
--
-- The login controller now trusts staff.role, but this statement also corrects
-- the stored data so the two tables agree and nothing reads a stale role.
-- Idempotent: only touches leadership rows that actually disagree.

UPDATE profiles p
SET role = s.role
FROM staff s
WHERE s.profile_id = p.id
  AND s.role IN ('principal', 'vice_principal')
  AND p.role IS DISTINCT FROM s.role;
