import assert from 'node:assert/strict';
import { assertCanReportStudent, reporterScopeSql } from '../modules/discipline/discipline.service';
import { closeDatabasePool } from '../config/db';

async function run() {
    for (const role of ['mentor', 'staff', 'usthad', 'teacher']) {
        let queried = false;
        await assertCanReportStudent({ role, staffId: 'reporter-1' }, 'OTHER-CLASS', {
            query: async (sql: string, params: any[]) => {
                queried = true;
                assert.deepEqual(params, ['OTHER-CLASS']);
                assert(sql.includes("status = 'active'"));
                assert(!sql.includes('mentor_id'));
                return { rows: [{}] };
            },
        } as any);
        assert(queried);
        const params: any[] = [];
        assert.equal(reporterScopeSql(role, 'reporter-1', params), ' AND i.reported_by = $1');
        assert.deepEqual(params, ['reporter-1']);
    }
    await assert.rejects(assertCanReportStudent({ role: 'mentor', staffId: null }, 'OTHER-CLASS'), /linked staff/);
    await assert.rejects(assertCanReportStudent({ role: 'mentor', staffId: 'reporter-1' }, 'INACTIVE', {
        query: async () => ({ rows: [] }),
    } as any), /active student/);
    console.log('Campus-wide incident reporting and unchanged reporter visibility passed.');
}
void run().finally(closeDatabasePool);
