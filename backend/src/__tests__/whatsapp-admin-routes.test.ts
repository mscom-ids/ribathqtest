import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';

async function main() {
  process.env.JWT_SECRET = 'route-test-only-signing-secret';
  process.env.POSTGRES_URL = 'postgresql://test:test@127.0.0.1:1/test';
  process.env.WHATSAPP_SENDING_ENABLED = 'false';
  process.env.N8N_STUDENT_MOVEMENT_ENABLED = 'false';
  process.env.N8N_STUDENT_MOVEMENT_ADMIN_CONTROLS_ENABLED = 'true';
  const { db, closeDatabasePool } = await import('../config/db');
  const savedQuery = db.query;
  let role = 'admin';
  (db as any).query = async (sql: string) => {
    if (sql.includes('SELECT role FROM staff')) return { rows: [{ role }] };
    if (sql.includes('to_regclass')) return { rows: [{ settings: 'whatsapp_notification_settings', attempts: 'whatsapp_notification_attempts' }] };
    if (sql.includes('SELECT * FROM whatsapp_notification_settings')) return { rows: [{ enabled: false, sender_id: null, hourly_limit: 30, daily_limit: 100, min_interval_seconds: 60, max_age_hours: 24, production_started_at: null }] };
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
    assert.equal((await fetch(base, { headers })).status, 200, 'An authenticated current admin can access settings without a separate passcode');
    console.log('Admin-only routes and current role checks passed without a separate passcode or live messages.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.query = savedQuery;
    await closeDatabasePool();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
