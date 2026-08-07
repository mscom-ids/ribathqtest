import { Request } from 'express';

export const FINANCE_MANAGER_ROLES = ['admin', 'controller'] as const;
export const FINANCE_READ_ROLES = ['admin', 'controller', 'principal', 'vice_principal'] as const;
export const FINANCE_CAPABILITIES = [
    'charge:create',
    'payment:collect',
    'ledger:view',
] as const;

export type FinanceCapability = typeof FINANCE_CAPABILITIES[number];
export type FinanceStudentScope = 'assigned' | 'all';

export type FinanceActor = {
    userId: string;
    staffId: string;
    role: string;
    name: string;
    email: string;
    ipAddress: string | null;
};

export type FinancePermission = {
    id: string;
    staff_id: string;
    capability: FinanceCapability;
    category_id: string | null;
    student_scope: FinanceStudentScope;
    amount_limit: string | null;
    valid_from: string | null;
    valid_until: string | null;
    granted_by: string | null;
    revoked_at: string | null;
};

export type FinanceRequest = Request & {
    financeActor?: FinanceActor;
};

export class FinanceError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly code = 'FINANCE_ERROR',
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = 'FinanceError';
    }
}

export function normalizeFinanceRole(role: unknown) {
    return String(role || '').trim().toLowerCase();
}

export function isFinanceManager(role: unknown) {
    return FINANCE_MANAGER_ROLES.includes(normalizeFinanceRole(role) as (typeof FINANCE_MANAGER_ROLES)[number]);
}

export function isFinanceReadRole(role: unknown) {
    return FINANCE_READ_ROLES.includes(normalizeFinanceRole(role) as (typeof FINANCE_READ_ROLES)[number]);
}

