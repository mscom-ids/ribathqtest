import { Request } from 'express';
import { db } from '../../config/db';
import { allocateOldestFirst, moneyToPaise, paiseToMoney } from '../../utils/finance-money';
import { findPermission, listCurrentPermissions, requireFinanceCapability, requireFinanceManager } from './finance.auth';
import { buildFinanceAccessProfile, buildLedgerViewAccessProfile } from './finance.scope';
import { FinanceActor, FinanceError, FinancePermission, isFinanceManager, isFinanceReadRole } from './finance.types';
import {
    boundedLimit,
    capability,
    date,
    idempotencyKey,
    money,
    month,
    optionalDate,
    optionalText,
    optionalUuid,
    paymentMethod,
    requiredText,
    requiredUuid,
    studentScope,
} from './finance.validation';

type Queryable = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

function currentDate() {
    const timeZone = process.env.INSTITUTION_TIMEZONE || 'Asia/Kolkata';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

function currentMonth() {
    return `${currentDate().slice(0, 7)}-01`;
}

function pgErrorCode(error: unknown) {
    return typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
}

async function audit(
    client: Queryable,
    actor: FinanceActor,
    input: {
        action: string;
        entityType: string;
        entityId?: string | null;
        studentId?: string | null;
        metadata?: unknown;
    },
) {
    await client.query(
        `INSERT INTO finance_audit_events
            (actor_id, action, entity_type, entity_id, student_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
            actor.staffId,
            input.action,
            input.entityType,
            input.entityId || null,
            input.studentId || null,
            JSON.stringify({ ...(input.metadata as object || {}), ip_address: actor.ipAddress }),
        ],
    );
}

function hasChargePermission(permissions: FinancePermission[]) {
    return permissions.some(permission => permission.capability === 'charge:create');
}

async function activeChargeCategoryIds() {
    const result = await db.query(`SELECT id FROM charge_categories WHERE is_active = true ORDER BY name`);
    return result.rows.map(category => String(category.id));
}

function assignedExpression(actorParameter: string, snapshotAlias = 'snapshot', studentAlias = 's') {
    return `CASE
        WHEN ${snapshotAlias}.id IS NOT NULL THEN
          ${actorParameter}::uuid IN (${snapshotAlias}.hifz_mentor_id, ${snapshotAlias}.school_mentor_id, ${snapshotAlias}.madrasa_mentor_id)
        ELSE
          ${actorParameter}::uuid IN (${studentAlias}.hifz_mentor_id, ${studentAlias}.school_mentor_id, ${studentAlias}.madrasa_mentor_id)
      END`;
}

async function isStudentAssigned(actor: FinanceActor, studentId: string) {
    const assigned = await db.query(
        `SELECT ${assignedExpression('$2')} AS is_assigned
         FROM students s
         LEFT JOIN academic_years ay ON ay.is_current = true
         LEFT JOIN student_year_snapshots snapshot
           ON snapshot.student_id = s.adm_no
          AND snapshot.academic_year_id = ay.id
          AND lower(COALESCE(snapshot.status, 'active')) = 'active'
         WHERE s.adm_no = $1
         LIMIT 1`,
        [studentId, actor.staffId],
    );
    return Boolean(assigned.rows[0]?.is_assigned);
}
export async function financeCapabilities(actor: FinanceActor, providedPermissions?: FinancePermission[]) {
    const permissions = providedPermissions || await listCurrentPermissions(actor);
    const manager = isFinanceManager(actor.role);
    const reader = isFinanceReadRole(actor.role);
    const has = (value: string) => manager || permissions.some(permission => permission.capability === value);
    const canAddCharge = has('charge:create');
    return {
        can_view_overview: reader || permissions.length > 0,
        can_view_dues: reader || permissions.length > 0,
        can_view_transactions: reader || has('payment:collect'),
        can_add_charge: canAddCharge,
        can_collect_payment: has('payment:collect'),
        can_manage_setup: manager,
        allowed_category_ids: manager || canAddCharge ? await activeChargeCategoryIds() : [],
        amount_limit: manager
            ? null
            : permissions
                .filter(permission => permission.capability === 'charge:create' && permission.amount_limit !== null)
                .map(permission => Number(permission.amount_limit)),
    };
}

async function assertStudentExists(client: Queryable, studentId: string) {
    const result = await client.query(
        `SELECT s.adm_no, s.name, COALESCE(p.standard, s.standard) AS standard,
                p.division, s.photo_url, s.status
         FROM students s
         LEFT JOIN academic_years ay ON ay.is_current = true
         LEFT JOIN academic_student_placements p
           ON p.student_id = s.adm_no
          AND p.academic_year_id = ay.id
          AND p.status = 'active'
         WHERE s.adm_no = $1 LIMIT 1`,
        [studentId],
    );
    if (!result.rows[0]) throw new FinanceError(404, 'Student not found.', 'STUDENT_NOT_FOUND');
    return result.rows[0];
}

async function accountVisibility(actor: FinanceActor, studentId: string) {
    const permissions = await listCurrentPermissions(actor);
    if (!isFinanceReadRole(actor.role) && permissions.length === 0) {
        throw new FinanceError(403, 'You are not authorized to view student finance.', 'FINANCE_FORBIDDEN');
    }

    const profile = buildFinanceAccessProfile(permissions, isFinanceReadRole(actor.role));
    const assigned = profile.fullLedgerAllStudents ? false : await isStudentAssigned(actor, studentId);
    const fullLedgerForStudent = profile.fullLedger && (profile.fullLedgerAllStudents || assigned);
    const canViewChargesForStudent = profile.allStudentChargeAccess
        || (assigned && profile.assignedStudentChargeAccess);
    const categoryIds = fullLedgerForStudent || !canViewChargesForStudent
        ? []
        : await activeChargeCategoryIds();
    if (!fullLedgerForStudent && !categoryIds.length) {
        throw new FinanceError(403, 'You are not authorized for this student.', 'STUDENT_SCOPE_FORBIDDEN');
    }

    return {
        permissions,
        fullLedger: fullLedgerForStudent,
        fullLedgerAllStudents: profile.fullLedgerAllStudents,
        isAssigned: assigned,
        categoryIds,
    };
}
export async function getStudentAccount(actor: FinanceActor, studentIdInput: unknown) {
    const studentId = requiredText(studentIdInput, 'Student', 50);
    const visibility = await accountVisibility(actor, studentId);
    const student = await assertStudentExists(db, studentId);

    const params: any[] = [studentId];
    let categorySql = '';
    if (!visibility.fullLedger) {
        if (!visibility.categoryIds.length) throw new FinanceError(403, 'You are not authorized to view this account.', 'FINANCE_FORBIDDEN');
        params.push(visibility.categoryIds);
        categorySql = `AND o.category_id = ANY($${params.length}::uuid[])`;
    }

    const openItemsPromise = db.query(
        `SELECT o.id,
                o.obligation_type AS type,
                o.category_id,
                c.name AS category_name,
                o.description,
                o.amount,
                o.paid_amount,
                o.balance,
                o.due_date,
                o.service_month AS month,
                o.status,
                o.allocation_priority AS priority
         FROM finance_obligations o
         LEFT JOIN charge_categories c ON c.id = o.category_id
         WHERE o.student_id = $1
           AND o.voided_at IS NULL
           AND o.status IN ('open', 'partial')
           AND o.approval_status = 'approved'
           AND o.balance > 0
           ${categorySql}
         ORDER BY o.due_date NULLS LAST, o.allocation_priority, o.created_at, o.id`,
        params,
    );

    const paymentsPromise = visibility.fullLedger
        ? db.query(
            `SELECT p.id, p.amount, p.method, p.method AS payment_method,
                    p.payment_account_id, pa.account_holder AS account_name,
                    p.receipt_number, p.notes, p.date, p.status, p.allocation_status, p.created_at,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id', a.id,
                                'item_id', a.obligation_id,
                                'open_item_id', a.obligation_id,
                                'description', o.description,
                                'amount', a.amount
                            ) ORDER BY a.created_at, a.id
                        ) FILTER (WHERE a.id IS NOT NULL),
                        '[]'::json
                    ) AS allocations
             FROM finance_payments p
             LEFT JOIN finance_payment_allocations a ON a.payment_id = p.id
             LEFT JOIN finance_obligations o ON o.id = a.obligation_id
             LEFT JOIN payment_accounts pa ON pa.id = p.payment_account_id
             WHERE p.student_id = $1
             GROUP BY p.id, pa.account_holder
             ORDER BY p.date DESC, p.created_at DESC
             LIMIT 100`,
            [studentId],
        )
        : Promise.resolve({ rows: [] });

    const activeRulePromise = db.query(
        `WITH schedule AS (
            SELECT fs.*
            FROM finance_fee_schedules fs
            WHERE fs.status = 'active'
              AND fs.effective_from <= CURRENT_DATE
              AND (fs.effective_until IS NULL OR fs.effective_until >= CURRENT_DATE)
              AND (
                fs.scope_type = 'institution'
                OR (fs.scope_type = 'standard' AND fs.standard = $2)
                OR (fs.scope_type = 'division' AND fs.standard = $2 AND fs.division = $3)
              )
            ORDER BY CASE fs.scope_type WHEN 'division' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END,
                     fs.effective_from DESC, fs.created_at DESC
            LIMIT 1
         ), agreement AS (
            SELECT a.*
            FROM finance_student_fee_agreements a
            WHERE a.student_id = $1
              AND a.status = 'active'
              AND a.effective_from <= CURRENT_DATE
              AND (a.effective_until IS NULL OR a.effective_until >= CURRENT_DATE)
            ORDER BY a.effective_from DESC, a.created_at DESC
            LIMIT 1
         )
         SELECT COALESCE(a.id::text, s.id::text) AS id,
                CASE
                  WHEN a.adjustment_type = 'fixed' THEN a.amount
                  WHEN a.adjustment_type = 'discount_amount' THEN GREATEST(COALESCE(s.amount, 0) - a.amount, 0)
                  WHEN a.adjustment_type = 'discount_percent' THEN
                       GREATEST(ROUND(COALESCE(s.amount, 0) * (1 - a.amount / 100), 2), 0)
                  WHEN a.adjustment_type = 'surcharge' THEN COALESCE(s.amount, 0) + a.amount
                  WHEN a.adjustment_type = 'waiver' THEN 0
                  ELSE s.amount
                END AS amount,
                CASE WHEN a.id IS NOT NULL THEN 'student agreement' ELSE 'fee schedule' END AS source,
                COALESCE(a.reason, s.name) AS label,
                COALESCE(a.effective_from, s.effective_from) AS effective_from,
                COALESCE(a.effective_until, s.effective_until) AS effective_until
         FROM schedule s
         FULL JOIN agreement a ON true
         LIMIT 1`,
        [studentId, student.standard || null, student.division || null],
    );

    const creditPromise = visibility.fullLedger
        ? db.query(
            `SELECT COALESCE(SUM(unapplied_amount), 0) AS credit
             FROM finance_payments
             WHERE student_id = $1 AND status = 'posted' AND allocation_status = 'strict'`,
            [studentId],
        )
        : Promise.resolve({ rows: [{ credit: '0.00' }] });
    const [openItemsResult, paymentsResult, activeRuleResult, creditResult] = await Promise.all([
        openItemsPromise,
        paymentsPromise,
        activeRulePromise,
        creditPromise,
    ]);
    const openItems = openItemsResult.rows;
    const outstandingPaise = openItems.reduce(
        (sum, item) => sum + moneyToPaise(item.balance, { allowZero: true, field: 'Balance' }),
        0,
    );
    const overduePaise = openItems
        .filter(item => item.status === 'overdue' || (item.due_date && String(item.due_date).slice(0, 10) < currentDate()))
        .reduce((sum, item) => sum + moneyToPaise(item.balance, { allowZero: true, field: 'Balance' }), 0);
    return {
        student: {
            id: student.adm_no,
            student_id: student.adm_no,
            adm_no: student.adm_no,
            name: student.name,
            standard: student.standard,
            division: student.division,
            photo_url: student.photo_url,
            status: student.status,
        },
        summary: {
            total_due: Number(paiseToMoney(outstandingPaise)),
            outstanding: Number(paiseToMoney(outstandingPaise)),
            overdue: Number(paiseToMoney(overduePaise)),
            credit_balance: Number(creditResult.rows[0]?.credit || 0),
            credits: Number(creditResult.rows[0]?.credit || 0),
        },
        open_items: openItems,
        payments: paymentsResult.rows,
        active_fee_rule: activeRuleResult.rows[0] || null,
    };
}

export async function createCharge(actor: FinanceActor, body: any) {
    const studentId = requiredText(body?.student_id, 'Student', 50);
    const categoryId = requiredUuid(body?.category_id, 'Charge category');
    const parsedAmount = money(body?.amount, 'Charge amount');
    const chargeDate = date(body?.date || currentDate(), 'Charge date');
    const dueDate = optionalDate(body?.due_date, 'Due date') || chargeDate;
    const description = optionalText(body?.description, 'Description', 500) || 'Additional charge';
    const key = idempotencyKey(body?.idempotency_key);
    const permission = await requireFinanceCapability(actor, 'charge:create', {
        categoryId,
        studentId,
        amountPaise: parsedAmount.paise,
        requireActiveStudent: true,
    });

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const duplicate = await client.query(
            `SELECT *,
                    student_id = $2
                    AND category_id = $3::uuid
                    AND description = $4
                    AND amount = $5::numeric
                    AND service_month = date_trunc('month', $6::date)::date
                    AND due_date = $7::date AS same_request
             FROM finance_obligations
             WHERE idempotency_key = $1
             LIMIT 1`,
            [key, studentId, categoryId, description, parsedAmount.value, chargeDate, dueDate],
        );
        if (duplicate.rows[0]) {
            const row = duplicate.rows[0];
            if (!row.same_request) {
                throw new FinanceError(409, 'This idempotency key was already used for different charge details.', 'IDEMPOTENCY_CONFLICT');
            }
            await client.query('COMMIT');
            return { obligation: row, duplicate: true, account: await getStudentAccount(actor, studentId) };
        }

        const category = await client.query(
            `SELECT id, name, allocation_priority, requires_approval, allow_staff_entry
             FROM charge_categories WHERE id = $1 AND is_active = true LIMIT 1`,
            [categoryId],
        );
        if (!category.rows[0]) throw new FinanceError(409, 'Charge category is inactive or unavailable.', 'CATEGORY_INACTIVE');
        if (category.rows[0].requires_approval === true) {
            throw new FinanceError(409, 'This category requires an approval workflow that is not enabled.', 'CATEGORY_APPROVAL_UNAVAILABLE');
        }
        const requiresApproval = false;
        const approvalStatus = 'approved';

        const result = await client.query(
            `INSERT INTO finance_obligations
                (student_id, obligation_type, category_id, description, amount, paid_amount, balance,
                 service_month, due_date, status, allocation_priority, idempotency_key, created_by,
                 requires_approval, approval_status, approved_at, approved_by)
             VALUES ($1, 'charge', $2, $3, $4, 0, $4, date_trunc('month', $5::date)::date,
                     $6, 'open', $7, $8, $9::uuid, $10, $11,
                     CASE WHEN $11 = 'pending' THEN NULL ELSE NOW() END,
                     CASE WHEN $11 = 'pending' THEN NULL ELSE $9::uuid END)
             RETURNING *`,
            [
                studentId,
                categoryId,
                description,
                parsedAmount.value,
                chargeDate,
                dueDate,
                Number(category.rows[0].allocation_priority ?? 100),
                key,
                actor.staffId,
                requiresApproval,
                approvalStatus,
            ],
        );
        const obligation = result.rows[0];
        await audit(client, actor, {
            action: 'charge_created',
            entityType: 'obligation',
            entityId: obligation.id,
            studentId,
            metadata: {
                category_id: categoryId,
                category_name: category.rows[0].name,
                amount: parsedAmount.value,
                permission_id: permission.id,
            },
        });
        await client.query('COMMIT');
        return { obligation, duplicate: false, account: await getStudentAccount(actor, studentId) };
    } catch (error) {
        await client.query('ROLLBACK');
        if (pgErrorCode(error) === '23505') {
            throw new FinanceError(409, 'This charge request has already been recorded.', 'IDEMPOTENCY_CONFLICT');
        }
        throw error;
    } finally {
        client.release();
    }
}

function compareSubmittedAllocations(
    submitted: unknown,
    computed: Array<{ obligation_id: string; amount: string }>,
) {
    if (submitted === undefined || submitted === null) return;
    if (!Array.isArray(submitted)) throw new FinanceError(400, 'Payment allocations must be a list.', 'VALIDATION_ERROR');
    const normalized = submitted.map((allocation: any) => ({
        obligation_id: requiredUuid(allocation?.item_id || allocation?.obligation_id, 'Allocation item'),
        amount: money(allocation?.amount, 'Allocation amount').value,
    }));
    if (normalized.length !== computed.length) {
        throw new FinanceError(409, 'Outstanding items changed. Please review the payment allocation again.', 'ALLOCATION_STALE');
    }
    for (let index = 0; index < computed.length; index += 1) {
        if (normalized[index].obligation_id !== computed[index].obligation_id
            || normalized[index].amount !== computed[index].amount) {
            throw new FinanceError(409, 'Outstanding items changed. Please review the payment allocation again.', 'ALLOCATION_STALE');
        }
    }
}

export async function recordPayment(actor: FinanceActor, body: any) {
    const studentId = requiredText(body?.student_id, 'Student', 50);
    const parsedAmount = money(body?.amount, 'Payment amount');
    const method = paymentMethod(body?.payment_method || body?.method);
    const paymentAccountId = optionalUuid(body?.payment_account_id || body?.account_id, 'Payment account');
    const receiptNumber = optionalText(body?.receipt_number || body?.reference_number, 'Receipt number', 120);
    const paymentDate = body?.date ? date(body.date, 'Payment date') : currentDate();
    const notes = optionalText(body?.notes, 'Notes', 1000);
    const key = idempotencyKey(body?.idempotency_key);
    await requireFinanceCapability(actor, 'payment:collect', { studentId, amountPaise: parsedAmount.paise });

    if (method !== 'cash' && !paymentAccountId) {
        throw new FinanceError(400, 'A receiving account is required for non-cash payments.', 'PAYMENT_ACCOUNT_REQUIRED');
    }
    if (method === 'cash' && paymentAccountId) {
        throw new FinanceError(400, 'Cash payments cannot be linked to a bank or UPI account.', 'PAYMENT_ACCOUNT_NOT_ALLOWED');
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const duplicate = await client.query(
            `SELECT *,
                    student_id = $2
                    AND amount = $3::numeric
                    AND method = $4
                    AND payment_account_id IS NOT DISTINCT FROM $5::uuid
                    AND receipt_number IS NOT DISTINCT FROM $6::text
                    AND date = $7::date
                    AND notes IS NOT DISTINCT FROM $8::text AS same_request
             FROM finance_payments
             WHERE idempotency_key = $1
             LIMIT 1`,
            [key, studentId, parsedAmount.value, method, paymentAccountId, receiptNumber, paymentDate, notes],
        );
        if (duplicate.rows[0]) {
            const row = duplicate.rows[0];
            if (!row.same_request) {
                throw new FinanceError(409, 'This idempotency key was already used for different payment details.', 'IDEMPOTENCY_CONFLICT');
            }
            await client.query('COMMIT');
            return { payment: row, duplicate: true, account: await getStudentAccount(actor, studentId) };
        }

        await assertStudentExists(client, studentId);
        if (paymentAccountId) {
            const account = await client.query(
                `SELECT id, account_type FROM payment_accounts WHERE id = $1 AND is_active = true LIMIT 1`,
                [paymentAccountId],
            );
            if (!account.rows[0]) throw new FinanceError(409, 'Payment account is inactive or unavailable.', 'PAYMENT_ACCOUNT_INACTIVE');
            if (String(account.rows[0].account_type).toLowerCase() !== method) {
                throw new FinanceError(400, 'The receiving account does not match the payment method.', 'PAYMENT_ACCOUNT_METHOD_MISMATCH');
            }
        }

        const obligations = await client.query(
            `SELECT id, balance, due_date, allocation_priority
             FROM finance_obligations
             WHERE student_id = $1
               AND voided_at IS NULL
               AND status IN ('open', 'partial')
               AND approval_status = 'approved'
               AND balance > 0
             ORDER BY due_date NULLS LAST, allocation_priority, created_at, id
             FOR UPDATE`,
            [studentId],
        );
        const allocation = allocateOldestFirst(obligations.rows, parsedAmount.paise);
        compareSubmittedAllocations(body?.allocations, allocation.allocations);

        const paymentResult = await client.query(
            `INSERT INTO finance_payments
                (student_id, amount, allocated_amount, unapplied_amount, allocation_status,
                 method, payment_account_id, receipt_number, date, notes, status, idempotency_key, recorded_by)
             VALUES ($1, $2, $3, $4,
                     'strict',
                     $5, $6, $7, $8, $9, 'posted', $10, $11)
             RETURNING *`,
            [
                studentId,
                parsedAmount.value,
                allocation.allocated,
                allocation.unapplied,
                method,
                paymentAccountId,
                receiptNumber,
                paymentDate,
                notes,
                key,
                actor.staffId,
            ],
        );
        const payment = paymentResult.rows[0];

        for (const item of allocation.allocations) {
            await client.query(
                `INSERT INTO finance_payment_allocations (payment_id, obligation_id, amount)
                 VALUES ($1, $2, $3)`,
                [payment.id, item.obligation_id, item.amount],
            );
            await client.query(
                `UPDATE finance_obligations
                 SET paid_amount = paid_amount + $2::numeric,
                     balance = balance - $2::numeric,
                     status = CASE
                         WHEN balance - $2::numeric = 0 THEN 'paid'
                         ELSE 'partial'
                     END
                 WHERE id = $1`,
                [item.obligation_id, item.amount],
            );
        }

        await audit(client, actor, {
            action: 'payment_recorded',
            entityType: 'payment',
            entityId: payment.id,
            studentId,
            metadata: {
                amount: parsedAmount.value,
                method,
                receipt_number: receiptNumber,
                allocated_amount: allocation.allocated,
                unapplied_amount: allocation.unapplied,
                allocations: allocation.allocations.map(item => ({ obligation_id: item.obligation_id, amount: item.amount })),
            },
        });
        await client.query('COMMIT');
        return { payment, duplicate: false, account: await getStudentAccount(actor, studentId) };
    } catch (error) {
        await client.query('ROLLBACK');
        if (pgErrorCode(error) === '23505') {
            throw new FinanceError(409, 'This payment request has already been recorded.', 'IDEMPOTENCY_CONFLICT');
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function voidObligation(actor: FinanceActor, obligationIdInput: unknown, body: any) {
    requireFinanceManager(actor);
    const obligationId = requiredUuid(obligationIdInput, 'Obligation');
    const reason = requiredText(body?.reason, 'Void reason', 500);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const current = await client.query(
            `SELECT * FROM finance_obligations WHERE id = $1 FOR UPDATE`,
            [obligationId],
        );
        const obligation = current.rows[0];
        if (!obligation) throw new FinanceError(404, 'Finance obligation not found.', 'OBLIGATION_NOT_FOUND');
        if (obligation.status === 'void') {
            await client.query('COMMIT');
            return { obligation, duplicate: true };
        }
        if (obligation.obligation_type === 'monthly_fee') {
            throw new FinanceError(409, 'Published monthly fees cannot be voided individually.', 'MONTHLY_FEE_VOID_FORBIDDEN');
        }
        if (moneyToPaise(obligation.paid_amount, { allowZero: true, field: 'Paid amount' }) !== 0) {
            throw new FinanceError(409, 'A paid or partially paid item cannot be voided. Reverse its payments first.', 'OBLIGATION_HAS_PAYMENTS');
        }
        const allocations = await client.query(
            `SELECT 1
             FROM finance_payment_allocations a
             JOIN finance_payments p ON p.id = a.payment_id
             WHERE a.obligation_id = $1
               AND p.status = 'posted'
               AND p.allocation_status = 'strict'
             LIMIT 1`,
            [obligationId],
        );
        if (allocations.rows[0]) {
            throw new FinanceError(409, 'An allocated item cannot be voided. Reverse its payments first.', 'OBLIGATION_HAS_ALLOCATIONS');
        }
        const updated = await client.query(
            `UPDATE finance_obligations
             SET status = 'void', voided_at = NOW(), voided_by = $2, void_reason = $3
             WHERE id = $1
             RETURNING *`,
            [obligationId, actor.staffId, reason],
        );
        await audit(client, actor, {
            action: 'obligation_voided',
            entityType: 'obligation',
            entityId: obligationId,
            studentId: obligation.student_id,
            metadata: { reason, previous_status: obligation.status, amount: obligation.amount },
        });
        await client.query('COMMIT');
        return { obligation: updated.rows[0], duplicate: false };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function reversePayment(actor: FinanceActor, paymentIdInput: unknown, body: any) {
    requireFinanceManager(actor);
    const paymentId = requiredUuid(paymentIdInput, 'Payment');
    const reason = requiredText(body?.reason, 'Reversal reason', 500);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const current = await client.query(
            `SELECT * FROM finance_payments WHERE id = $1 FOR UPDATE`,
            [paymentId],
        );
        const payment = current.rows[0];
        if (!payment) throw new FinanceError(404, 'Payment not found.', 'PAYMENT_NOT_FOUND');
        if (payment.allocation_status === 'legacy_snapshot') {
            throw new FinanceError(409, 'This imported payment has no allocation history and cannot be reversed here.', 'LEGACY_PAYMENT_REVERSAL_FORBIDDEN');
        }
        if (payment.status === 'reversed') {
            await client.query('COMMIT');
            return { payment, duplicate: true };
        }

        const allocations = await client.query(
            `SELECT a.id, a.obligation_id, a.amount, o.student_id, o.paid_amount, o.balance, o.status
             FROM finance_payment_allocations a
             JOIN finance_obligations o ON o.id = a.obligation_id
             WHERE a.payment_id = $1
             ORDER BY a.created_at, a.id
             FOR UPDATE OF o`,
            [paymentId],
        );
        for (const allocation of allocations.rows) {
            const result = await client.query(
                `UPDATE finance_obligations
                 SET paid_amount = paid_amount - $2::numeric,
                     balance = balance + $2::numeric,
                     status = CASE
                         WHEN paid_amount - $2::numeric = 0 THEN 'open'
                         ELSE 'partial'
                     END
                 WHERE id = $1
                   AND status IN ('paid', 'partial')
                   AND paid_amount >= $2::numeric
                 RETURNING id`,
                [allocation.obligation_id, allocation.amount],
            );
            if (!result.rows[0]) {
                throw new FinanceError(409, 'Payment allocations no longer match the obligation balances.', 'PAYMENT_REVERSAL_CONFLICT');
            }
        }

        const reversed = await client.query(
            `UPDATE finance_payments
             SET status = 'reversed', reversed_at = NOW(), reversed_by = $2, reversal_reason = $3
             WHERE id = $1 AND status = 'posted'
             RETURNING *`,
            [paymentId, actor.staffId, reason],
        );
        if (!reversed.rows[0]) throw new FinanceError(409, 'Payment could not be reversed.', 'PAYMENT_REVERSAL_CONFLICT');
        await audit(client, actor, {
            action: 'payment_reversed',
            entityType: 'payment',
            entityId: paymentId,
            studentId: payment.student_id,
            metadata: {
                reason,
                amount: payment.amount,
                allocated_amount: payment.allocated_amount,
                unapplied_amount: payment.unapplied_amount,
                restored_obligation_ids: allocations.rows.map(row => row.obligation_id),
            },
        });
        await client.query('COMMIT');
        return { payment: reversed.rows[0], duplicate: false };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
export async function addOpeningBalances(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const asOfDate = date(body?.as_of_date, 'Opening balance date');
    const key = idempotencyKey(body?.idempotency_key);
    if (!Array.isArray(body?.entries) || body.entries.length < 1 || body.entries.length > 500) {
        throw new FinanceError(400, 'Opening balances require between 1 and 500 entries.', 'VALIDATION_ERROR');
    }

    const parsedEntries = body.entries.map((entry: any, index: number) => ({
        studentId: requiredText(entry?.student_id, `Student ${index + 1}`, 50),
        amount: money(entry?.amount, `Amount ${index + 1}`).value,
        serviceMonth: entry?.month ? month(entry.month) : `${asOfDate.slice(0, 7)}-01`,
        categoryId: optionalUuid(entry?.category_id, `Category ${index + 1}`),
        description: optionalText(entry?.description, `Description ${index + 1}`, 500) || 'Opening balance',
        entryKey: `${key}:${String(index + 1).padStart(3, '0')}`,
    }));

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('finance-opening:' || $1::text))`, [key]);
        const created: any[] = [];
        for (const entry of parsedEntries) {
            const duplicate = await client.query(
                `SELECT *,
                        student_id = $2
                        AND amount = $3::numeric
                        AND service_month = $4::date
                        AND due_date = $5::date
                        AND category_id IS NOT DISTINCT FROM $6::uuid
                        AND description = $7 AS same_request
                 FROM finance_obligations
                 WHERE idempotency_key = $1
                 FOR UPDATE`,
                [entry.entryKey, entry.studentId, entry.amount, entry.serviceMonth, asOfDate, entry.categoryId, entry.description],
            );
            if (duplicate.rows[0]) {
                if (!duplicate.rows[0].same_request) {
                    throw new FinanceError(409, 'This opening-balance key was already used for different details.', 'IDEMPOTENCY_CONFLICT');
                }
                continue;
            }
            await assertStudentExists(client, entry.studentId);
            if (entry.categoryId) {
                const category = await client.query(
                    `SELECT id FROM charge_categories WHERE id = $1 AND is_active = true LIMIT 1`,
                    [entry.categoryId],
                );
                if (!category.rows[0]) {
                    throw new FinanceError(409, 'Opening-balance category is inactive or unavailable.', 'CATEGORY_INACTIVE');
                }
            }
            const result = await client.query(
                `INSERT INTO finance_obligations
                    (student_id, obligation_type, category_id, description, amount, paid_amount, balance,
                     service_month, due_date, status, allocation_priority, legacy_source, idempotency_key, created_by,
                     requires_approval, approval_status, approved_at, approved_by)
                 VALUES ($1, 'opening_balance', $2, $3, $4, 0, $4, $5, $6, 'open', 10,
                         'opening_balance_import', $7, $8, false, 'approved', NOW(), $8)
                 ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
                 RETURNING *`,
                [
                    entry.studentId,
                    entry.categoryId,
                    entry.description,
                    entry.amount,
                    entry.serviceMonth,
                    asOfDate,
                    entry.entryKey,
                    actor.staffId,
                ],
            );
            if (result.rows[0]) {
                created.push(result.rows[0]);
                await audit(client, actor, {
                    action: 'opening_balance_created',
                    entityType: 'obligation',
                    entityId: result.rows[0].id,
                    studentId: entry.studentId,
                    metadata: { amount: entry.amount, as_of_date: asOfDate, batch_key: key },
                });
            }
        }
        await client.query('COMMIT');
        return { created_count: created.length, skipped_count: parsedEntries.length - created.length };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function grantPermissions(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const staffId = requiredUuid(body?.staff_id, 'Staff');
    const scope = studentScope(body?.student_scope || body?.scope_type);
    const limit = body?.amount_limit ?? body?.max_amount;
    const amountLimit = limit === undefined || limit === null || String(limit).trim() === ''
        ? null
        : money(limit, 'Amount limit').value;
    const validFrom = optionalDate(body?.valid_from, 'Valid from') || currentDate();
    const validUntil = optionalDate(body?.valid_until, 'Valid until');
    if (validFrom && validUntil && validFrom > validUntil) {
        throw new FinanceError(400, 'Valid until cannot be earlier than valid from.', 'VALIDATION_ERROR');
    }

    const requested = new Set<string>();
    if (body?.capability) requested.add(capability(body.capability));
    if (body?.can_add_charge) requested.add('charge:create');
    if (body?.can_collect_payment) requested.add('payment:collect');
    if (!requested.size) throw new FinanceError(400, 'At least one permission capability is required.', 'VALIDATION_ERROR');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const staff = await client.query('SELECT id, name, role FROM staff WHERE id = $1 AND is_active = true LIMIT 1', [staffId]);
        if (!staff.rows[0]) throw new FinanceError(404, 'Active staff member not found.', 'STAFF_NOT_FOUND');
        const created: any[] = [];
        for (const item of requested) {
            const existing = await client.query(
                `SELECT id FROM finance_staff_permissions
                 WHERE staff_id = $1 AND capability = $2
                   AND revoked_at IS NULL
                 FOR UPDATE`,
                [staffId, item],
            );
            if (existing.rows[0]) {
                throw new FinanceError(409, 'An active matching permission already exists.', 'PERMISSION_EXISTS');
            }
            const result = await client.query(
                `INSERT INTO finance_staff_permissions
                    (staff_id, capability, category_id, student_scope, amount_limit,
                     valid_from, valid_until, granted_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [staffId, item, null, scope, amountLimit, validFrom, validUntil, actor.staffId],
            );
            created.push(result.rows[0]);
            await audit(client, actor, {
                action: 'permission_granted',
                entityType: 'staff_permission',
                entityId: result.rows[0].id,
                metadata: { staff_id: staffId, capability: item, student_scope: scope, amount_limit: amountLimit },
            });
        }
        await client.query('COMMIT');
        return { permissions: created };
    } catch (error) {
        await client.query('ROLLBACK');
        if (pgErrorCode(error) === '23505') {
            throw new FinanceError(409, 'An active matching permission already exists.', 'PERMISSION_EXISTS');
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function revokePermission(actor: FinanceActor, permissionIdInput: unknown) {
    requireFinanceManager(actor);
    const permissionId = requiredUuid(permissionIdInput, 'Permission');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const current = await client.query(
            `SELECT * FROM finance_staff_permissions WHERE id = $1 FOR UPDATE`,
            [permissionId],
        );
        if (!current.rows[0]) throw new FinanceError(404, 'Permission not found.', 'PERMISSION_NOT_FOUND');
        if (current.rows[0].revoked_at) {
            await client.query('COMMIT');
            return { permission: current.rows[0], duplicate: true };
        }
        const updated = await client.query(
            `UPDATE finance_staff_permissions
             SET revoked_at = NOW()
             WHERE staff_id = $1 AND capability = $2 AND revoked_at IS NULL
             RETURNING *`,
            [current.rows[0].staff_id, current.rows[0].capability],
        );
        await audit(client, actor, {
            action: 'permission_revoked',
            entityType: 'staff_permission',
            entityId: permissionId,
            metadata: { previous: current.rows[0] },
        });
        await client.query('COMMIT');
        return { permission: updated.rows[0], duplicate: false };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function createFeeSchedule(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const name = requiredText(body?.label || body?.name, 'Schedule name', 160);
    const parsedAmount = money(body?.amount, 'Monthly fee');
    const effectiveFrom = date(body?.effective_from, 'Effective from');
    const effectiveUntil = optionalDate(body?.effective_until, 'Effective until');
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
        throw new FinanceError(400, 'Effective until cannot be earlier than effective from.', 'VALIDATION_ERROR');
    }
    if (effectiveFrom.slice(8, 10) !== '01' || (effectiveUntil && effectiveUntil.slice(8, 10) !== '01')) {
        throw new FinanceError(400, 'Fee schedules must start and end on the first day of a month.', 'VALIDATION_ERROR');
    }
    const rawScope = String(body?.scope_type || 'institution').trim().toLowerCase();
    const scopeType = rawScope === 'all' ? 'institution' : rawScope;
    if (!['institution', 'standard', 'division'].includes(scopeType)) {
        throw new FinanceError(400, 'Schedule scope must be institution, standard, or division.', 'VALIDATION_ERROR');
    }
    const scopeValue = optionalText(body?.scope_value, 'Scope value', 100);
    const standard = optionalText(body?.standard || (scopeType === 'standard' ? scopeValue : null), 'Standard', 100);
    const division = optionalText(body?.division || (scopeType === 'division' ? scopeValue : null), 'Division', 100);
    if (scopeType === 'standard' && !standard) throw new FinanceError(400, 'Standard is required for a standard fee schedule.', 'VALIDATION_ERROR');
    if (scopeType === 'division' && (!standard || !division)) {
        throw new FinanceError(400, 'Standard and division are required for a division fee schedule.', 'VALIDATION_ERROR');
    }
    const notes = optionalText(body?.notes, 'Notes', 1000);

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const latest = await client.query(
            `SELECT id, effective_from::text AS effective_from
             FROM finance_fee_schedules
             WHERE status = 'active'
               AND scope_type = $1
               AND standard IS NOT DISTINCT FROM $2::text
               AND division IS NOT DISTINCT FROM $3::text
             ORDER BY effective_from DESC, created_at DESC
             LIMIT 1
             FOR UPDATE`,
            [scopeType, standard, division],
        );
        if (latest.rows[0] && effectiveFrom <= latest.rows[0].effective_from) {
            throw new FinanceError(409, 'A fee revision must start after the latest version for this scope.', 'FEE_SCHEDULE_VERSION_ORDER');
        }
        const result = await client.query(
            `INSERT INTO finance_fee_schedules
                (name, scope_type, standard, division, amount, effective_from, effective_until,
                 status, notes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9)
             RETURNING *`,
            [name, scopeType, standard, division, parsedAmount.value, effectiveFrom, effectiveUntil, notes, actor.staffId],
        );
        await audit(client, actor, {
            action: 'fee_schedule_created',
            entityType: 'fee_schedule',
            entityId: result.rows[0].id,
            metadata: result.rows[0],
        });
        await client.query('COMMIT');
        return { schedule: result.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        if (pgErrorCode(error) === '23505') {
            throw new FinanceError(409, 'A fee schedule already starts on this month for the selected scope.', 'FEE_SCHEDULE_VERSION_EXISTS');
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function createStudentFeeAgreement(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const studentId = requiredText(body?.student_id, 'Student', 50);
    const parsedAmount = money(body?.amount, 'Agreement amount', true);
    const effectiveFrom = date(body?.effective_from, 'Effective from');
    const effectiveUntil = optionalDate(body?.effective_until, 'Effective until');
    if (effectiveUntil && effectiveUntil < effectiveFrom) {
        throw new FinanceError(400, 'Effective until cannot be earlier than effective from.', 'VALIDATION_ERROR');
    }
    const adjustmentType = String(body?.adjustment_type || 'fixed').trim().toLowerCase();
    if (!['fixed', 'discount_amount', 'discount_percent', 'surcharge', 'waiver'].includes(adjustmentType)) {
        throw new FinanceError(400, 'Unsupported agreement adjustment type.', 'VALIDATION_ERROR');
    }
    if (adjustmentType === 'discount_percent' && parsedAmount.paise > 10_000) {
        throw new FinanceError(400, 'Discount percent cannot exceed 100.', 'VALIDATION_ERROR');
    }
    if (adjustmentType === 'waiver' && parsedAmount.paise !== 0) {
        throw new FinanceError(400, 'A waiver amount must be zero.', 'VALIDATION_ERROR');
    }
    if (effectiveFrom.slice(8, 10) !== '01' || (effectiveUntil && effectiveUntil.slice(8, 10) !== '01')) {
        throw new FinanceError(400, 'Student fee agreements must start and end on the first day of a month.', 'VALIDATION_ERROR');
    }
    const reason = requiredText(body?.reason, 'Agreement reason', 500);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await assertStudentExists(client, studentId);
        const latest = await client.query(
            `SELECT id, effective_from::text AS effective_from
             FROM finance_student_fee_agreements
             WHERE student_id = $1 AND status = 'active'
             ORDER BY effective_from DESC, created_at DESC
             LIMIT 1 FOR UPDATE`,
            [studentId],
        );
        if (latest.rows[0] && effectiveFrom <= latest.rows[0].effective_from) {
            throw new FinanceError(409, 'A fee agreement revision must start after the student\'s latest version.', 'FEE_AGREEMENT_VERSION_ORDER');
        }
        const result = await client.query(
            `INSERT INTO finance_student_fee_agreements
                (student_id, adjustment_type, amount, effective_from, effective_until,
                 reason, status, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
             RETURNING *`,
            [studentId, adjustmentType, parsedAmount.value, effectiveFrom, effectiveUntil, reason, actor.staffId],
        );
        await audit(client, actor, {
            action: 'student_fee_agreement_created',
            entityType: 'student_fee_agreement',
            entityId: result.rows[0].id,
            studentId,
            metadata: result.rows[0],
        });
        await client.query('COMMIT');
        return { agreement: result.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        if (pgErrorCode(error) === '23505') {
            throw new FinanceError(409, 'A student fee agreement already starts on this month.', 'FEE_AGREEMENT_VERSION_EXISTS');
        }
        throw error;
    } finally {
        client.release();
    }
}

export async function workspace(actor: FinanceActor, query: any) {
    const serviceMonth = query?.month ? month(query.month) : currentMonth();
    const search = String(query?.search || '').trim().slice(0, 100);
    const status = String(query?.status || '').trim().toLowerCase();
    const limit = boundedLimit(query?.limit, 60, 100);
    const permissions = await listCurrentPermissions(actor);
    if (!isFinanceReadRole(actor.role) && permissions.length === 0) {
        throw new FinanceError(403, 'No finance access has been assigned to you.', 'FINANCE_FORBIDDEN');
    }

    const capabilities = await financeCapabilities(actor, permissions);
    const profile = buildFinanceAccessProfile(permissions, isFinanceReadRole(actor.role));
    const activeCategoryIds = hasChargePermission(permissions) ? await activeChargeCategoryIds() : [];
    const allCategoryIds = profile.allStudentChargeAccess ? activeCategoryIds : [];
    const assignedCategoryIds = profile.assignedStudentChargeAccess ? activeCategoryIds : [];
    const accessParams = [
        actor.staffId,
        serviceMonth,
        `%${search}%`,
        limit,
        allCategoryIds,
        assignedCategoryIds,
        profile.fullLedger,
        profile.fullLedgerAllStudents,
        currentDate(),
    ];
    const statusSql = status === 'overdue'
        ? `AND COALESCE(ob.overdue, 0) > 0`
        : status === 'pending'
            ? `AND COALESCE(ob.outstanding, 0) > 0`
            : '';

    const studentAccessCte = `
        SELECT s.adm_no, s.name, s.standard AS legacy_standard, s.photo_url, s.status,
               placement.standard, placement.division,
               ${assignedExpression('$1')} AS is_assigned
        FROM students s
        LEFT JOIN academic_years ay ON ay.is_current = true
        LEFT JOIN academic_student_placements placement
          ON placement.student_id = s.adm_no
         AND placement.academic_year_id = ay.id
         AND placement.status = 'active'
        LEFT JOIN student_year_snapshots snapshot
          ON snapshot.student_id = s.adm_no
         AND snapshot.academic_year_id = ay.id
         AND lower(COALESCE(snapshot.status, 'active')) = 'active'`;
    const obligationVisibility = `(
        ($7::boolean AND ($8::boolean OR sa.is_assigned))
        OR o.category_id = ANY($5::uuid[])
        OR (sa.is_assigned AND o.category_id = ANY($6::uuid[]))
    )`;
    const studentVisibility = `(
        ($7::boolean AND ($8::boolean OR sa.is_assigned))
        OR cardinality($5::uuid[]) > 0
        OR (sa.is_assigned AND cardinality($6::uuid[]) > 0)
    )`;
    const summaryAccessParams = [
        actor.staffId,
        serviceMonth,
        allCategoryIds,
        assignedCategoryIds,
        profile.fullLedger,
        profile.fullLedgerAllStudents,
        currentDate(),
    ];
    const summaryObligationVisibility = `(
        ($5::boolean AND ($6::boolean OR sa.is_assigned))
        OR o.category_id = ANY($3::uuid[])
        OR (sa.is_assigned AND o.category_id = ANY($4::uuid[]))
    )`;

    const studentsPromise = db.query(
        `WITH student_access AS (${studentAccessCte}),
         visible_obligations AS (
            SELECT o.*
            FROM finance_obligations o
            JOIN student_access sa ON sa.adm_no = o.student_id
            WHERE o.voided_at IS NULL
              AND o.approval_status = 'approved'
              AND ${obligationVisibility}
         ), balances AS (
            SELECT student_id,
                   SUM(balance) FILTER (WHERE balance > 0) AS outstanding,
                   SUM(balance) FILTER (WHERE balance > 0 AND due_date < $9::date) AS overdue,
                   SUM(balance) FILTER (WHERE balance > 0 AND service_month = $2::date) AS current_month_due
            FROM visible_obligations
            GROUP BY student_id
         ), payment_stats AS (
            SELECT p.student_id,
                   MAX(p.created_at) AS last_payment_at,
                   COALESCE(SUM(p.unapplied_amount) FILTER (
                       WHERE p.status = 'posted' AND p.allocation_status = 'strict'
                   ), 0) AS credit_balance
            FROM finance_payments p
            JOIN student_access sa ON sa.adm_no = p.student_id
            WHERE p.status = 'posted'
              AND $7::boolean AND ($8::boolean OR sa.is_assigned)
            GROUP BY p.student_id
         )
         SELECT sa.adm_no AS id, sa.adm_no AS student_id, sa.adm_no,
                sa.name, COALESCE(sa.standard, sa.legacy_standard) AS standard,
                sa.division, sa.photo_url,
                COALESCE(ob.outstanding, 0) AS total_due,
                COALESCE(ob.outstanding, 0) AS outstanding,
                COALESCE(ob.overdue, 0) AS overdue,
                COALESCE(ob.current_month_due, 0) AS current_month_due,
                COALESCE(ps.credit_balance, 0) AS credit_balance,
                CASE WHEN COALESCE(ob.overdue, 0) > 0 THEN 'overdue'
                     WHEN COALESCE(ob.outstanding, 0) > 0 THEN 'pending'
                     ELSE 'clear' END AS status,
                ps.last_payment_at
         FROM student_access sa
         LEFT JOIN balances ob ON ob.student_id = sa.adm_no
         LEFT JOIN payment_stats ps ON ps.student_id = sa.adm_no
         WHERE sa.status = 'active'
           AND ${studentVisibility}
           AND ($3 = '%%' OR sa.name ILIKE $3 OR sa.adm_no ILIKE $3)
           ${statusSql}
         ORDER BY COALESCE(ob.outstanding, 0) DESC, sa.name
         LIMIT $4`,
        accessParams,
    );

    const summaryPromise = db.query(
        `WITH student_access AS (${studentAccessCte}),
         visible_obligations AS (
            SELECT o.*
            FROM finance_obligations o
            JOIN student_access sa ON sa.adm_no = o.student_id
             WHERE o.voided_at IS NULL
               AND o.approval_status = 'approved'
               AND ${summaryObligationVisibility}
         ), visible_credits AS (
             SELECT p.unapplied_amount
             FROM finance_payments p
             JOIN student_access sa ON sa.adm_no = p.student_id
             WHERE p.status = 'posted'
               AND p.allocation_status = 'strict'
               AND $5::boolean
               AND ($6::boolean OR sa.is_assigned)
         ), visible_receipts AS (
             SELECT p.id,
                    CASE
                      WHEN $5::boolean AND ($6::boolean OR sa.is_assigned) THEN p.amount
                      ELSE COALESCE(SUM(a.amount) FILTER (
                          WHERE o.category_id = ANY($3::uuid[])
                             OR (sa.is_assigned AND o.category_id = ANY($4::uuid[]))
                      ), 0)
                    END AS amount
             FROM finance_payments p
             JOIN student_access sa ON sa.adm_no = p.student_id
             LEFT JOIN finance_payment_allocations a ON a.payment_id = p.id
             LEFT JOIN finance_obligations o ON o.id = a.obligation_id
             WHERE p.status = 'posted'
               AND p.date >= $2::date
               AND p.date < ($2::date + INTERVAL '1 month')
             GROUP BY p.id, p.amount, sa.is_assigned
         )
         SELECT COALESCE(SUM(amount) FILTER (WHERE service_month = $2::date), 0) AS expected,
                COALESCE((SELECT SUM(amount) FROM visible_receipts WHERE amount > 0), 0) AS collected,
                COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS outstanding,
                COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS pending,
                COALESCE(SUM(balance) FILTER (WHERE balance > 0 AND due_date < $7::date), 0) AS overdue,
                COUNT(DISTINCT student_id) FILTER (WHERE balance > 0) AS students_due,
                COALESCE((SELECT SUM(unapplied_amount) FROM visible_credits), 0) AS credits
         FROM visible_obligations`,
        summaryAccessParams,
    );

    const categoriesPromise = isFinanceManager(actor.role)
        ? db.query(`SELECT * FROM charge_categories WHERE is_active = true ORDER BY name`)
        : capabilities.can_add_charge
            ? db.query(`SELECT * FROM charge_categories WHERE is_active = true ORDER BY name`)
            : Promise.resolve({ rows: [] });
    const accountsPromise = capabilities.can_collect_payment || isFinanceReadRole(actor.role)
        ? db.query(`SELECT id, account_holder, account_type, details, is_active,
                                 account_holder || ' (' || upper(account_type) || ')' AS account_name
                          FROM payment_accounts WHERE is_active = true ORDER BY account_holder`)
        : Promise.resolve({ rows: [] });

    const recentPromise = db.query(
        `WITH recent AS (
            SELECT p.id, 'payment'::text AS type, p.student_id, s.name AS student_name,
                   'Payment received'::text AS description, NULL::text AS category_name,
                   p.amount, p.date, p.created_at, st.name AS recorded_by_name
            FROM finance_payments p
            JOIN students s ON s.adm_no = p.student_id
            LEFT JOIN academic_years ay ON ay.is_current = true
            LEFT JOIN student_year_snapshots snapshot
              ON snapshot.student_id = s.adm_no
             AND snapshot.academic_year_id = ay.id
             AND lower(COALESCE(snapshot.status, 'active')) = 'active'
            LEFT JOIN staff st ON st.id = p.recorded_by
            WHERE p.status = 'posted'
              AND $2::boolean
              AND ($3::boolean OR ${assignedExpression('$1')})

            UNION ALL

            SELECT o.id, 'charge'::text AS type, o.student_id, s.name AS student_name,
                   o.description, c.name AS category_name, o.amount, o.due_date AS date,
                   o.created_at, st.name AS recorded_by_name
            FROM finance_obligations o
            JOIN students s ON s.adm_no = o.student_id
            LEFT JOIN academic_years ay ON ay.is_current = true
            LEFT JOIN student_year_snapshots snapshot
              ON snapshot.student_id = s.adm_no
             AND snapshot.academic_year_id = ay.id
             AND lower(COALESCE(snapshot.status, 'active')) = 'active'
            LEFT JOIN charge_categories c ON c.id = o.category_id
            LEFT JOIN staff st ON st.id = o.created_by
            WHERE o.voided_at IS NULL
              AND (
                  ($2::boolean AND ($3::boolean OR ${assignedExpression('$1')}))
                  OR o.category_id = ANY($4::uuid[])
                  OR (${assignedExpression('$1')} AND o.category_id = ANY($5::uuid[]))
              )
        )
        SELECT * FROM recent ORDER BY created_at DESC LIMIT 20`,
        [
            actor.staffId,
            profile.fullLedger,
            profile.fullLedgerAllStudents,
            allCategoryIds,
            assignedCategoryIds,
        ],
    );
    let setup: any = undefined;
    if (isFinanceManager(actor.role)) {
        const [schedules, staff, permissionRows, allCategories, allAccounts] = await Promise.all([
            db.query(`SELECT id, name AS label, name, amount, effective_from, effective_until,
                             scope_type, COALESCE(division, standard) AS scope_value, standard, division,
                             status, (status = 'active') AS is_active
                      FROM finance_fee_schedules ORDER BY effective_from DESC, created_at DESC`),
            db.query(`SELECT id, name, role, photo_url FROM staff WHERE is_active = true ORDER BY name`),
            db.query(`SELECT DISTINCT ON (p.staff_id, p.capability)
                             p.*, s.name AS staff_name, c.name AS category_name,
                             (p.capability = 'charge:create') AS can_add_charge,
                             (p.capability = 'payment:collect') AS can_collect_payment,
                             p.amount_limit AS max_amount,
                             (p.revoked_at IS NULL AND p.valid_from <= CURRENT_DATE
                               AND (p.valid_until IS NULL OR p.valid_until >= CURRENT_DATE)) AS is_active
                      FROM finance_staff_permissions p
                      JOIN staff s ON s.id = p.staff_id
                      LEFT JOIN charge_categories c ON c.id = p.category_id
                      WHERE p.revoked_at IS NULL
                      ORDER BY p.staff_id, p.capability,
                               CASE WHEN p.student_scope = 'all' THEN 0 ELSE 1 END,
                               p.created_at DESC`),
            db.query(`SELECT * FROM charge_categories ORDER BY name`),
            db.query(`SELECT id, account_holder, account_type, details, is_active,
                             account_holder || ' (' || upper(account_type) || ')' AS account_name
                      FROM payment_accounts ORDER BY account_holder`),
        ]);
        setup = {
            schedules: schedules.rows,
            categories: allCategories.rows,
            accounts: allAccounts.rows,
            staff: staff.rows,
            permissions: permissionRows.rows,
        };
    }

    const [studentsResult, summaryResult, categoriesResult, accountsResult, recentResult] = await Promise.all([
        studentsPromise,
        summaryPromise,
        categoriesPromise,
        accountsPromise,
        recentPromise,
    ]);
    const summary = summaryResult.rows[0] || {};
    return {
        success: true,
        mode: isFinanceReadRole(actor.role) ? 'admin' : 'staff',
        capabilities,
        summary,
        students: studentsResult.rows,
        recent_activity: recentResult.rows,
        setup: setup || {
            categories: categoriesResult.rows,
            accounts: accountsResult.rows,
        },
    };
}
export async function listCategories(actor: FinanceActor) {
    const permissions = await listCurrentPermissions(actor);
    if (isFinanceReadRole(actor.role)) return (await db.query('SELECT * FROM charge_categories ORDER BY name')).rows;
    if (!hasChargePermission(permissions)) return [];
    return (await db.query('SELECT * FROM charge_categories ORDER BY name')).rows;
}

export async function createCategory(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const name = requiredText(body?.name, 'Category name', 120);
    const description = optionalText(body?.description, 'Description', 500);
    const priority = Number(body?.allocation_priority ?? 100);
    if (!Number.isInteger(priority) || priority < 1 || priority > 10_000) {
        throw new FinanceError(400, 'Allocation priority must be a whole number between 1 and 10000.', 'VALIDATION_ERROR');
    }
    if (body?.requires_approval === true) {
        throw new FinanceError(400, 'Approval-required categories are not available until an approval queue is configured.', 'CATEGORY_APPROVAL_UNAVAILABLE');
    }
    const requiresApproval = false;
    const allowStaffEntry = body?.allow_staff_entry === true;
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO charge_categories
                (name, code, description, allocation_priority, requires_approval, allow_staff_entry)
             VALUES (
                $1,
                lower(regexp_replace(trim($1), '[^a-zA-Z0-9]+', '_', 'g'))
                    || '_' || left(gen_random_uuid()::text, 8),
                $2, $3, $4, $5
             )
             RETURNING *`,
            [name, description, priority, requiresApproval, allowStaffEntry],
        );
        await audit(client, actor, {
            action: 'charge_category_created',
            entityType: 'charge_category',
            entityId: result.rows[0].id,
            metadata: result.rows[0],
        });
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function toggleCategory(actor: FinanceActor, idInput: unknown, isActive: unknown) {
    requireFinanceManager(actor);
    const id = requiredUuid(idInput, 'Category');
    if (typeof isActive !== 'boolean') throw new FinanceError(400, 'is_active must be true or false.', 'VALIDATION_ERROR');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query('UPDATE charge_categories SET is_active = $1 WHERE id = $2 RETURNING *', [isActive, id]);
        if (!result.rows[0]) throw new FinanceError(404, 'Category not found.', 'CATEGORY_NOT_FOUND');
        await audit(client, actor, {
            action: 'charge_category_toggled',
            entityType: 'charge_category',
            entityId: id,
            metadata: { is_active: isActive },
        });
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
export async function listAccounts(actor: FinanceActor) {
    const canCollect = await findPermission(actor, 'payment:collect');
    if (!isFinanceReadRole(actor.role) && !canCollect) throw new FinanceError(403, 'Payment account access is not authorized.', 'FINANCE_FORBIDDEN');
    return (await db.query(`SELECT *, account_holder || ' (' || upper(account_type) || ')' AS account_name FROM payment_accounts ORDER BY account_holder`)).rows;
}

export async function createAccount(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const holder = requiredText(body?.account_holder, 'Account holder', 160);
    const type = requiredText(body?.account_type, 'Account type', 20).toLowerCase();
    if (!['upi', 'bank'].includes(type)) throw new FinanceError(400, 'Account type must be UPI or bank.', 'VALIDATION_ERROR');
    const details = optionalText(body?.details, 'Account details', 500);
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `INSERT INTO payment_accounts (account_holder, account_type, details) VALUES ($1, $2, $3) RETURNING *`,
            [holder, type, details],
        );
        await audit(client, actor, {
            action: 'payment_account_created',
            entityType: 'payment_account',
            entityId: result.rows[0].id,
            metadata: { account_holder: holder, account_type: type },
        });
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function toggleAccount(actor: FinanceActor, idInput: unknown, isActive: unknown) {
    requireFinanceManager(actor);
    const id = requiredUuid(idInput, 'Payment account');
    if (typeof isActive !== 'boolean') throw new FinanceError(400, 'is_active must be true or false.', 'VALIDATION_ERROR');
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const result = await client.query('UPDATE payment_accounts SET is_active = $1 WHERE id = $2 RETURNING *', [isActive, id]);
        if (!result.rows[0]) throw new FinanceError(404, 'Payment account not found.', 'PAYMENT_ACCOUNT_NOT_FOUND');
        await audit(client, actor, {
            action: 'payment_account_toggled',
            entityType: 'payment_account',
            entityId: id,
            metadata: { is_active: isActive },
        });
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
export async function activeStudents(actor: FinanceActor) {
    const permissions = await listCurrentPermissions(actor);
    if (!isFinanceReadRole(actor.role) && !permissions.length) {
        throw new FinanceError(403, 'No finance access has been assigned to you.', 'FINANCE_FORBIDDEN');
    }
    const profile = buildFinanceAccessProfile(permissions, isFinanceReadRole(actor.role));
    const canAccessAll = profile.fullLedgerAllStudents || profile.allStudentChargeAccess;

    return (await db.query(
        `SELECT s.adm_no, s.adm_no AS id, s.adm_no AS admission_number, s.name,
                COALESCE(p.standard, s.standard) AS standard, p.division, s.photo_url
         FROM students s
         LEFT JOIN academic_years ay ON ay.is_current = true
         LEFT JOIN academic_student_placements p
           ON p.student_id = s.adm_no AND p.academic_year_id = ay.id AND p.status = 'active'
         LEFT JOIN student_year_snapshots snapshot
           ON snapshot.student_id = s.adm_no AND snapshot.academic_year_id = ay.id
          AND lower(COALESCE(snapshot.status, 'active')) = 'active'
         WHERE s.status = 'active'
           AND ($2::boolean OR ${assignedExpression('$1')})
         ORDER BY s.name`,
        [actor.staffId, canAccessAll],
    )).rows;
}
export async function financeDashboard(actor: FinanceActor) {
    const data = await workspace(actor, { month: currentDate().slice(0, 7), limit: 1 });
    return data.summary;
}

export async function currentMonthlyFees(actor: FinanceActor) {
    const permission = await requireFinanceCapability(actor, 'ledger:view');
    const profile = buildLedgerViewAccessProfile([permission], isFinanceReadRole(actor.role));
    return (await db.query(
        `SELECT o.id, o.student_id, o.service_month AS month, o.amount AS base_fee,
                0::numeric AS discount, o.amount AS final_fee, o.paid_amount, o.balance,
                o.status, s.name AS student_name
         FROM finance_obligations o
         JOIN students s ON s.adm_no = o.student_id
         LEFT JOIN academic_years ay ON ay.is_current = true
         LEFT JOIN student_year_snapshots snapshot
           ON snapshot.student_id = s.adm_no
          AND snapshot.academic_year_id = ay.id
          AND lower(COALESCE(snapshot.status, 'active')) = 'active'
         WHERE o.obligation_type = 'monthly_fee'
           AND o.service_month = $1
           AND o.voided_at IS NULL
           AND ($3::boolean OR ${assignedExpression('$2')})
         ORDER BY s.name`,
        [currentMonth(), actor.staffId, profile.fullLedgerAllStudents],
    )).rows;
}

export function requestActor(req: Request) {
    const actor = (req as Request & { financeActor?: FinanceActor }).financeActor;
    if (!actor) throw new FinanceError(500, 'Finance actor context is missing.', 'FINANCE_CONTEXT_MISSING');
    return actor;
}

