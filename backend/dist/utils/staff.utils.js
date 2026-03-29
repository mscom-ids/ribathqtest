"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelegationContext = exports.getStaffId = void 0;
const db_1 = require("../config/db");
const getStaffId = async (req) => {
    const ctx = await (0, exports.getDelegationContext)(req);
    return ctx?.staffId || null;
};
exports.getStaffId = getStaffId;
const getDelegationContext = async (req) => {
    const user = req.user;
    if (!user)
        return null;
    // 1. Resolve the actual staff ID of the logged-in user.
    const staffRes = await db_1.db.query('SELECT id FROM staff WHERE id = $1 OR profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
    if (staffRes.rows.length === 0)
        return null;
    const actualStaffId = staffRes.rows[0].id;
    // 2. Check if a verified delegation token is attached by middleware
    const delegation = req.delegation;
    if (delegation && delegation.actingAsStaffId) {
        return {
            staffId: delegation.actingAsStaffId,
            studentId: delegation.studentId || null,
            isDelegated: true
        };
    }
    return { staffId: actualStaffId, studentId: null, isDelegated: false };
};
exports.getDelegationContext = getDelegationContext;
