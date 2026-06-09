"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MENTOR_ACCESS_ROLES = exports.MENTOR_ACCESS_MANAGE_ROLES = exports.MENTOR_ACCESS_FEATURES = void 0;
exports.isMentorAccessRole = isMentorAccessRole;
exports.canManageMentorAccess = canManageMentorAccess;
exports.ensureMentorAccessPolicies = ensureMentorAccessPolicies;
exports.getMentorAccessPolicy = getMentorAccessPolicy;
exports.listMentorAccessPolicies = listMentorAccessPolicies;
exports.saveMentorAccessPolicy = saveMentorAccessPolicy;
exports.getMentorAccessDecision = getMentorAccessDecision;
const db_1 = require("../config/db");
const server_cache_1 = require("./server-cache");
exports.MENTOR_ACCESS_FEATURES = ['attendance', 'hifz_recording'];
exports.MENTOR_ACCESS_MANAGE_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
exports.MENTOR_ACCESS_ROLES = ['staff', 'usthad', 'mentor'];
const INDIA_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_WINDOW_DAYS = 7;
const MENTOR_ACCESS_POLICY_TTL_MS = 5 * 60000;
function formatIndiaDate(date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: INDIA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}
function addDays(dateKey, days) {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
function toDateKey(value) {
    if (!value)
        return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
        return value;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return formatIndiaDate(date);
}
function normalizePolicy(row) {
    const defaultWindowDays = Math.max(1, Number(row?.default_window_days || DEFAULT_WINDOW_DAYS));
    const unlockStartDate = toDateKey(row?.unlock_start_date);
    const unlockEndDate = toDateKey(row?.unlock_end_date);
    const today = formatIndiaDate(new Date());
    const defaultStartDate = addDays(today, -(defaultWindowDays - 1));
    const hasUnlock = !!unlockStartDate && !!unlockEndDate;
    const unlockIsActive = hasUnlock && unlockEndDate >= today;
    return {
        id: row?.id || null,
        feature: row?.feature,
        default_window_days: defaultWindowDays,
        default_start_date: defaultStartDate,
        today,
        unlock_start_date: unlockStartDate,
        unlock_end_date: unlockEndDate,
        unlock_is_active: unlockIsActive,
        note: row?.note || '',
        updated_at: row?.updated_at || null,
    };
}
function isMentorAccessRole(role) {
    return exports.MENTOR_ACCESS_ROLES.includes(String(role || '').toLowerCase());
}
function canManageMentorAccess(role) {
    return exports.MENTOR_ACCESS_MANAGE_ROLES.includes(String(role || '').toLowerCase());
}
async function ensureMentorAccessPolicies(queryable = db_1.db) {
    for (const feature of exports.MENTOR_ACCESS_FEATURES) {
        await queryable.query(`INSERT INTO mentor_access_policies (feature, default_window_days)
             VALUES ($1, $2)
             ON CONFLICT (feature) DO NOTHING`, [feature, DEFAULT_WINDOW_DAYS]);
    }
}
async function getMentorAccessPolicy(feature, queryable = db_1.db) {
    if (!exports.MENTOR_ACCESS_FEATURES.includes(feature)) {
        throw new Error('Invalid access policy feature');
    }
    return (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('mentor-access:policy', { feature }), MENTOR_ACCESS_POLICY_TTL_MS, async () => {
        const result = await queryable.query(`SELECT *
                 FROM mentor_access_policies
                 WHERE feature = $1
                 LIMIT 1`, [feature]);
        return normalizePolicy(result.rows[0] || { feature, default_window_days: DEFAULT_WINDOW_DAYS });
    });
}
async function listMentorAccessPolicies(queryable = db_1.db) {
    return (0, server_cache_1.cachedResult)('mentor-access:policies', MENTOR_ACCESS_POLICY_TTL_MS, async () => {
        const result = await queryable.query(`SELECT *
                 FROM mentor_access_policies
                 WHERE feature = ANY($1::text[])
                 ORDER BY feature`, [exports.MENTOR_ACCESS_FEATURES]);
        const byFeature = new Map(result.rows.map(row => [row.feature, row]));
        return exports.MENTOR_ACCESS_FEATURES.map(feature => normalizePolicy(byFeature.get(feature) || { feature, default_window_days: DEFAULT_WINDOW_DAYS }));
    });
}
async function saveMentorAccessPolicy(input) {
    if (!exports.MENTOR_ACCESS_FEATURES.includes(input.feature)) {
        throw new Error('Invalid access policy feature');
    }
    const defaultWindowDays = Math.max(1, Number(input.default_window_days || DEFAULT_WINDOW_DAYS));
    const unlockStartDate = input.unlock_start_date || null;
    const unlockEndDate = input.unlock_end_date || null;
    if ((unlockStartDate && !unlockEndDate) || (!unlockStartDate && unlockEndDate)) {
        throw new Error('Unlock start and end dates are both required');
    }
    if (unlockStartDate && unlockEndDate && unlockStartDate > unlockEndDate) {
        throw new Error('Unlock start date cannot be after end date');
    }
    const result = await db_1.db.query(`INSERT INTO mentor_access_policies
            (feature, default_window_days, unlock_start_date, unlock_end_date, note, updated_by, updated_at)
         VALUES ($1, $2, $3::date, $4::date, $5, $6, NOW())
         ON CONFLICT (feature)
         DO UPDATE SET
            default_window_days = EXCLUDED.default_window_days,
            unlock_start_date = EXCLUDED.unlock_start_date,
            unlock_end_date = EXCLUDED.unlock_end_date,
            note = EXCLUDED.note,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
         RETURNING *`, [input.feature, defaultWindowDays, unlockStartDate, unlockEndDate, input.note || null, input.updated_by || null]);
    (0, server_cache_1.invalidateCacheByPrefix)('mentor-access:');
    return normalizePolicy(result.rows[0]);
}
async function getMentorAccessDecision(feature, targetDate) {
    const policy = await getMentorAccessPolicy(feature);
    const dateKey = toDateKey(targetDate);
    if (!dateKey) {
        return {
            ...policy,
            allowed: false,
            reason: 'Invalid date',
        };
    }
    if (dateKey > policy.today) {
        return {
            ...policy,
            date: dateKey,
            allowed: false,
            reason: 'Future dates are locked.',
        };
    }
    const withinDefaultWindow = dateKey >= policy.default_start_date && dateKey <= policy.today;
    const withinUnlockRange = !!policy.unlock_start_date &&
        !!policy.unlock_end_date &&
        dateKey >= policy.unlock_start_date &&
        dateKey <= policy.unlock_end_date;
    return {
        ...policy,
        date: dateKey,
        allowed: withinDefaultWindow || withinUnlockRange,
        reason: withinDefaultWindow || withinUnlockRange
            ? null
            : `Locked for dates older than ${policy.default_window_days} days.`,
    };
}
