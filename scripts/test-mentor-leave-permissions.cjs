const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../backend/src/controllers/leaves.controller.ts'), 'utf8');
const calls = [];
let leaveType = 'out-campus';
const db = {
  async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('to_regclass')) return { rows: [{ table_name: 'student_current_presence' }] };
    if (sql.includes('FROM student_current_presence scp')) return { rows: [{ student_id: 'OTHER-CLASS' }] };
    if (sql.includes('SELECT * FROM student_leaves')) return { rows: [{ id: 'leave-1', student_id: 'OTHER-CLASS', leave_type: leaveType, status: 'outside', start_datetime: '2026-10-20T00:00:00Z' }] };
    return { rows: [] };
  },
  async getClient() { return { query: db.query, release() {} }; },
};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
  exports: exportsObject, console, process, Buffer,
  require(name) {
    if (name.endsWith('/config/db')) return { db };
    if (name.endsWith('/staff.utils')) return { getStaffId: async () => 'mentor-1' };
    if (name.endsWith('/server-cache')) return { cachedResult: async (_key, _ttl, load) => load(), makeCacheKey: JSON.stringify, invalidateCacheByPrefix() {} };
    if (name.endsWith('/student-movement-notifications.service')) return { enqueueMovementNotifications: async () => {} };
    if (name.endsWith('/attendance-session-lock.service')) return { lockAttendanceSessions: async () => {} };
    return require(name);
  },
});
function response() { return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
async function run() {
  for (const role of ['mentor', 'staff', 'usthad']) {
    calls.length = 0;
    const outside = response();
    await exportsObject.getOutsideStudents({ user: { role, id: 'user-1' } }, outside);
    assert.equal(outside.code, 200);
    assert.equal(outside.body.students[0].student_id, 'OTHER-CLASS');
    const query = calls.find(call => call.sql.includes('FROM student_current_presence scp'));
    assert.deepEqual(Array.from(query.params), [true]);
    assert(!query.sql.includes('s.hifz_mentor_id = $2'));
    for (leaveType of ['out-campus', 'institutional', 'outdoor']) {
      calls.length = 0;
      const returned = response();
      await exportsObject.recordReturn({ user: { role, id: 'user-1' }, body: { leave_id: 'leave-1', return_datetime: '2026-10-24T08:00:00Z' } }, returned);
      assert.equal(returned.code, 200);
      assert.equal(returned.body.success, true);
      assert(calls.some(call => call.sql.includes("'in'")));
      assert(!calls.some(call => call.sql.includes('hifz_mentor_id =')));
    }
    calls.length = 0;
    const exit = response();
    await exportsObject.createPersonalLeave({ user: { role, id: 'user-1' }, body: {
      student_id: 'OTHER-CLASS', leave_type: 'out-campus', start_datetime: '2026-10-24T08:00:00Z',
      end_datetime: '2026-10-25T08:00:00Z', companion_name: 'Guardian', companion_relationship: 'Parent',
    } }, exit);
    assert.equal(exit.code, 403);
    assert(calls.some(call => call.sql.includes('hifz_mentor_id = $2')));
    assert(!calls.some(call => /INSERT|UPDATE/.test(call.sql)));
  }
  console.log('Mentor permissions passed: campus-wide outside visibility/returns, other-class exits denied.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
