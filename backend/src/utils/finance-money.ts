export type AllocationCandidate = {
    id: string;
    balance: string | number;
    due_date?: string | null;
    allocation_priority?: number | null;
};

export type AllocationResult = {
    allocations: Array<{ obligation_id: string; amount: string; amountPaise: number }>;
    allocated: string;
    unapplied: string;
    allocatedPaise: number;
    unappliedPaise: number;
};

const MONEY_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function moneyToPaise(input: unknown, options: { allowZero?: boolean; field?: string } = {}): number {
    const field = options.field || 'Amount';
    const raw = typeof input === 'number'
        ? (Number.isFinite(input) ? input.toFixed(2).replace(/\.00$/, '') : '')
        : String(input ?? '').trim();

    const match = MONEY_PATTERN.exec(raw);
    if (!match) throw new Error(`${field} must be a valid amount with no more than 2 decimal places.`);

    const whole = BigInt(match[1]);
    const fraction = BigInt((match[2] || '').padEnd(2, '0'));
    const paise = (whole * 100n) + fraction;
    if ((!options.allowZero && paise <= 0n) || (options.allowZero && paise < 0n)) {
        throw new Error(`${field} must be ${options.allowZero ? 'zero or greater' : 'greater than zero'}.`);
    }
    if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} is too large.`);
    return Number(paise);
}

export function paiseToMoney(paise: number): string {
    if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid paise value.');
    const whole = Math.floor(paise / 100);
    const fraction = String(paise % 100).padStart(2, '0');
    return `${whole}.${fraction}`;
}

export function normalizeMonth(input: unknown): string {
    const value = String(input || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
        throw new Error('Month must use YYYY-MM format.');
    }
    return `${value}-01`;
}

export function normalizeDate(input: unknown, field = 'Date'): string {
    const value = String(input || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) {
        throw new Error(`${field} must use YYYY-MM-DD format.`);
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error(`${field} is invalid.`);
    }
    return value;
}

function candidateTimestamp(candidate: AllocationCandidate): number {
    const parsed = Date.parse(candidate.due_date || '9999-12-31');
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function allocateOldestFirst(candidates: AllocationCandidate[], paymentPaise: number): AllocationResult {
    if (!Number.isSafeInteger(paymentPaise) || paymentPaise <= 0) {
        throw new Error('Payment must be greater than zero.');
    }

    let remaining = paymentPaise;
    const allocations: AllocationResult['allocations'] = [];
    const ordered = [...candidates]
        .map(candidate => ({
            ...candidate,
            balancePaise: moneyToPaise(candidate.balance, { allowZero: true, field: 'Balance' }),
        }))
        .filter(candidate => candidate.balancePaise > 0)
        .sort((left, right) => {
            const dateDiff = candidateTimestamp(left) - candidateTimestamp(right);
            if (dateDiff !== 0) return dateDiff;
            const priorityDiff = Number(left.allocation_priority ?? 100) - Number(right.allocation_priority ?? 100);
            if (priorityDiff !== 0) return priorityDiff;
            return left.id.localeCompare(right.id);
        });

    for (const candidate of ordered) {
        if (remaining <= 0) break;
        const amountPaise = Math.min(remaining, candidate.balancePaise);
        allocations.push({
            obligation_id: candidate.id,
            amount: paiseToMoney(amountPaise),
            amountPaise,
        });
        remaining -= amountPaise;
    }

    const allocatedPaise = paymentPaise - remaining;
    return {
        allocations,
        allocated: paiseToMoney(allocatedPaise),
        unapplied: paiseToMoney(remaining),
        allocatedPaise,
        unappliedPaise: remaining,
    };
}

export function normalizeIdempotencyKey(input: unknown): string {
    const value = String(input || '').trim();
    if (!/^[A-Za-z0-9:_-]{8,120}$/.test(value)) {
        throw new Error('A valid idempotency key is required.');
    }
    return value;
}
