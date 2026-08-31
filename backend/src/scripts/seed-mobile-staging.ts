import { closeDatabasePool, db } from '../config/db';
import { supabaseAdmin } from '../config/supabase';

const STAGING_PROJECT_REF = 'ayrzgpoxbvwtdkzqktze';
const CURRENT_YEAR_ID = '5366c88b-859e-498c-8a0e-9463ab354b17';
const TEST_STUDENT_ID = 'STG-M001';
const TEST_ADMIN_EMAIL = 'mobile.admin@staging.ribath.invalid';
const TEST_ATTENDANCE_SCHEDULE_ID = '6be91d92-14cb-4df4-85f4-88b523209481';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertStagingOnly() {
  const appEnv = process.env.APP_ENV?.trim().toLowerCase();
  const supabaseUrl = required('SUPABASE_URL');
  const databaseUrl = required('DATABASE_URL');

  if (
    appEnv !== 'staging' ||
    !supabaseUrl.includes(STAGING_PROJECT_REF) ||
    !databaseUrl.includes(STAGING_PROJECT_REF)
  ) {
    throw new Error('Refusing to seed: environment is not the Ribath Staging project');
  }
}

async function findOrCreateAuthUser(email: string, password: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const existing = data.users.find(user => user.email?.toLowerCase() === email);
    if (existing) {
      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        existing.id,
        { password, email_confirm: true, user_metadata: { environment: 'staging', purpose: 'mobile_test' } }
      );
      if (updateError) throw updateError;
      return updated.user;
    }
    if (data.users.length < 100) break;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { environment: 'staging', purpose: 'mobile_test' },
  });
  if (error || !data.user) throw error || new Error('Auth user was not created');
  return data.user;
}

async function main() {
  assertStagingOnly();
  const email = required('STAGING_TEST_MENTOR_EMAIL').toLowerCase();
  const password = required('STAGING_TEST_MENTOR_PASSWORD');
  if (password.length < 16) throw new Error('Staging test password must be at least 16 characters');

  const authUser = await findOrCreateAuthUser(email, password);
  const adminAuthUser = await findOrCreateAuthUser(TEST_ADMIN_EMAIL, password);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO public.profiles (id, role, full_name)
       VALUES ($1, 'usthad', 'Staging Mobile Mentor')
       ON CONFLICT (id) DO UPDATE
       SET role = EXCLUDED.role, full_name = EXCLUDED.full_name`,
      [authUser.id]
    );
    await client.query(
      `INSERT INTO public.profiles (id, role, full_name)
       VALUES ($1, 'admin', 'Staging Mobile Admin')
       ON CONFLICT (id) DO UPDATE
       SET role = EXCLUDED.role, full_name = EXCLUDED.full_name`,
      [adminAuthUser.id]
    );

    const staffResult = await client.query(
      `INSERT INTO public.staff (profile_id, name, email, role, is_active)
       VALUES ($1, 'Staging Mobile Mentor', $2, 'usthad', true)
       ON CONFLICT (email) DO UPDATE
       SET profile_id = EXCLUDED.profile_id,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           is_active = true
       RETURNING id`,
      [authUser.id, email]
    );
    const mentorId = staffResult.rows[0].id;

    const adminStaffResult = await client.query(
      `INSERT INTO public.staff (profile_id, name, email, role, is_active)
       VALUES ($1, 'Staging Mobile Admin', $2, 'admin', true)
       ON CONFLICT (email) DO UPDATE
       SET profile_id = EXCLUDED.profile_id,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           is_active = true
       RETURNING id`,
      [adminAuthUser.id, TEST_ADMIN_EMAIL]
    );
    const adminId = adminStaffResult.rows[0].id;

    const categoryResult = await client.query(
      `INSERT INTO public.charge_categories (name, description, is_active)
       VALUES ('Mobile staging charge', 'Safe category for native staging verification', true)
       ON CONFLICT (name) DO UPDATE SET is_active = true
       RETURNING id`,
    );
    const categoryId = categoryResult.rows[0].id;

    await client.query(
      `INSERT INTO public.finance_staff_permissions
         (staff_id, capability, category_id, student_scope, amount_limit, valid_from, granted_by)
       VALUES
         ($1, 'ledger:view', NULL, 'assigned', NULL, '2026-01-01', $2),
         ($1, 'payment:collect', NULL, 'assigned', 10000, '2026-01-01', $2),
         ($1, 'charge:create', $3, 'assigned', 10000, '2026-01-01', $2)
       ON CONFLICT DO NOTHING`,
      [mentorId, adminId, categoryId],
    );

    await client.query('UPDATE public.academic_years SET is_current = false WHERE is_current = true');
    await client.query(
      `INSERT INTO public.academic_years
         (id, name, start_date, end_date, is_current, is_locked)
       VALUES ($1, '2026-2027', '2026-06-01', '2027-05-31', true, false)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           start_date = EXCLUDED.start_date,
           end_date = EXCLUDED.end_date,
           is_current = true`,
      [CURRENT_YEAR_ID]
    );

    await client.query(
      `INSERT INTO public.students
         (adm_no, name, dob, batch_year, standard, status, hifz_mentor_id)
       VALUES ($1, 'Staging Student One', '2012-01-15', '2026', '7th', 'active', $2)
       ON CONFLICT (adm_no) DO UPDATE
       SET name = EXCLUDED.name,
           standard = EXCLUDED.standard,
           status = 'active',
           hifz_mentor_id = EXCLUDED.hifz_mentor_id`,
      [TEST_STUDENT_ID, mentorId]
    );

    await client.query(
      `INSERT INTO public.student_year_snapshots
         (student_id, academic_year_id, school_standard, school_section, hifz_mentor_id, status)
       VALUES ($1, $2, '7th', 'A', $3, 'active')
       ON CONFLICT (student_id, academic_year_id) DO UPDATE
       SET school_standard = EXCLUDED.school_standard,
           school_section = EXCLUDED.school_section,
           hifz_mentor_id = EXCLUDED.hifz_mentor_id,
           status = 'active',
           updated_at = now()`,
      [TEST_STUDENT_ID, CURRENT_YEAR_ID, mentorId]
    );

    await client.query(
      `INSERT INTO public.academic_student_placements
         (academic_year_id, student_id, standard, division, status)
       VALUES ($1, $2, '7th', 'A', 'active')
       ON CONFLICT (academic_year_id, student_id) DO UPDATE
       SET standard = EXCLUDED.standard,
           division = EXCLUDED.division,
           status = 'active',
           updated_at = now()`,
      [CURRENT_YEAR_ID, TEST_STUDENT_ID]
    );

    await client.query(
      `INSERT INTO public.attendance_schedules (
         id, class_type, standards, day_of_week, start_time, end_time,
         duration_mins, mentor_id, name, academic_year_id,
         effective_from, effective_until, is_deleted
       ) VALUES (
         $1, 'hifz', '["7th"]'::jsonb, 5, '00:01:00', '23:59:00',
         1438, $2, 'Staging Hifz Session', $3,
         '2026-08-01', '2027-05-31', false
       )
       ON CONFLICT (id) DO UPDATE SET
         class_type = EXCLUDED.class_type,
         standards = EXCLUDED.standards,
         day_of_week = EXCLUDED.day_of_week,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         mentor_id = EXCLUDED.mentor_id,
         academic_year_id = EXCLUDED.academic_year_id,
         effective_from = EXCLUDED.effective_from,
         effective_until = EXCLUDED.effective_until,
         is_deleted = false`,
      [TEST_ATTENDANCE_SCHEDULE_ID, mentorId, CURRENT_YEAR_ID]
    );

    await client.query(
      `DELETE FROM public.attendance_cancellations
       WHERE schedule_id = $1 AND date = '2026-08-21'`,
      [TEST_ATTENDANCE_SCHEDULE_ID],
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({ success: true, mentorEmail: email, adminEmail: TEST_ADMIN_EMAIL, studentId: TEST_STUDENT_ID, attendanceScheduleId: TEST_ATTENDANCE_SCHEDULE_ID }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await closeDatabasePool();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
