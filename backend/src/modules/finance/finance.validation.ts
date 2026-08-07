import { normalizeDate, normalizeIdempotencyKey, normalizeMonth, moneyToPaise, paiseToMoney } from '../../utils/finance-money';
import { FINANCE_CAPABILITIES, FinanceCapability, FinanceError, FinanceStudentScope } from './finance.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requiredText(input: unknown, field: string, maxLength = 500) {
    const value = String(input ?? '').trim();
    if (!value) throw new FinanceError(400, `${field} is required.`, 'VALIDATION_ERROR');
    if (value.length > maxLength) throw new FinanceError(400, `${field} is too long.`, 'VALIDATION_ERROR');
    return value;
}

export function optionalText(input: unknown, field: string, maxLength = 1000) {
    if (input === undefined || input === null || String(input).trim() === '') return null;
    return requiredText(input, field, maxLength);
}

export function requiredUuid(input: unknown, field: string) {
    const value = requiredText(input, field, 64);
    if (!UUID_PATTERN.test(value)) throw new FinanceError(400, `${field} is invalid.`, 'VALIDATION_ERROR');
    return value;
}

export function optionalUuid(input: unknown, field: string) {
    if (input === undefined || input === null || String(input).trim() === '') return null;
    return requiredUuid(input, field);
}

export function money(input: unknown, field = 'Amount', allowZero = false) {
    try {
        const paise = moneyToPaise(input, { allowZero, field });
        return { paise, value: paiseToMoney(paise) };
    } catch (error) {
        throw new FinanceError(400, error instanceof Error ? error.message : `${field} is invalid.`, 'VALIDATION_ERROR');
    }
}

export function date(input: unknown, field = 'Date') {
    try {
        return normalizeDate(input, field);
    } catch (error) {
        throw new FinanceError(400, error instanceof Error ? error.message : `${field} is invalid.`, 'VALIDATION_ERROR');
    }
}

export function optionalDate(input: unknown, field = 'Date') {
    if (input === undefined || input === null || String(input).trim() === '') return null;
    return date(input, field);
}

export function month(input: unknown) {
    try {
        return normalizeMonth(input);
    } catch (error) {
        throw new FinanceError(400, error instanceof Error ? error.message : 'Month is invalid.', 'VALIDATION_ERROR');
    }
}

export function idempotencyKey(input: unknown) {
    try {
        return normalizeIdempotencyKey(input);
    } catch (error) {
        throw new FinanceError(400, error instanceof Error ? error.message : 'A valid idempotency key is required.', 'VALIDATION_ERROR');
    }
}

export function paymentMethod(input: unknown) {
    const value = requiredText(input, 'Payment method', 30).toLowerCase();
    if (!['cash', 'upi', 'bank'].includes(value)) {
        throw new FinanceError(400, 'Payment method must be cash, UPI, or bank.', 'VALIDATION_ERROR');
    }
    return value;
}

export function capability(input: unknown): FinanceCapability {
    const value = requiredText(input, 'Capability', 80) as FinanceCapability;
    if (!FINANCE_CAPABILITIES.includes(value)) {
        throw new FinanceError(400, 'Unsupported finance capability.', 'VALIDATION_ERROR');
    }
    return value;
}

export function studentScope(input: unknown): FinanceStudentScope {
    const value = String(input || 'assigned').trim().toLowerCase();
    if (value !== 'assigned' && value !== 'all') {
        throw new FinanceError(400, 'Student scope must be assigned or all.', 'VALIDATION_ERROR');
    }
    return value;
}

export function boundedLimit(input: unknown, fallback = 50, max = 100) {
    const parsed = Number(input ?? fallback);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
}

