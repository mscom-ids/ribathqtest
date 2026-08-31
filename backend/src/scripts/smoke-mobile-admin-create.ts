import crypto from 'node:crypto';
import { closeDatabasePool, db } from '../config/db';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;
const admissionNumber = `STGUI${Date.now()}`;

if (!password) throw new Error('Missing STAGING_TEST_MENTOR_PASSWORD');

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'mobile.admin@staging.ribath.invalid',
      password,
      installationId: crypto.randomUUID(),
      platform: 'android',
      deviceName: 'admin-create-smoke-test',
      appVersion: '0.2.0',
      osVersion: process.platform,
      pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Admin login failed (${loginResponse.status})`);

  const headers = {
    authorization: `Bearer ${login.accessToken}`,
    'x-device-id': login.device.id,
    'content-type': 'application/json',
  };
  const createResponse = await fetch(`${baseUrl}/mutations/students`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ admissionNumber, name: 'Temporary UI Verification', dateOfBirth: '2012-01-01', standard: '7th' }),
  });
  const created = await createResponse.json() as any;
  if (createResponse.status !== 201 || created.student?.id !== admissionNumber) {
    throw new Error(`Student creation failed (${createResponse.status})`);
  }

  const bootstrapResponse = await fetch(`${baseUrl}/bootstrap`, { headers });
  const bootstrap = await bootstrapResponse.json() as any;
  if (!bootstrapResponse.ok || !bootstrap.students?.some((student: any) => student.id === admissionNumber)) {
    throw new Error('Created student was not returned by bootstrap');
  }
  console.log(JSON.stringify({ created: admissionNumber, visibleInBootstrap: true }));
}

main()
  .finally(async () => {
    await db.query('DELETE FROM students WHERE adm_no = $1 AND name = $2', [admissionNumber, 'Temporary UI Verification']);
    await closeDatabasePool();
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
