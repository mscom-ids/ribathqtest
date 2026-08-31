import assert from 'node:assert/strict';
import { db } from '../config/db';
import { allocateOldestFirst, moneyToPaise, paiseToMoney } from '../utils/finance-money';
import { buildFinanceAccessProfile, buildLedgerViewAccessProfile } from '../modules/finance/finance.scope';
import { findPermission } from '../modules/finance/finance.auth';
import { currentMonthlyFees, workspace } from '../modules/finance/finance.service';
import type { FinanceActor, FinancePermission } from '../modules/finance/finance.types';

function permission(
    capability: FinancePermission['capability'],
    studentScope: FinancePermission['student_scope'],
    categoryId: string | null = null,
): FinancePermission {
    return {
        id: `${capability}:${studentScope}:${categoryId || 'none'}`,
        staff_id: 'staff-1',
        capability,
        category_id: categoryId,
        student_scope: studentScope,
        amount_limit: null,
        valid_from: null,
        valid_until: null,
        granted_by: null,
        revoked_at: null,
    };
}

assert.equal(moneyToPaise('7450'), 745_000);
assert.equal(moneyToPaise('0.05'), 5);
assert.equal(paiseToMoney(745_005), '7450.05');
assert.throws(() => moneyToPaise('1.001'), /no more than 2 decimal places/);
assert.throws(() => moneyToPaise('-1'), /valid amount/);

const allocation = allocateOldestFirst([
    { id: 'newer-high-priority', balance: '10.00', due_date: '2026-08-10', allocation_priority: 1 },
    { id: 'older-low-priority', balance: '5.00', due_date: '2026-08-01', allocation_priority: 100 },
    { id: 'newer-low-priority', balance: '20.00', due_date: '2026-08-10', allocation_priority: 50 },
], moneyToPaise('17.35'));
assert.deepEqual(allocation.allocations.map(item => [item.obligation_id, item.amount]), [
    ['older-low-priority', '5.00'],
    ['newer-high-priority', '10.00'],
    ['newer-low-priority', '2.35'],
]);
assert.equal(allocation.allocated, '17.35');
assert.equal(allocation.unapplied, '0.00');

const medical = '00000000-0000-4000-8000-000000000001';
const store = '00000000-0000-4000-8000-000000000002';
const mixed = buildFinanceAccessProfile([
    permission('ledger:view', 'assigned'),
    permission('charge:create', 'all', medical),
    permission('charge:create', 'assigned', store),
], false);
assert.equal(mixed.fullLedger, true);
assert.equal(mixed.fullLedgerAllStudents, false);
assert.equal(mixed.allStudentChargeAccess, true);
assert.equal(mixed.assignedStudentChargeAccess, true);

const ledgerOnly = buildLedgerViewAccessProfile([
    permission('ledger:view', 'assigned'),
    permission('payment:collect', 'all'),
], false);
assert.equal(ledgerOnly.fullLedger, true);
assert.equal(ledgerOnly.fullLedgerAllStudents, false);
assert.equal(buildLedgerViewAccessProfile([permission('ledger:view', 'all')], false).fullLedgerAllStudents, true);
assert.equal(buildLedgerViewAccessProfile([], true).fullLedgerAllStudents, true);

const actor: FinanceActor = {
    userId: '00000000-0000-4000-8000-000000000010',
    staffId: '00000000-0000-4000-8000-000000000011',
    role: 'mentor',
    name: 'Mentor',
    email: 'mentor@example.com',
    ipAddress: null,
};

async function runQueryRegressions() {
    const originalQuery = db.query;
    try {
        let permissionLookupSql = '';
        let permissionLookupParams: any[] = [];
        db.query = async (sql: string, params?: any[]) => {
            permissionLookupSql = sql;
            permissionLookupParams = params || [];
            return { rows: [], rowCount: 0 } as any;
        };
        await findPermission(actor, 'charge:create', medical);
        assert.match(permissionLookupSql, /category_id = \$3::uuid/);
        assert.deepEqual(permissionLookupParams, [actor.staffId, 'charge:create', medical]);

        const assignedLedgerPermission = permission('ledger:view', 'assigned');
        let currentFeesSql = '';
        let currentFeesParams: any[] = [];
        let permissionQueryCount = 0;
        db.query = async (sql: string, params?: any[]) => {
            if (sql.includes('FROM finance_staff_permissions')) {
                permissionQueryCount += 1;
                return { rows: [assignedLedgerPermission], rowCount: 1 } as any;
            }
            currentFeesSql = sql;
            currentFeesParams = params || [];
            return { rows: [], rowCount: 0 } as any;
        };

        await currentMonthlyFees(actor);
        assert.match(currentFeesSql, /student_year_snapshots snapshot/);
        assert.match(currentFeesSql, /\$3::boolean OR CASE/);
        assert.equal(currentFeesParams[1], actor.staffId);
        assert.equal(currentFeesParams[2], false);
        assert.equal(permissionQueryCount, 1);

        let summarySql = '';
        let recentSql = '';
        db.query = async (sql: string) => {
            if (sql.includes('FROM finance_staff_permissions')) return { rows: [], rowCount: 0 } as any;
            if (sql.includes('AS expected')) {
                summarySql = sql;
                return { rows: [{ expected: '100.00', collected: '50.00', outstanding: '50.00', pending: '50.00', overdue: '0', students_due: '1', credits: '0' }], rowCount: 1 } as any;
            }
            if (sql.includes('WITH recent AS')) recentSql = sql;
            return { rows: [], rowCount: 0 } as any;
        };

        await workspace({ ...actor, role: 'admin' }, { month: '2026-08', limit: 1 });
        assert.match(summarySql, /FROM finance_payments p/);
        assert.match(summarySql, /p\.status = 'posted'/);
        assert.match(summarySql, /p\.date >= \$2::date/);
        assert.match(summarySql, /p\.date < \(\$2::date \+ INTERVAL '1 month'\)/);
        assert.doesNotMatch(summarySql, /SUM\(paid_amount\).*AS collected/s);
        assert.match(recentSql, /WHERE p\.status = 'posted'/);
    } finally {
        db.query = originalQuery;
    }
}

runQueryRegressions()
    .then(() => console.log('Finance ledger unit tests passed.'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
