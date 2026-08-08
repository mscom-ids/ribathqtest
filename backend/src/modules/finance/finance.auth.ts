import { NextFunction, Request, Response } from 'express';
import { db } from '../../config/db';
import { moneyToPaise } from '../../utils/finance-money';
import {
    FinanceActor,
    FinanceCapability,
    FinanceError,
    FinancePermission,
    FinanceRequest,
    isFinanceManager,
    isFinanceReadRole,
    normalizeFinanceRole,
} from './finance.types';

export async function resolveFinanceActor(req: Request): Promise<FinanceActor> {
    const user = (req as any).user || {};
    if (!user.id) throw new FinanceError(401, 'Authentication is required.', 'UNAUTHENTICATED');

    // Resolve from the CURRENT staff row instead of trusting the seven-day JWT
    // role, so role changes and revocations take effect immediately. We fetch
    // regardless of is_active and decide access by role below:
    //   • Privileged finance roles (admin / controller / principal /
    //     vice_principal) hold authority by virtue of the ROLE itself — an admin
    //     governs finance because they are the admin, not because they occupy an
    //     active staff seat. is_active does not gate them.
    //   • Everyone else (regular staff acting on granted finance permissions)
    //     must be an active staff member; deactivating the seat revokes the grant.
    const userId = typeof user.id === 'string' && user.id.trim() ? user.id.trim() : null;
    const profileId = typeof user.profile_id === 'string' && user.profile_id.trim() ? user.profile_id.trim() : null;
    const email = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null;

    const result = await db.query(
        `SELECT id, role, name, email, is_active
         FROM staff
         WHERE ($1::text IS NOT NULL AND id::text = $1::text)
            OR ($2::text IS NOT NULL AND profile_id::text = $2::text)
            OR ($3::text IS NOT NULL AND lower(email) = lower($3::text))
         ORDER BY CASE WHEN id::text = $1::text THEN 0 ELSE 1 END
         LIMIT 1`,
        [userId, profileId, email],
    );
    const staff = result.rows[0];
    if (!staff) throw new FinanceError(403, 'A current staff profile is required.', 'STAFF_PROFILE_REQUIRED');

    const role = normalizeFinanceRole(staff.role);
    // Privileged roles get access from the role; regular staff must be active.
    if (!isFinanceReadRole(role) && !staff.is_active) {
        throw new FinanceError(403, 'Your staff account is inactive.', 'STAFF_INACTIVE');
    }

    return {
        userId: String(user.id),
        staffId: String(staff.id),
        role,
        name: String(staff.name || ''),
        email: String(staff.email || ''),
        ipAddress: req.ip || req.socket?.remoteAddress || null,
    };
}

export async function attachFinanceActor(req: FinanceRequest, _res: Response, next: NextFunction) {
    try {
        req.financeActor = await resolveFinanceActor(req);
        next();
    } catch (error) {
        next(error);
    }
}

export function rejectFinanceDelegation(req: Request, _res: Response, next: NextFunction) {
    if (req.headers['x-delegation-token'] || (req as any).delegation) {
        return next(new FinanceError(
            403,
            'Mentor delegation cannot be used for finance changes.',
            'FINANCE_DELEGATION_FORBIDDEN',
        ));
    }
    next();
}

export async function listCurrentPermissions(actor: FinanceActor): Promise<FinancePermission[]> {
    const result = await db.query(
        `SELECT id, staff_id, capability, category_id, student_scope, amount_limit,
                valid_from, valid_until, granted_by, revoked_at
         FROM finance_staff_permissions
         WHERE staff_id = $1
           AND revoked_at IS NULL
           AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
           AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         ORDER BY capability, category_id NULLS LAST, created_at DESC`,
        [actor.staffId],
    );
    return result.rows as FinancePermission[];
}

export async function findPermission(
    actor: FinanceActor,
    capability: FinanceCapability,
    categoryId?: string | null,
): Promise<FinancePermission | null> {
    if (isFinanceManager(actor.role)) {
        return {
            id: 'role-manager',
            staff_id: actor.staffId,
            capability,
            category_id: categoryId || null,
            student_scope: 'all',
            amount_limit: null,
            valid_from: null,
            valid_until: null,
            granted_by: null,
            revoked_at: null,
        };
    }

    if (capability === 'ledger:view' && isFinanceReadRole(actor.role)) {
        return {
            id: 'role-reader',
            staff_id: actor.staffId,
            capability,
            category_id: null,
            student_scope: 'all',
            amount_limit: null,
            valid_from: null,
            valid_until: null,
            granted_by: null,
            revoked_at: null,
        };
    }

    const params: unknown[] = [actor.staffId, capability];
    const result = await db.query(
        `SELECT id, staff_id, capability, category_id, student_scope, amount_limit,
                valid_from, valid_until, granted_by, revoked_at
         FROM finance_staff_permissions
         WHERE staff_id = $1
           AND capability = $2
           AND revoked_at IS NULL
           AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
           AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
         ORDER BY CASE WHEN student_scope = 'all' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1`,
        params as any[],
    );
    return (result.rows[0] || null) as FinancePermission | null;
}

export async function requireFinanceCapability(
    actor: FinanceActor,
    capability: FinanceCapability,
    options: {
        categoryId?: string | null;
        studentId?: string | null;
        amountPaise?: number;
        requireActiveStudent?: boolean;
    } = {},
) {
    const permission = await findPermission(actor, capability, options.categoryId);
    if (!permission) {
        throw new FinanceError(403, 'You are not authorized for this finance action.', 'FINANCE_FORBIDDEN');
    }

    if (options.amountPaise !== undefined && permission.amount_limit !== null) {
        const limitPaise = moneyToPaise(permission.amount_limit, { allowZero: true, field: 'Permission amount limit' });
        if (options.amountPaise > limitPaise) {
            throw new FinanceError(403, 'The amount exceeds your authorization limit.', 'AMOUNT_LIMIT_EXCEEDED');
        }
    }

    if (options.studentId) {
        const student = await db.query(
            `SELECT s.adm_no, s.status,
                    CASE
                     WHEN snapshot.id IS NOT NULL THEN
                       $2::uuid IN (snapshot.hifz_mentor_id, snapshot.school_mentor_id, snapshot.madrasa_mentor_id)
                     ELSE
                       $2::uuid IN (s.hifz_mentor_id, s.school_mentor_id, s.madrasa_mentor_id)
                   END AS is_assigned
             FROM students s
            LEFT JOIN academic_years ay ON ay.is_current = true
            LEFT JOIN student_year_snapshots snapshot
              ON snapshot.student_id = s.adm_no
             AND snapshot.academic_year_id = ay.id
             AND lower(COALESCE(snapshot.status, 'active')) = 'active'
             WHERE s.adm_no = $1
             LIMIT 1`,
            [options.studentId, actor.staffId],
        );
        if (!student.rows[0]) throw new FinanceError(404, 'Student not found.', 'STUDENT_NOT_FOUND');
        if (options.requireActiveStudent && student.rows[0].status !== 'active') {
            throw new FinanceError(409, 'Finance entries can only be added for active students.', 'STUDENT_INACTIVE');
        }
        if (permission.student_scope === 'assigned' && !student.rows[0].is_assigned) {
            throw new FinanceError(403, 'You are not authorized for this student.', 'STUDENT_SCOPE_FORBIDDEN');
        }
    }

    return permission;
}

export function requireFinanceManager(actor: FinanceActor) {
    if (!isFinanceManager(actor.role)) {
        throw new FinanceError(403, 'Only finance administrators can perform this action.', 'FINANCE_MANAGER_REQUIRED');
    }
}
