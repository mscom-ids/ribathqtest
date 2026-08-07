import type { FinancePermission } from './finance.types';

export type FinanceAccessProfile = {
    fullLedger: boolean;
    fullLedgerAllStudents: boolean;
    allStudentCategoryIds: string[];
    assignedStudentCategoryIds: string[];
};

function unique(values: Array<string | null>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/**
 * Converts individual grants into independent data scopes. Keeping ledger
 * grants separate from charge-category grants prevents an all-student medical
 * grant from accidentally expanding an assigned-only ledger grant.
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
        allStudentCategoryIds: unique(chargePermissions
            .filter(permission => permission.student_scope === 'all')
            .map(permission => permission.category_id)),
        assignedStudentCategoryIds: unique(chargePermissions
            .filter(permission => permission.student_scope === 'assigned')
            .map(permission => permission.category_id)),
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

export function visibleCategoryIds(profile: FinanceAccessProfile, isAssigned: boolean) {
    return unique([
        ...profile.allStudentCategoryIds,
        ...(isAssigned ? profile.assignedStudentCategoryIds : []),
    ]);
}
