const assert = require('node:assert/strict');
const path = require('node:path');
const { mock } = require('node:test');

require('../backend/node_modules/ts-node').register({
    project: path.join(__dirname, '../backend/tsconfig.json'),
    transpileOnly: true,
});

const roster = [
    { adm_no: 'PARENT-Z', name: 'Zaid', standard: '7th', attendance_standard: '7th' },
    { adm_no: 'PARENT-A', name: 'Alpha', standard: '7th', attendance_standard: '7th' },
    { adm_no: 'PARENT-B', name: 'Beta', standard: '7th', attendance_standard: '7th' },
];
let mentorId = 'mentor-snapshot';
const academicYearId = 'parent-test-year';
const queries = [];

function mockModule(relativePath, exports) {
    const filename = require.resolve(relativePath);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

mockModule('../backend/src/config/db', {
    db: {
        async query(sql, params = []) {
            queries.push({ sql, params });
            if (sql.includes('FROM hifz_logs')) return { rows: [] };
            if (sql.includes('FROM students s')) {
                if (sql.includes('s.dob')) {
                    assert(sql.includes('COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id)'));
                    assert.deepEqual(params, ['PARENT-Z', academicYearId]);
                    return { rows: [{ ...roster[0], hifz_mentor_id: mentorId, hifz_mentor: 'Snapshot Mentor' }] };
                }
                if (mentorId) assert.deepEqual(params, [academicYearId, mentorId]);
                return { rows: roster };
            }
            if (sql.includes('FROM monthly_reports') && sql.includes('WHERE student_id')) {
                return { rows: ['2026-10-01', '2026-11-01', '2026-12-01'].map(report_month => ({ report_month })) };
            }
            return { rows: [] };
        },
    },
});
mockModule('../backend/src/utils/academic-year', {
    getAcademicYearContext: async () => ({ academicYearId }),
});
mockModule('../backend/src/utils/attendance-report', {
    getStudentAttendanceSummaries: async (_db, students, _start, _end, _classType, yearId) => {
        assert.equal(yearId, academicYearId, 'Parent attendance must stay within the current academic year');
        return new Map(students.map(student => [student.adm_no, {
            plannedClasses: 10, effectiveClasses: 10, pointClassDays: 10,
            attendedClasses: student.adm_no === 'PARENT-B' ? 10 : 5,
            weightedAttendedClasses: student.adm_no === 'PARENT-B' ? 10 : 5,
            sessions: [],
        }]));
    },
});

process.env.JWT_SECRET = 'parent-dashboard-regression-only';
const { getParentDashboard } = require('../backend/src/controllers/parent.controller');
const { calculateBulkMonthlyReport } = require('../backend/src/controllers/hifz.controller');
const { invalidateCacheByPrefix } = require('../backend/src/utils/server-cache');

async function call(handler, query, user) {
    let response;
    let status = 200;
    const res = {
        status(code) { status = code; return res; },
        json(value) { response = value; return res; },
    };
    await handler({ query, user }, res);
    assert.equal(status, 200, JSON.stringify(response));
    assert.equal(response.success, true);
    return response;
}

async function dashboard(month = '2026-11') {
    return call(getParentDashboard, { month }, { studentId: 'PARENT-Z' });
}

async function main() {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-15T23:59:59+05:30') });
    try {
        const hidden = await dashboard();
        assert.equal(hidden.hifz_report.grade_visible, false);
        assert.equal(hidden.hifz_report.grade_available_on, '2026-11-16');
        assert.equal(hidden.hifz_report.summary.grade, null);
        assert.equal(hidden.hifz_report.summary.points.grade, null);
        assert(hidden.reports.every(report => report.grade === null), 'Historical rows cannot leak the selected grade');

        const mentor = await call(calculateBulkMonthlyReport, { month: '2026-11', mentor_id: mentorId });
        const ranked = [...mentor.reports].sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name));
        const own = ranked.find(report => report.adm_no === 'PARENT-Z');
        assert.deepEqual(hidden.class_rank, { rank: 3, total_students: 3 }, 'Class rank follows mentor points and name order within a tie');
        assert.equal(hidden.hifz_report.summary.points.totalPoints, own.totalPoints);
        assert(own.grade, 'The parent release gate leaves the cached mentor grade available');
        assert.equal(hidden.students, undefined, 'Peer records stay out of the parent response');

        mock.timers.setTime(Date.parse('2026-11-16T00:00:00+05:30'));
        const revealed = await dashboard();
        assert.equal(revealed.hifz_report.grade_visible, true);
        assert.equal(revealed.hifz_report.summary.grade, own.grade, 'Grade appears at midnight in India on the 16th');
        assert.equal(revealed.hifz_report.summary.points.grade, own.grade);
        assert.equal(revealed.reports.find(report => report.report_month === '2026-11-01').grade, own.grade);
        assert.equal(revealed.reports.find(report => report.report_month === '2026-10-01').grade, null);

        assert.equal((await dashboard('2026-10')).hifz_report.grade_visible, true, 'Past months remain released');
        const future = await dashboard('2026-12');
        assert.equal(future.hifz_report.summary.grade, null, 'Future months remain pending');
        assert.equal(future.hifz_report.summary.points.grade, null);

        mentorId = null;
        invalidateCacheByPrefix('hifz:monthly-calculate');
        assert.equal((await dashboard()).class_rank, null, 'Unassigned students have no invented class rank');
        assert(queries.length > 0);
        console.log('Parent dashboard passed: mentor points, tie ordering, India midnight release, nested grade masking, past/future months, and unassigned students.');
    } finally {
        mock.timers.reset();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
