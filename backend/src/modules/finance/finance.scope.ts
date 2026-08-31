import type { FinancePermission } from './finance.types';

export type FinanceAccessProfile = {
    fullLedger: boolean;
    fullLedgerAllStudents: boolean;
    allStudentChargeAccess: boolean;
    assignedStudentChargeAccess: boolean;
};

/**
 * Converts individual grants into independent student scopes. Charge category
 * IDs are intentionally enforced separately by the authorization and service
 * layers so a grant never widens to unrelated categories.
 */
export function buildFinanceAccessProfile(
    permissions: FinancePermission[],
    roleCanReadAll: boolean,
): FinanceAccessProfile {
    const ledgerPermissions = permissions.filter(permission =>
        permission.capability === 'ledger:view' || permission.capability === 'payment:collect');
    const chargePermissions = permissions.filter(permission => permission.capability === 'charge:create');

    return {
        fullLedger: roleCanReadAll || ledgerPermissions.length > 0,
        fullLedgerAllStudents: roleCanReadAll
            || ledgerPermissions.some(permission => permission.student_scope === 'all'),
        allStudentChargeAccess: roleCanReadAll || chargePermissions.some(permission => permission.student_scope === 'all'),
        assignedStudentChargeAccess: roleCanReadAll || chargePermissions.some(permission => permission.student_scope === 'assigned'),
    };
}

/**
 * Builds the data scope for endpoints that explicitly require ledger:view.
 * Other capabilities must not widen a narrower ledger grant.
 */
export function buildLedgerViewAccessProfile(
    permissions: FinancePermission[],
    roleCanReadAll: boolean,
) {
    return buildFinanceAccessProfile(
        permissions.filter(permission => permission.capability === 'ledger:view'),
        roleCanReadAll,
    );
}
