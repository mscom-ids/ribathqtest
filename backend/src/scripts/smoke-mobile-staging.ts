import crypto from 'node:crypto';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;

if (!password) throw new Error('Missing STAGING_TEST_MENTOR_PASSWORD');

async function verify(email: string, expectedPortal: 'staff' | 'admin') {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      installationId: crypto.randomUUID(),
      platform: 'android',
      deviceName: 'staging-smoke-test',
      appVersion: 'verification',
      osVersion: process.platform,
      pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`${email}: login failed (${loginResponse.status})`);

  const bootstrapResponse = await fetch(`${baseUrl}/bootstrap`, {
    headers: {
      authorization: `Bearer ${login.accessToken}`,
      'x-device-id': login.device.id,
    },
  });
  const bootstrap = await bootstrapResponse.json() as any;
  if (!bootstrapResponse.ok) throw new Error(`${email}: bootstrap failed (${bootstrapResponse.status})`);
  if (bootstrap.portal !== expectedPortal) throw new Error(`${email}: expected ${expectedPortal}, received ${bootstrap.portal}`);
  if (!Array.isArray(bootstrap.students)) throw new Error(`${email}: students payload is missing`);

  console.log(JSON.stringify({
    email,
    portal: bootstrap.portal,
    students: bootstrap.students.length,
    academicYear: bootstrap.academicYear?.name,
    dashboardSummary: bootstrap.dashboardSummary || null,
  }));
}

async function main() {
  await verify('mobile.mentor@staging.ribath.invalid', 'staff');
  await verify('mobile.admin@staging.ribath.invalid', 'admin');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
