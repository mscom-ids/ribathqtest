import assert from 'node:assert/strict';
import { disconnectAlumniAssignments } from '../services/student-exit.service';

async function run() {
    const calls: { sql: string; params: any[] }[] = [];
    const client = { query: async (sql: string, params: any[]) => {
        calls.push({ sql, params });
        return { rows: sql.includes('to_regclass') ? [{ table_name: params[0] }] : [] };
    } };
    await disconnectAlumniAssignments(client, 'TEST-EXIT', '2026-10-24');
    const writes = calls.filter(call => !call.sql.includes('to_regclass'));
    assert.equal(writes.length, 8);
    assert(writes.every(call => call.params[0] === 'TEST-EXIT'));
    assert(writes.every(call => !/DELETE|TRUNCATE/i.test(call.sql)));
    assert(writes.find(call => call.sql.includes('attendance_group_students'))?.sql.includes('effective_until'));
    assert(writes.find(call => call.sql.includes('mentor_delegations'))?.sql.includes("'terminated'"));
    assert(!writes.some(call => /student_year_snapshots|attendance_marks|hifz_logs|finance/.test(call.sql)));
    const skipped: string[] = [];
    await disconnectAlumniAssignments({ query: async (sql: string) => {
        skipped.push(sql);
        return { rows: [] };
    } }, 'TEST-EXIT', '2026-10-24');
    assert.equal(skipped.filter(sql => !sql.includes('to_regclass')).length, 1);
    await assert.rejects(disconnectAlumniAssignments({ query: async () => { throw new Error('database failure'); } },
        'TEST-EXIT', '2026-10-24'), /database failure/);
    console.log('Student exit cleanup: scoped closure, optional modules, history preservation and failure propagation passed.');
}
void run();
