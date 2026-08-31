import crypto from 'node:crypto';
import { closeDatabasePool } from '../config/db';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const email = process.env.STAGING_TEST_MENTOR_EMAIL;
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;

if (!email || !password) throw new Error('Missing staging mentor credentials');

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email, password, installationId: crypto.randomUUID(), platform: 'android',
      deviceName: 'mentor-reports-smoke', appVersion: '0.4.0-test', osVersion: process.platform, pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const headers = { authorization: `Bearer ${login.accessToken}`, 'x-device-id': String(login.device.id) };

  try {
    const workspaceResponse = await fetch(`${baseUrl}/mentor/workspace`, { headers });
    const workspace = await workspaceResponse.json() as any;
    if (!workspaceResponse.ok || !workspace.students?.[0]?.id) throw new Error('No authorized mentor student is available');

    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    const query = new URLSearchParams({
      student_id: String(workspace.students[0].id), type: 'Custom',
      start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10),
    });
    const reportResponse = await fetch(`${baseUrl}/reports/student-progress?${query}`, { headers });
    const report = await reportResponse.json() as any;
    if (!reportResponse.ok || !report.success || !report.data?.student || !Array.isArray(report.data?.period_logs)) {
      throw new Error(`Report contract failed: ${reportResponse.status} ${JSON.stringify(report).slice(0, 500)}`);
    }
    console.log(JSON.stringify({
      success: true,
      studentScoped: report.data.student.adm_no === workspace.students[0].id,
      hasAttendanceTotals: Boolean(report.data.attendance_totals),
      hasPerformance: Boolean(report.data.performance),
      periodLogCount: report.data.period_logs.length,
      hifzStage: report.data.hifz_stage,
    }));
  } finally {
    await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: login.device.id, refreshToken: login.refreshToken }),
    }).catch(() => undefined);
  }
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => closeDatabasePool());
