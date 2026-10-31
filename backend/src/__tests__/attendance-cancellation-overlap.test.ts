import assert from 'node:assert/strict';
import { getStudentAttendanceSummaries } from '../utils/attendance-report';

async function summaryFor(cancellations: any[], leaves: any[], key: string) {
    const students = ['A', 'B', 'C'].map(adm_no => ({ adm_no, standard: '6th' }));
    const queryable = { query: async (sql: string) => {
        if (sql.includes('FROM attendance_schedules')) return { rows: [{
            id: 'saturday', name: 'Hifz', day_of_week: 6, standards: ['6th'],
            group_ids: [], start_time: '07:00:00', end_time: '08:00:00',
            effective_from: '2026-10-01', effective_until: null,
        }] };
        if (sql.includes('FROM attendance_cancellations')) return { rows: cancellations };
        if (sql.includes('FROM institutional_leaves')) return { rows: leaves };
        return { rows: [] };
    } };
    return getStudentAttendanceSummaries(queryable, students, '2026-10-31', '2026-10-31', 'hifz', key);
}

async function main() {
    const targeted = (student: string) => ({ schedule_id: 'saturday', date: '2026-10-31', cancelled_students: [student] });
    const holiday = [{ start_datetime: '2026-10-30T12:00:00+05:30', end_datetime: '2026-11-02T09:00:00+05:30', is_entire_institution: true }];
    const overlap = await summaryFor([targeted('A')], holiday, 'holiday-overlap');
    for (const student of ['A', 'B', 'C']) {
        const result = overlap.get(student)!;
        assert.equal(result.cancelledClasses, 1, 'an individual cancellation must not mask an institutional holiday');
        assert.equal(result.effectiveClasses, 0);
        assert.equal(result.pointClassDays, 0, 'holiday must not increase recitation targets');
        assert.equal(result.pendingClasses, 0);
    }
    const separate = await summaryFor([targeted('A'), targeted('B')], [], 'multiple-targets');
    assert.equal(separate.get('A')!.cancelledClasses, 1, 'retain every cancellation for the session/date');
    assert.equal(separate.get('B')!.cancelledClasses, 1);
    assert.equal(separate.get('C')!.effectiveClasses, 1, 'unaffected students still have class');
    for (const [index, cancellations] of [
        [{ schedule_id: 'saturday', date: '2026-10-31' }, targeted('A')],
        [targeted('A'), { schedule_id: 'saturday', date: '2026-10-31' }],
    ].entries()) {
        const result = await summaryFor(cancellations, [], `global-order-${index}`);
        assert.equal(result.get('C')!.cancelledClasses, 1, 'cancellation order must not affect results');
    }
    console.log('Cancellation overlap passed: institutional holidays, multiple students, global cancellation order, unaffected sessions.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
