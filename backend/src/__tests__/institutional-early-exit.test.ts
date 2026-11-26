import assert from 'node:assert/strict';
import { db } from '../config/db';
import {
    getAllLeaves,
    getInstitutionalLeaveStudents,
    getMovementHistory,
    getOutsideStudents,
    markInstitutionalExit,
    recordReturn,
} from '../controllers/leaves.controller';
import { withInstitutionalExitTiming } from '../utils/institutional-exit-timing';
import { invalidateCacheByPrefix } from '../utils/server-cache';

const plannedStart = '2026-11-27T16:00:00+05:30';
const plannedEnd = '2026-11-29T19:00:00+05:30';
const earlyExit = '2026-11-26T15:30:00+05:30';
const user = { id: 'test-admin', role: 'admin' };

function response() {
    return {
        statusCode: 200,
        body: undefined as any,
        status(code: number) { this.statusCode = code; return this; },
        json(body: any) { this.body = body; return this; },
    };
}

async function run() {
    const originalClient = db.getClient;
    const originalQuery = db.query;
    const originalSending = process.env.WHATSAPP_SENDING_ENABLED;
    const originalTestMode = process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED;
    process.env.WHATSAPP_SENDING_ENABLED = 'false';
    process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED = 'false';
    try {
        const base = {
            leave_type: 'institutional',
            start_datetime: earlyExit,
            scheduled_start_datetime: plannedStart,
            return_status: 'late',
        };
        assert.equal(withInstitutionalExitTiming(base).exit_status, 'early');
        assert.equal(withInstitutionalExitTiming(base).return_status, 'late', 'Early exit must not overwrite late return');
        assert.equal(withInstitutionalExitTiming({ ...base, start_datetime: plannedStart }).exit_status, 'normal');
        assert.equal(withInstitutionalExitTiming({ ...base, start_datetime: '2026-11-27T10:30:00Z' }).exit_status, 'normal', 'Equal instants in different timezones are on time');
        assert.equal(withInstitutionalExitTiming({ ...base, start_datetime: plannedEnd }).exit_status, 'normal');
        assert.equal(withInstitutionalExitTiming({ ...base, leave_type: 'out-campus' }).exit_status, null);
        assert.equal(withInstitutionalExitTiming({ ...base, scheduled_start_datetime: null }).exit_status, null);

        for (const scenario of [
            { time: earlyExit, expected: 'early', ids: ['R101'] },
            { time: '2026-11-27T15:59:59+05:30', expected: 'early', ids: ['R101', 'R102'] },
            { time: plannedStart, expected: 'normal', ids: ['R101'] },
            { time: '2026-11-28T12:00:00+05:30', expected: 'normal', ids: ['R101'] },
            { time: plannedEnd, expected: 'normal', ids: ['R101'] },
            { time: '2026-11-29T19:00:01+05:30', error: /after.*end time/, ids: ['R101'] },
            { time: 'invalid', error: /valid exit time/, ids: ['R101'] },
            { time: earlyExit, campus: 'inside', error: /Inside-campus/, ids: ['R101'] },
            { time: earlyExit, ineligible: true, error: /not eligible/, ids: ['R101'] },
            { time: earlyExit, outside: true, error: /already outside/, ids: ['R101'] },
            { time: earlyExit, duplicate: true, error: /already been recorded/, ids: ['R101'] },
        ]) {
            const queries: Array<{ sql: string; params?: any[] }> = [];
            let released = false;
            db.getClient = async () => ({
                async query(sql: string, params?: any[]) {
                    queries.push({ sql, params });
                    if (sql.includes('FROM institutional_leaves')) return { rows: [{
                        start_datetime: plannedStart, end_datetime: plannedEnd,
                        campus_location: scenario.campus || 'outside', is_entire_institution: true,
                    }] };
                    if (sql.includes('FROM students s')) return { rows: scenario.ineligible ? [] : scenario.ids.map(adm_no => ({ adm_no })) };
                    if (sql.includes("AND status = 'outside'")) return { rows: scenario.outside ? [{ student_id: 'R101' }] : [] };
                    if (sql.includes('SELECT student_id FROM student_leaves')) return { rows: scenario.duplicate ? [{ student_id: 'R101' }] : [] };
                    if (sql.includes('INSERT INTO student_leaves')) return { rows: scenario.ids.map((student_id, index) => ({ id: `leave-${index}`, student_id })) };
                    return { rows: [] };
                },
                release() { released = true; },
            } as any);
            const res = response();
            await markInstitutionalExit({
                params: { id: 'institutional-1' }, user,
                body: { student_ids: scenario.ids, exit_datetime: scenario.time, companion_name: 'Parent', companion_relationship: 'Father' },
            } as any, res as any);
            assert.equal(released, true);
            if (scenario.error) {
                assert.equal(res.statusCode, 400);
                assert.match(res.body.error, scenario.error);
                assert.ok(queries.some(({ sql }) => sql === 'ROLLBACK'));
                assert.ok(!queries.some(({ sql }) => sql.includes('INSERT INTO student_leaves')));
            } else {
                assert.equal(res.statusCode, 201);
                assert.equal(res.body.exit_status, scenario.expected);
                assert.equal(res.body.count, scenario.ids.length);
                const insert = queries.find(({ sql }) => sql.includes('INSERT INTO student_leaves'))!;
                assert.equal(insert.params?.[2], scenario.time, 'Attendance and return validation must use actual exit, including early departures');
                assert.equal(insert.params?.[3], plannedEnd, 'Due-back time must stay the institutional end');
                const movement = queries.find(({ sql }) => sql.includes('INSERT INTO student_movements'))!;
                assert.equal(movement.params?.[0], scenario.time);
                assert.ok(queries.some(({ sql }) => sql === 'COMMIT'));
            }
        }

        // A student who departs early may also return before the planned start.
        // Returns are checked against their actual exit, and still become late after the planned end.
        for (const [time, expectedStatus] of [
            ['2026-11-26T16:00:00+05:30', 'normal'],
            ['2026-11-29T19:01:00+05:30', 'late'],
        ]) {
            const writes: any[][] = [];
            db.getClient = async () => ({
                async query(sql: string, params?: any[]) {
                    if (sql.includes('SELECT * FROM student_leaves')) return { rows: [{
                        id: 'leave-1', student_id: 'R101', leave_type: 'institutional', status: 'outside',
                        start_datetime: earlyExit, end_datetime: plannedEnd,
                    }] };
                    if (sql.includes('UPDATE student_leaves')) writes.push(params || []);
                    return { rows: [] };
                }, release() {},
            } as any);
            const res = response();
            await recordReturn({ user, body: { leave_id: 'leave-1', return_datetime: time } } as any, res as any);
            assert.equal(res.statusCode, 200);
            assert.equal(res.body.success, true);
            assert.equal(writes[0]?.[1], expectedStatus);
        }

        // Exercise all reporting endpoints with the same early/late leave.
        // Only in-memory queries run; these tests never write to the configured database.
        invalidateCacheByPrefix('leaves:');
        db.query = (async (sql: string) => {
            if (sql.includes('to_regclass')) return { rows: [{ table_name: null }] };
            if (sql.includes('COUNT(*)::integer')) return { rows: [{ total: 1 }] };
            assert.ok(sql.includes('il.start_datetime as scheduled_start_datetime'));
            assert.ok(sql.includes('LEFT JOIN institutional_leaves il'));
            return { rows: [{ ...base, actual_return_datetime: '2026-11-29T20:00:00+05:30', computed_return_status: 'late' }] };
        }) as typeof db.query;
        for (const [handler, key] of [
            [getAllLeaves, 'leaves'], [getOutsideStudents, 'students'],
            [getInstitutionalLeaveStudents, 'students'], [getMovementHistory, 'movements'],
        ] as const) {
            const res = response();
            await handler({ user, params: { id: 'institutional-1' }, query: {} } as any, res as any);
            assert.equal(res.statusCode, 200);
            assert.equal(res.body[key][0].scheduled_start_datetime, plannedStart);
            assert.equal(res.body[key][0].exit_status, 'early');
            assert.equal(res.body[key][0].return_status, 'late');
        }
        console.log('Institutional early-exit regression tests passed.');
    } finally {
        db.getClient = originalClient;
        db.query = originalQuery;
        invalidateCacheByPrefix('leaves:');
        if (originalSending === undefined) delete process.env.WHATSAPP_SENDING_ENABLED;
        else process.env.WHATSAPP_SENDING_ENABLED = originalSending;
        if (originalTestMode === undefined) delete process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED;
        else process.env.N8N_STUDENT_MOVEMENT_TEST_ENABLED = originalTestMode;
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
