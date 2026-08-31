import crypto from 'node:crypto';
import { closeDatabasePool, db } from '../config/db';

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
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); } catch { throw new Error(`${path} returned ${response.status}: ${raw.slice(0, 160)}`); }
  return { response, json };
}

let createdLeaveId: string | null = null;

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      installationId: crypto.randomUUID(),
      platform: 'android',
      deviceName: 'mentor-leaves-smoke',
      appVersion: '0.4.0-test',
      osVersion: process.platform,
      pushToken: null,
    }),
  });
  const login = await loginResponse.json() as any;
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const token = login.accessToken;
  const deviceId = login.device.id;

  const initial = await request('/mentor/workspace', token, deviceId);
  if (!initial.response.ok || !Array.isArray(initial.json.students)) throw new Error(`Workspace contract failed: ${JSON.stringify(initial.json)}`);
  const student = initial.json.students.find((candidate: any) => !candidate.activeLeaveId);
  if (!student) throw new Error('The staging mentor needs one student without an active leave for this smoke test.');

  const createMutation = {
    mutationId: crypto.randomUUID(),
    operation: 'create',
    studentId: student.id,
    leaveType: 'on-campus',
    startDatetime: new Date().toISOString(),
    endDatetime: null,
    reasonCategory: 'Native smoke test',
    remarks: 'Deleted automatically after verification',
    companionName: null,
    companionRelationship: null,
    expectedPresenceStateHash: student.presenceStateHash,
  };
  const created = await request('/mutations/leaves', token, deviceId, { method: 'POST', body: JSON.stringify(createMutation) });
  if (!created.response.ok || created.json.status !== 'applied') throw new Error(`Leave create failed: ${JSON.stringify(created.json)}`);
  createdLeaveId = created.json.leave.id;

  const replay = await request('/mutations/leaves', token, deviceId, { method: 'POST', body: JSON.stringify(createMutation) });
  if (!replay.response.ok || replay.json.replayed !== true) throw new Error(`Create replay failed: ${JSON.stringify(replay.json)}`);

  const conflict = await request('/mutations/leaves', token, deviceId, {
    method: 'POST',
    body: JSON.stringify({ ...createMutation, mutationId: crypto.randomUUID() }),
  });
  if (conflict.response.status !== 409 || conflict.json.code !== 'PRESENCE_CHANGED') {
    throw new Error(`Stale presence was not rejected safely: ${JSON.stringify(conflict.json)}`);
  }

  const returned = await request('/mutations/leaves', token, deviceId, {
    method: 'POST',
    body: JSON.stringify({
      mutationId: crypto.randomUUID(),
      operation: 'return',
      leaveId: createdLeaveId,
      expectedLeaveRevision: created.json.leave.mobileRevision,
      returnDatetime: new Date(Date.now() + 1000).toISOString(),
    }),
  });
  if (!returned.response.ok || returned.json.leave.status !== 'completed') throw new Error(`Leave return failed: ${JSON.stringify(returned.json)}`);

  console.log(JSON.stringify({
    success: true,
    cachedStudents: initial.json.students.length,
    cachedAssignments: initial.json.assignments?.length || 0,
    idempotentReplay: replay.json.replayed,
    offlineConflictResult: conflict.json.code,
    returnStatus: returned.json.leave.status,
  }));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (createdLeaveId) {
      await db.query('DELETE FROM student_movements WHERE leave_id = $1', [createdLeaveId]).catch(() => undefined);
      await db.query('DELETE FROM student_leaves WHERE id = $1', [createdLeaveId]).catch(() => undefined);
    }
    await closeDatabasePool();
  });

