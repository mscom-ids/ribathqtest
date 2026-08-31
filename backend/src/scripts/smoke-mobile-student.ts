import crypto from 'node:crypto';
import { closeDatabasePool } from '../config/db';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const email = process.env.STAGING_TEST_MENTOR_EMAIL;
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;

if (!email || !password) throw new Error('Missing staging mentor credentials');

async function request(path: string, accessToken: string, deviceId: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-device-id': deviceId,
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json = await response.json() as any;
  return { response, json };
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email, password, installationId: crypto.randomUUID(), platform: 'android',
      deviceName: 'mentor-student-smoke', appVersion: '0.6.0-test', osVersion: process.platform, pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const token = String(login.accessToken);
  const deviceId = String(login.device.id);

  try {
    const bootstrap = await request('/bootstrap', token, deviceId);
    const studentId = String(bootstrap.json.students?.[0]?.adm_no || bootstrap.json.students?.[0]?.id || '');
    if (!bootstrap.response.ok || !studentId) throw new Error('No assigned staging student is available.');

    const profile = await request(`/students/${encodeURIComponent(studentId)}/profile`, token, deviceId);
    if (!profile.response.ok || profile.json.profile?.id !== studentId || !Array.isArray(profile.json.profile?.sections)) {
      throw new Error(`Student profile contract failed: ${profile.response.status} ${JSON.stringify(profile.json).slice(0, 600)}`);
    }
    if (/aadha?ar|password|token|secret/i.test(JSON.stringify(profile.json.profile.sections))) {
      throw new Error('Sensitive student fields leaked into the offline profile contract.');
    }

    const month = new Date().toISOString().slice(0, 7);
    const register = await request(`/students/${encodeURIComponent(studentId)}/hifz-month?month=${month}`, token, deviceId);
    if (!register.response.ok || register.json.student?.id !== studentId || !Array.isArray(register.json.days) || !register.json.summary) {
      throw new Error(`Hifz month contract failed: ${register.response.status} ${JSON.stringify(register.json).slice(0, 600)}`);
    }

    const missingId = crypto.randomUUID();
    const rejected = await request('/mutations/hifz-register', token, deviceId, {
      method: 'POST',
      body: JSON.stringify({
        mutation_id: crypto.randomUUID(), student_id: studentId,
        entry_date: `${month}-01`, session_id: null, mode: 'New Verses',
        creates: [], updates: [], delete_ids: [missingId], expected_versions: { [missingId]: 1 },
      }),
    });
    if (rejected.response.status !== 409 || rejected.json.code !== 'HIFZ_ENTRY_CHANGED') {
      throw new Error(`Stale Hifz mutation was not rejected safely: ${rejected.response.status} ${JSON.stringify(rejected.json)}`);
    }

    console.log(JSON.stringify({
      success: true,
      studentId,
      profileSections: profile.json.profile.sections.length,
      registerDays: register.json.days.length,
      hifzStage: register.json.student.hifzStage,
      staleWriteRejected: true,
    }));
  } finally {
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-device-id': deviceId, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, refreshToken: login.refreshToken }),
    }).catch(() => undefined);
  }
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => closeDatabasePool());
