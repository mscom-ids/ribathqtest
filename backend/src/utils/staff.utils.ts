import { Request } from 'express';
import { db } from '../config/db';
import { cachedResult, makeCacheKey } from './server-cache';

export type StaffDomain = 'teaching' | 'leadership' | 'administrative';

export const TEACHING_STAFF_ROLES = ['usthad', 'mentor', 'staff', 'teacher'];
export const LEADERSHIP_STAFF_ROLES = ['principal', 'vice_principal'];
export const ADMINISTRATIVE_STAFF_ROLES = ['admin', 'controller'];
export const NON_TEACHING_STAFF_ROLES = [...LEADERSHIP_STAFF_ROLES, ...ADMINISTRATIVE_STAFF_ROLES];

export function normalizeStaffRole(role?: string | null) {
    return String(role || '').trim().toLowerCase();
}

export function isTeachingStaffRole(role?: string | null) {
    return TEACHING_STAFF_ROLES.includes(normalizeStaffRole(role));
}

export function isLeadershipStaffRole(role?: string | null) {
    return LEADERSHIP_STAFF_ROLES.includes(normalizeStaffRole(role));
}

export function isAdministrativeStaffRole(role?: string | null) {
    return ADMINISTRATIVE_STAFF_ROLES.includes(normalizeStaffRole(role));
}

export function staffDomainForRole(role?: string | null): StaffDomain {
    if (isLeadershipStaffRole(role)) return 'leadership';
    if (isAdministrativeStaffRole(role)) return 'administrative';
    return 'teaching';
}

export function staffRoleLabel(role?: string | null) {
    const normalized = normalizeStaffRole(role);
    const labels: Record<string, string> = {
        usthad: 'General Mentor',
        mentor: 'General Mentor',
        staff: 'General Mentor',
        teacher: 'General Mentor',
        principal: 'Principal',
        vice_principal: 'Vice Principal',
        admin: 'Administrator',
        controller: 'Administrator',
    };
    return labels[normalized] || (role ? String(role) : 'Staff');
}

export interface DelegationContext {
    staffId: string;
    studentId: string | null;
    isDelegated: boolean;
}

export const getStaffId = async (req: Request): Promise<string | null> => {
    const ctx = await getDelegationContext(req);
    return ctx?.staffId || null;
};

export const getDelegationContext = async (req: Request): Promise<DelegationContext | null> => {
    const user = (req as any).user;
    if (!user) return null;

    // 1. Resolve the actual staff ID of the logged-in user.
    //    Cache for 10 min per user — this lookup runs on EVERY API request
    //    and was the top slow query (1000-1039ms each time).
    const actualStaffId = await cachedResult(
        makeCacheKey('staff:id-by-user', { uid: user.id }),
        10 * 60_000,
        async () => {
            const staffRes = await db.query(
                'SELECT id FROM staff WHERE id = $1 OR profile_id = $1 OR email = $2 LIMIT 1',
                [user.id, user.email]
            );
            return staffRes.rows[0]?.id || null;
        }
    );

    if (!actualStaffId) return null;

    // 2. Check if a verified delegation token is attached by middleware
    const delegation = (req as any).delegation;
    if (delegation && delegation.actingAsStaffId) {
        return {
            staffId: delegation.actingAsStaffId,
            studentId: delegation.studentId || null,
            isDelegated: true
        };
    }

    return { staffId: actualStaffId, studentId: null, isDelegated: false };
};
