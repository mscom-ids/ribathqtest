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
      deviceName: 'mentor-finance-smoke', appVersion: '0.5.0-test', osVersion: process.platform, pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const token = String(login.accessToken);
  const deviceId = String(login.device.id);

  try {
    const month = new Date().toISOString().slice(0, 7);
    const workspace = await request(`/finance/workspace?month=${month}&limit=1000`, token, deviceId);
    if (!workspace.response.ok || !workspace.json.success || !workspace.json.students?.[0]?.id) {
      throw new Error(`Finance workspace contract failed: ${workspace.response.status} ${JSON.stringify(workspace.json).slice(0, 600)}`);
    }
    const authorizedCategories = workspace.json.setup?.categories || [];
    if (authorizedCategories.length !== 1 || authorizedCategories[0]?.name !== 'Mobile staging charge') {
      throw new Error(`Finance category scope leaked: ${JSON.stringify(authorizedCategories)}`);
    }
    const category = authorizedCategories[0];
    if (!category?.id) throw new Error('No authorized staging charge category was returned.');

    const studentId = String(workspace.json.students[0].id);
    const account = await request(`/finance/students/${encodeURIComponent(studentId)}/account`, token, deviceId);
    if (!account.response.ok || !account.json.account?.student || !Array.isArray(account.json.account?.open_items)) {
      throw new Error(`Finance account contract failed: ${account.response.status} ${JSON.stringify(account.json).slice(0, 600)}`);
    }

    const rejected = await request('/finance/charges', token, deviceId, {
      method: 'POST',
      body: JSON.stringify({
        student_id: studentId,
        category_id: category.id,
        amount: '0.00',
        date: new Date().toISOString().slice(0, 10),
        description: 'Must be rejected before any write',
        idempotency_key: crypto.randomUUID(),
      }),
    });
    if (rejected.response.status !== 400 || rejected.json.success !== false) {
      throw new Error(`Invalid write was not rejected safely: ${rejected.response.status} ${JSON.stringify(rejected.json)}`);
    }

    console.log(JSON.stringify({
      success: true,
      canViewDues: workspace.json.capabilities?.can_view_dues === true,
      canAddCharge: workspace.json.capabilities?.can_add_charge === true,
      canCollectPayment: workspace.json.capabilities?.can_collect_payment === true,
      students: workspace.json.students.length,
      categories: workspace.json.setup.categories.length,
      openItems: account.json.account.open_items.length,
      invalidWriteRejected: rejected.response.status === 400,
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
