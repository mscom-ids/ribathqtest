import assert from 'node:assert/strict';
import { db } from '../config/db';
import * as staffUtils from '../utils/staff.utils';
import * as academicYear from '../utils/academic-year';
import { getStudentsForSchedule, markAttendance } from '../controllers/attendance_dashboard.controller';

// Exercise the real save handler, including its initial and locked checks,
// without connecting to a database or changing production attendance.
const selectedIds = Array.from({ length: 14 }, (_, index) => `LEAVE-${index + 1}`);
const targeted = { cancelled_standards: [], cancelled_students: selectedIds, reason: 'Institutional Leave:leave-1' };
const schedule = {
    id: '00000000-0000-4000-8000-000000000001', standards: ['7th'],
    start_time: '09:30:00', end_time: '11:15:00', day_of_week: 3,
    effective_from: '2026-06-01', effective_until: null, is_deleted: false,
    class_type: 'hifz', attendance_groups: [],
};
const institutionalLeave = {
    id: 'leave-1', name: 'IAME programme',
    start_datetime: '2026-10-14T09:00:00+05:30', end_datetime: '2026-10-14T16:00:00+05:30',
    target_classes: [], target_student_ids: selectedIds, is_entire_institution: false,
};

async function saveScenario(stored: any, locked: any, useLeave: boolean) {
    let saved: { ids: string[]; statuses: string[] } | undefined;
    let committed = false;
    let status = 200;
    let body: any;
    const client = {
        async query(sql: string, params?: any[]) {
            if (sql.includes('FOR UPDATE OF a')) return { rows: [{ ...schedule, ...(locked || {}), cancellation_schedule_id: locked ? schedule.id : null }] };
            if (sql.includes('FROM institutional_leaves')) return { rows: useLeave ? [institutionalLeave] : [] };
            if (sql.includes('SELECT adm_no, standard')) return { rows: ['LEAVE-1', 'AVAILABLE', 'OUTSIDE'].map(adm_no => ({ adm_no, standard: '7th' })) };
            if (sql.includes('WITH saved_student_marks')) {
                saved = { ids: params![3], statuses: params![4] };
                return { rows: [{ student_mark_count: saved.ids.length }] };
            }
            if (sql === 'COMMIT') committed = true;
            if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
            throw new Error(`Unexpected transaction query: ${sql}`);
        },
        release() {},
    };
    (db as any).getClient = async () => client;
    (db as any).query = async (sql: string) => {
        if (sql.includes('SELECT a.*')) return { rows: [schedule] };
        if (sql.includes('FROM student_attendance_marks')) return { rows: [] };
        if (sql.includes('FROM attendance_cancellations')) return { rows: stored ? [stored] : [] };
        if (sql.includes('FROM institutional_leaves')) return { rows: useLeave ? [institutionalLeave] : [] };
        if (sql.includes('to_regclass')) return { rows: [{ table_name: null }] };
        if (sql.includes('FROM student_leaves')) return { rows: [{ student_id: 'OUTSIDE', leave_type: 'out-campus', status: 'outside' }] };
        if (sql.includes('SELECT adm_no, standard')) return { rows: ['LEAVE-1', 'AVAILABLE', 'OUTSIDE'].map(adm_no => ({ adm_no, standard: '7th' })) };
        throw new Error(`Unexpected query: ${sql}`);
    };
    await markAttendance({
        user: { id: 'admin-id', role: 'admin' },
        body: { schedule_id: schedule.id, date: '2026-10-14', student_marks: ['LEAVE-1', 'AVAILABLE', 'OUTSIDE'].map(student_id => ({ student_id, status: 'Present' })) },
    } as any, {
        status(code: number) { status = code; return this; },
        json(value: any) { body = value; return this; },
    } as any);
    return { status, body, saved, committed };
}

async function rosterScenario(stored: any) {
    let status = 200;
    let body: any;
    (db as any).query = async (sql: string) => {
        if (sql.includes('SELECT a.id, a.name')) return { rows: [{ ...schedule, attendance_cancellation: stored }] };
        if (sql.includes('FROM institutional_leaves')) return { rows: [institutionalLeave] };
        if (sql.includes('SELECT adm_no, name, standard, photo_url')) return { rows: ['LEAVE-1', 'AVAILABLE', 'OUTSIDE'].map(adm_no => ({ adm_no, name: adm_no, standard: '7th' })) };
        if (sql.includes('FROM student_leaves')) return { rows: [{ student_id: 'OUTSIDE', leave_type: 'out-campus', status: 'outside' }] };
        throw new Error(`Unexpected roster query: ${sql}`);
    };
    await getStudentsForSchedule({ user: { role: 'admin' }, query: { schedule_id: schedule.id, date: '2026-10-14' } } as any, {
        status(code: number) { status = code; return this; },
        json(value: any) { body = value; return this; },
    } as any);
    assert.equal(status, 200, JSON.stringify(body));
    assert.deepEqual(body.students.map((student: any) => [student.adm_no, student.attendance_status, student.is_locked_outside]), [
        ['LEAVE-1', 'on_leave', true], ['AVAILABLE', 'pending', false], ['OUTSIDE', 'outside', true],
    ]);
}

async function run() {
    const originalQuery = db.query;
    const originalClient = db.getClient;
    const originalStaff = staffUtils.getStaffId;
    const originalYear = academicYear.getAcademicYearContext;
    try {
        (staffUtils as any).getStaffId = async () => 'staff-id';
        (academicYear as any).getAcademicYearContext = async () => ({ academicYearId: null });
        for (const [label, stored, locked] of [
            ['stored student leave', targeted, targeted],
            ['restored session with active student leave', null, null],
        ] as const) {
            const result = await saveScenario(stored, locked, true);
            assert.equal(result.status, 200, `${label}: ${JSON.stringify(result.body)}`);
            assert.equal(result.committed, true);
            assert.deepEqual(result.saved, { ids: ['LEAVE-1', 'AVAILABLE', 'OUTSIDE'], statuses: ['Leave', 'Present', 'Outside'] });
        }
        const whole = { cancelled_standards: null, cancelled_students: [] };
        assert.equal((await saveScenario(whole, whole, false)).status, 400, 'whole session remains blocked');
        const standard = { cancelled_standards: ['7th'], cancelled_students: [] };
        assert.equal((await saveScenario(standard, standard, false)).status, 400, 'explicit standard cancellation remains blocked');
        const race = await saveScenario(null, whole, false);
        assert.equal(race.status, 409, 'cancellation created while saving remains blocked');
        assert.equal(race.saved, undefined);
        const normal = await saveScenario(null, null, false);
        assert.equal(normal.status, 200);
        assert.deepEqual(normal.saved?.statuses, ['Present', 'Present', 'Outside']);
        await rosterScenario(targeted);
        await rosterScenario(null);
        console.log('Attendance student leave regression tests passed (stored/restored saves and rosters, full, standard, race, normal).');
    } finally {
        db.query = originalQuery;
        db.getClient = originalClient;
        (staffUtils as any).getStaffId = originalStaff;
        (academicYear as any).getAcademicYearContext = originalYear;
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
