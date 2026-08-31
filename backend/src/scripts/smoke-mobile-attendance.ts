import crypto from 'node:crypto';
import { closeDatabasePool, db } from '../config/db';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:5001/api/mobile';
const email = process.env.STAGING_TEST_MENTOR_EMAIL;
const password = process.env.STAGING_TEST_MENTOR_PASSWORD;
const today = '2026-08-21';
const conflictDate = '2026-08-28';

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
  const text = await response.text();
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`${path} returned ${response.status}: ${text.slice(0, 160)}`); }
  return { response, json };
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      installationId: crypto.randomUUID(),
      platform: 'android',
      deviceName: 'attendance-smoke',
      appVersion: '0.3.0-test',
      osVersion: process.platform,
      pushToken: null,
    }),
  });
  const loginText = await loginResponse.text();
  let login: any;
  try { login = JSON.parse(loginText); } catch { throw new Error(`Login returned ${loginResponse.status}: ${loginText.slice(0, 160)}`); }
  if (!loginResponse.ok) throw new Error(`Login failed: ${login.error || loginResponse.status}`);
  const token = login.accessToken;
  const deviceId = login.device.id;

  const day = await request(`/attendance/day?date=${today}`, token, deviceId);
  if (!day.response.ok || !Array.isArray(day.json.data) || day.json.data.length !== 1) {
    throw new Error(`Expected one staging session, received ${JSON.stringify(day.json)}`);
  }
  const session = day.json.data[0];
  const roster = await request(`/attendance/sessions/${session.id}?date=${today}`, token, deviceId);
  if (!roster.response.ok || roster.json.students?.length !== 1 || !roster.json.sessionState?.rosterStateHash) {
    throw new Error(`Roster contract failed: ${JSON.stringify(roster.json)}`);
  }
  const mutationId = crypto.randomUUID();
  const mutation = {
    mutationId,
    scheduleId: session.id,
    date: today,
    scheduleRevision: roster.json.sessionState.scheduleRevision,
    sessionRevision: roster.json.sessionState.sessionRevision,
    rosterStateHash: roster.json.sessionState.rosterStateHash,
    marks: roster.json.students.map((student: any) => ({ studentId: student.adm_no, status: 'Present' })),
  };
  const saved = await request('/mutations/attendance', token, deviceId, { method: 'POST', body: JSON.stringify(mutation) });
  if (!saved.response.ok || saved.json.status !== 'applied') throw new Error(`Attendance save failed: ${JSON.stringify(saved.json)}`);
  const replay = await request('/mutations/attendance', token, deviceId, { method: 'POST', body: JSON.stringify(mutation) });
  if (!replay.response.ok || replay.json.replayed !== true) throw new Error(`Idempotent replay failed: ${JSON.stringify(replay.json)}`);

  const futureDay = await request(`/attendance/day?date=${conflictDate}`, token, deviceId);
  const futureSession = futureDay.json.data?.[0];
  if (!futureSession) throw new Error('Future staging session missing');
  const futureRoster = await request(`/attendance/sessions/${futureSession.id}?date=${conflictDate}`, token, deviceId);
  await db.query(
    `INSERT INTO attendance_cancellations(schedule_id, date, reason)
     VALUES ($1, $2::date, 'Staging smoke conflict')
     ON CONFLICT (schedule_id, date) DO UPDATE SET reason = EXCLUDED.reason`,
    [futureSession.id, conflictDate],
  );
  const conflict = await request('/mutations/attendance', token, deviceId, {
    method: 'POST',
    body: JSON.stringify({
      mutationId: crypto.randomUUID(),
      scheduleId: futureSession.id,
      date: conflictDate,
      scheduleRevision: futureRoster.json.sessionState.scheduleRevision,
      sessionRevision: futureRoster.json.sessionState.sessionRevision,
      rosterStateHash: futureRoster.json.sessionState.rosterStateHash,
      marks: futureRoster.json.students.map((student: any) => ({ studentId: student.adm_no, status: 'Present' })),
    }),
  });
  if (conflict.response.status !== 409 || conflict.json.code !== 'SESSION_CANCELLED') {
    throw new Error(`Cancellation conflict was not rejected safely: ${JSON.stringify(conflict.json)}`);
  }

  console.log(JSON.stringify({
    success: true,
    sessions: day.json.data.length,
    roster: roster.json.students.length,
    savedMarks: saved.json.attendance.studentMarkCount,
    idempotentReplay: replay.json.replayed,
    offlineCancellationResult: conflict.json.code,
  }));
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.query(
      `DELETE FROM attendance_cancellations
       WHERE date = $1::date AND reason = 'Staging smoke conflict'`,
      [conflictDate],
    ).catch(() => undefined);
    await closeDatabasePool();
  });
