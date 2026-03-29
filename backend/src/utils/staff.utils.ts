import { Request } from 'express';
import { db } from '../config/db';

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
    const staffRes = await db.query('SELECT id FROM staff WHERE id = $1 OR profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
    if (staffRes.rows.length === 0) return null;
    const actualStaffId = staffRes.rows[0].id;

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
