import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

async function main() {
  process.env.JWT_SECRET = 'route-test-only-signing-secret';
  process.env.POSTGRES_URL = 'postgresql://test:test@127.0.0.1:1/test';
  process.env.WHATSAPP_SENDING_ENABLED = 'false';
  process.env.N8N_STUDENT_MOVEMENT_ENABLED = 'false';
  process.env.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED = 'true';
  process.env.WHATSAPP_ADMIN_PASSCODE_HASH = await bcrypt.hash('route-test-only-passcode', 10);
  const { db, closeDatabasePool } = await import('../config/db');
  const savedQuery = db.query;
  let role = 'admin';
  let failures = 0;
  (db as any).query = async (sql: string) => {
    if (sql.includes('SELECT role FROM staff')) return { rows: [{ role }] };
    if (sql.includes('to_regclass')) return { rows: [{ settings: 'whatsapp_notification_settings', attempts: 'whatsapp_notification_attempts' }] };
    if (sql.includes('RETURNING failures')) return { rows: [{ failures: ++failures }] };
    if (sql.includes('DELETE FROM whatsapp_notification_unlock_attempts')) failures = 0;
    return { rows: [] };
  };
  const router = (await import('../routes/whatsapp-admin.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/whatsapp-admin', router);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/whatsapp-admin`;
  const session = jwt.sign({ id: 'admin-test', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const headers = { Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(base + '/session')).status, 401);
    for (const denied of ['parent', 'staff', 'controller', 'principal']) {
      const deniedToken: string = jwt.sign({ id: 'admin-test', role: denied }, process.env.JWT_SECRET!);
      assert.equal((await fetch(base + '/session', { headers: { Authorization: `Bearer ${deniedToken}` } })).status, 403);
    }
    role = 'staff';
    assert.equal((await fetch(base + '/session', { headers })).status, 403, 'Role revocation must take effect without waiting for JWT expiry');
    role = 'admin';
    const mobile = jwt.sign({ id: 'admin-test', role: 'admin', token_use: 'mobile_access' }, process.env.JWT_SECRET);
    assert.equal((await fetch(base + '/session', { headers: { Authorization: `Bearer ${mobile}` } })).status, 403);
    assert.equal((await fetch(base + '/session', { headers: { ...headers, 'x-delegation-token': 'delegated' } })).status, 403);
    const readiness = await fetch(base + '/session', { headers });
    assert.equal(readiness.status, 200);
    assert.equal(readiness.headers.get('cache-control'), 'no-store');
    assert.equal((await readiness.json()).production_environment_ready, false);
    assert.equal((await fetch(base, { headers })).status, 403, 'Admin login alone must not unlock settings');
    const lockedTest = await fetch(base + '/test', { method: 'POST', headers, body: JSON.stringify({ request_id: '11111111-1111-4111-8111-111111111111' }) });
    assert.equal(lockedTest.status, 403);
    const unlock = await fetch(base + '/unlock', { method: 'POST', headers, body: JSON.stringify({ passcode: 'route-test-only-passcode' }) });
    assert.equal(unlock.status, 200);
    const unlocked = await unlock.json();
    assert.equal(unlocked.expires_in_seconds, 600);
    assert.ok(unlocked.token);
    const otherSession = jwt.sign({ id: 'admin-test', role: 'admin', name: 'different session' }, process.env.JWT_SECRET);
    assert.equal((await fetch(base, { headers: { ...headers, Authorization: `Bearer ${otherSession}`, 'x-whatsapp-admin-unlock': unlocked.token } })).status, 403);
    process.env.WHATSAPP_ADMIN_PASSCODE_HASH = await bcrypt.hash('different-passcode', 10);
    assert.equal((await fetch(base, { headers: { ...headers, 'x-whatsapp-admin-unlock': unlocked.token } })).status, 403);
    for (let attempt = 0; attempt < 5; attempt++) {
      assert.equal((await fetch(base + '/unlock', { method: 'POST', headers, body: JSON.stringify({ passcode: 'wrong-passcode' }) })).status, 403);
    }
    assert.equal((await fetch(base + '/unlock', { method: 'POST', headers, body: JSON.stringify({ passcode: 'different-passcode' }) })).status, 429);
    console.log('Admin-only routes, current role checks, session-bound passcodes, secret rotation and lockout passed; no remote requests or messages.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.query = savedQuery;
    await closeDatabasePool();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
