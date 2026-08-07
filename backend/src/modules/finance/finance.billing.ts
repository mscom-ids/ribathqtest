import { db } from '../../config/db';
import { FinanceActor, FinanceError } from './finance.types';
import { requireFinanceManager } from './finance.auth';
import { date, idempotencyKey, month } from './finance.validation';
import { allocateOldestFirst, moneyToPaise, paiseToMoney } from '../../utils/finance-money';

type Queryable = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

const BILLING_CANDIDATES_SQL = `
    SELECT s.adm_no AS student_id,
           s.name AS student_name,
           schedule.id AS fee_schedule_id,
           agreement.id AS fee_agreement_id,
           schedule.name AS schedule_name,
           schedule.amount AS schedule_amount,
           agreement.adjustment_type,
           agreement.amount AS agreement_amount,
           CASE
             WHEN agreement.adjustment_type = 'fixed' THEN agreement.amount
             WHEN agreement.adjustment_type = 'discount_amount' THEN GREATEST(schedule.amount - agreement.amount, 0)
             WHEN agreement.adjustment_type = 'discount_percent' THEN
                  GREATEST(ROUND(schedule.amount * (1 - agreement.amount / 100), 2), 0)
             WHEN agreement.adjustment_type = 'surcharge' THEN schedule.amount + agreement.amount
             WHEN agreement.adjustment_type = 'waiver' THEN 0
             ELSE schedule.amount
           END AS final_amount,
           (agreement.id IS NOT NULL) AS has_exception,
           existing.id AS existing_obligation_id
    FROM students s
    LEFT JOIN academic_years ay ON ay.is_current = true
    LEFT JOIN academic_student_placements placement
      ON placement.student_id = s.adm_no
     AND placement.academic_year_id = ay.id
     AND placement.status = 'active'
    LEFT JOIN LATERAL (
        SELECT fs.*
        FROM finance_fee_schedules fs
        WHERE fs.status = 'active'
          AND fs.effective_from <= $1::date
          AND (fs.effective_until IS NULL OR fs.effective_until >= $1::date)
          AND (
            fs.scope_type = 'institution'
            OR (fs.scope_type = 'standard' AND fs.standard = COALESCE(placement.standard, s.standard))
            OR (fs.scope_type = 'division'
                AND fs.standard = COALESCE(placement.standard, s.standard)
                AND fs.division = placement.division)
          )
        ORDER BY CASE fs.scope_type WHEN 'division' THEN 1 WHEN 'standard' THEN 2 ELSE 3 END,
                 fs.effective_from DESC, fs.created_at DESC, fs.id
        LIMIT 1
    ) schedule ON true
    LEFT JOIN LATERAL (
        SELECT a.*
        FROM finance_student_fee_agreements a
        WHERE a.student_id = s.adm_no
          AND a.status = 'active'
          AND a.effective_from <= $1::date
          AND (a.effective_until IS NULL OR a.effective_until >= $1::date)
        ORDER BY a.effective_from DESC, a.created_at DESC, a.id
        LIMIT 1
    ) agreement ON true
    LEFT JOIN finance_obligations existing
      ON existing.student_id = s.adm_no
     AND existing.service_month = $1::date
     AND existing.obligation_type = 'monthly_fee'
    WHERE s.status = 'active'
      AND (s.admission_date IS NULL OR s.admission_date < ($1::date + INTERVAL '1 month'))
      AND (s.exit_date IS NULL OR s.exit_date >= $1::date)
`;

async function billingAudit(
    client: Queryable,
    actor: FinanceActor,
    action: string,
    entityId: string,
    metadata: unknown,
) {
    await client.query(
        `INSERT INTO finance_audit_events
            (actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'billing_run', $3, $4::jsonb)`,
        [actor.staffId, action, entityId, JSON.stringify({ ...(metadata as object || {}), ip_address: actor.ipAddress })],
    );
}

async function applyUnappliedCredits(client: Queryable, runId: string) {
    const students = await client.query(
        `SELECT DISTINCT student_id
         FROM finance_obligations
         WHERE billing_run_id = $1 AND balance > 0
         ORDER BY student_id`,
        [runId],
    );
    let appliedPaise = 0;
    let allocationCount = 0;

    for (const student of students.rows) {
        const payments = await client.query(
            `SELECT id, unapplied_amount
             FROM finance_payments
             WHERE student_id = $1
               AND status = 'posted'
               AND allocation_status = 'strict'
               AND unapplied_amount > 0
             ORDER BY date, created_at, id
             FOR UPDATE`,
            [student.student_id],
        );
        const obligations = await client.query(
            `SELECT id, balance, due_date, allocation_priority
             FROM finance_obligations
             WHERE student_id = $1
               AND billing_run_id = $2
               AND voided_at IS NULL
               AND approval_status = 'approved'
               AND status IN ('open', 'partial')
               AND balance > 0
             ORDER BY due_date, allocation_priority, created_at, id
             FOR UPDATE`,
            [student.student_id, runId],
        );

        for (const payment of payments.rows) {
            const availablePaise = moneyToPaise(payment.unapplied_amount, {
                allowZero: true,
                field: 'Unapplied credit',
            });
            if (availablePaise === 0) continue;
            const allocation = allocateOldestFirst(obligations.rows, availablePaise);
            if (allocation.allocatedPaise === 0) break;

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
                         status = CASE WHEN balance - $2::numeric = 0 THEN 'paid' ELSE 'partial' END
                     WHERE id = $1`,
                    [item.obligation_id, item.amount],
                );
                const target = obligations.rows.find(row => row.id === item.obligation_id);
                if (target) {
                    const remaining = moneyToPaise(target.balance, { allowZero: true, field: 'Balance' }) - item.amountPaise;
                    target.balance = paiseToMoney(remaining);
                }
                appliedPaise += item.amountPaise;
                allocationCount += 1;
            }

            await client.query(
                `UPDATE finance_payments
                 SET allocated_amount = allocated_amount + $2::numeric,
                     unapplied_amount = unapplied_amount - $2::numeric
                 WHERE id = $1
                   AND status = 'posted'
                   AND allocation_status = 'strict'
                   AND unapplied_amount >= $2::numeric`,
                [payment.id, allocation.allocated],
            );
        }
    }

    return {
        applied_amount: paiseToMoney(appliedPaise),
        allocation_count: allocationCount,
    };
}

function institutionMonth() {
    const timeZone = process.env.INSTITUTION_TIMEZONE || 'Asia/Kolkata';
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}`;
}
export async function previewMonthlyFees(actor: FinanceActor, monthInput: unknown) {
    requireFinanceManager(actor);
    const serviceMonth = month(monthInput);
    const result = await db.query(
        `WITH candidates AS (${BILLING_CANDIDATES_SQL})
         SELECT COUNT(*) FILTER (WHERE fee_schedule_id IS NOT NULL AND existing_obligation_id IS NULL)::int AS student_count,
                COALESCE(SUM(final_amount) FILTER (WHERE fee_schedule_id IS NOT NULL AND existing_obligation_id IS NULL), 0) AS total_amount,
                COUNT(*) FILTER (WHERE existing_obligation_id IS NOT NULL)::int AS existing_count,
                COUNT(*) FILTER (WHERE fee_schedule_id IS NOT NULL AND has_exception AND existing_obligation_id IS NULL)::int AS exception_count,
                COUNT(*) FILTER (WHERE fee_schedule_id IS NULL)::int AS unconfigured_count
         FROM candidates`,
        [serviceMonth],
    );
    return { service_month: serviceMonth, ...(result.rows[0] || {}) };
}

export async function publishMonthlyFees(actor: FinanceActor, body: any) {
    requireFinanceManager(actor);
    const serviceMonth = month(body?.month);
    const key = idempotencyKey(body?.idempotency_key);
    const dueDate = body?.due_date ? date(body.due_date, 'Due date') : serviceMonth;
    if (dueDate < serviceMonth || dueDate.slice(0, 7) !== serviceMonth.slice(0, 7)) {
        throw new FinanceError(400, 'Monthly fee due date must be within the billing month.', 'VALIDATION_ERROR');
    }

    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('finance-billing:' || $1::text))`, [serviceMonth]);

        const duplicate = await client.query(
            `SELECT * FROM finance_billing_runs WHERE idempotency_key = $1 LIMIT 1`,
            [key],
        );
        if (duplicate.rows[0]) {
            if (String(duplicate.rows[0].service_month).slice(0, 10) !== serviceMonth) {
                throw new FinanceError(409, 'This idempotency key was already used for another billing month.', 'IDEMPOTENCY_CONFLICT');
            }
            await client.query('COMMIT');
            return { run: duplicate.rows[0], duplicate: true };
        }

        const alreadyPublished = await client.query(
            `SELECT id, status, student_count, total_amount, service_month
             FROM finance_billing_runs
             WHERE service_month = $1 AND status = 'published'
             ORDER BY published_at DESC LIMIT 1`,
            [serviceMonth],
        );
        if (alreadyPublished.rows[0]) {
            throw new FinanceError(409, 'Monthly fees have already been published for this month.', 'BILLING_MONTH_ALREADY_PUBLISHED');
        }

        const unconfigured = await client.query(
            `WITH candidates AS (${BILLING_CANDIDATES_SQL})
             SELECT COUNT(*)::int AS count,
                    COALESCE(array_agg(student_id ORDER BY student_id) FILTER (WHERE student_id IS NOT NULL), '{}') AS student_ids
             FROM candidates
             WHERE fee_schedule_id IS NULL`,
            [serviceMonth],
        );
        if (Number(unconfigured.rows[0]?.count || 0) > 0) {
            throw new FinanceError(
                409,
                'Monthly fees cannot be published until every eligible student has a fee schedule.',
                'BILLING_STUDENTS_UNCONFIGURED',
                {
                    count: Number(unconfigured.rows[0].count),
                    student_ids: (unconfigured.rows[0].student_ids || []).slice(0, 50),
                },
            );
        }
        const runResult = await client.query(
            `INSERT INTO finance_billing_runs
                (service_month, status, student_count, total_amount, idempotency_key, created_by)
             VALUES ($1, 'publishing', 0, 0, $2, $3)
             RETURNING *`,
            [serviceMonth, key, actor.staffId],
        );
        const run = runResult.rows[0];

        await client.query(
            `WITH candidates AS (${BILLING_CANDIDATES_SQL})
             INSERT INTO finance_obligations
                (student_id, obligation_type, description, amount, paid_amount, balance,
                 service_month, due_date, status, allocation_priority,
                 fee_schedule_id, fee_agreement_id, billing_run_id, idempotency_key,
                 created_by, requires_approval, approval_status, approved_by, approved_at)
             SELECT c.student_id,
                    'monthly_fee',
                    'Monthly fee - ' || to_char($1::date, 'FMMonth YYYY'),
                    c.final_amount,
                    0,
                    c.final_amount,
                    $1::date,
                    $2::date,
                    CASE WHEN c.final_amount = 0 THEN 'paid' ELSE 'open' END,
                    10,
                    c.fee_schedule_id,
                    c.fee_agreement_id,
                    $3,
                    'monthly-fee:' || to_char($1::date, 'YYYY-MM') || ':' || c.student_id,
                    $4,
                    false,
                    'approved',
                    $4,
                    NOW()
             FROM candidates c
             WHERE c.fee_schedule_id IS NOT NULL
               AND c.existing_obligation_id IS NULL
             ON CONFLICT (student_id, service_month)
                 WHERE obligation_type = 'monthly_fee'
             DO NOTHING
             RETURNING id, student_id, amount`,
            [serviceMonth, dueDate, run.id, actor.staffId],
        );
        const totals = await client.query(
            `SELECT COUNT(*)::int AS student_count, COALESCE(SUM(amount), 0) AS total_amount
             FROM finance_obligations
             WHERE billing_run_id = $1`,
            [run.id],
        );
        const studentCount = Number(totals.rows[0]?.student_count || 0);
        const totalAmount = String(totals.rows[0]?.total_amount || '0.00');
        const creditsApplied = await applyUnappliedCredits(client, run.id);
        const published = await client.query(
            `UPDATE finance_billing_runs
             SET status = 'published', student_count = $2, total_amount = $3, published_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [run.id, studentCount, totalAmount],
        );
        await billingAudit(client, actor, 'monthly_fees_published', run.id, {
            service_month: serviceMonth,
            student_count: studentCount,
            total_amount: totalAmount,
            credits_applied: creditsApplied.applied_amount,
            credit_allocation_count: creditsApplied.allocation_count,
        });
        await client.query('COMMIT');
        return { run: published.rows[0], duplicate: false };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function generateCurrentMonthlyFees(actor: FinanceActor, body: any = {}) {
    const monthValue = String(body?.month || institutionMonth());
    const normalizedKey = body?.idempotency_key || `monthly-fees:${monthValue}`;
    return publishMonthlyFees(actor, { ...body, month: monthValue, idempotency_key: normalizedKey });
}

