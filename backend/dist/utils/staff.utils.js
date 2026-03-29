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
    // 2. Check if they are acting as a delegated mentor
    const actingAsId = req.headers['x-acting-as-staff-id'];
    const actingAsStudentId = req.headers['x-acting-as-student-id'];
    if (actingAsId && actingAsId !== actualStaffId) {
        // Verify there is an approved delegation FROM actingAsId TO actualStaffId
        // If actingAsStudentId is provided, the delegation MUST be for that specific student or for ALL (student_id IS NULL)
        const delegationRes = await db_1.db.query(`
            SELECT id, student_id FROM mentor_delegations
            WHERE from_staff_id = $1 AND to_staff_id = $2 AND status = 'approved'
              AND (
                (student_id IS NULL) OR 
                (student_id = $3)
              )
        `, [actingAsId, actualStaffId, actingAsStudentId || null]);
        if (delegationRes.rows.length > 0) {
            // Check if there was any row where student_id matches SPECIFICALLY if actingAsStudentId was provided
            const specificMatch = delegationRes.rows.find(r => r.student_id === actingAsStudentId);
            const allMatch = delegationRes.rows.find(r => r.student_id === null);
            if (actingAsStudentId && specificMatch) {
                return { staffId: actingAsId, studentId: actingAsStudentId, isDelegated: true };
            }
            else if (allMatch) {
                return { staffId: actingAsId, studentId: actingAsStudentId || null, isDelegated: true };
            }
        }
    }
    return { staffId: actualStaffId, studentId: null, isDelegated: false };
};
exports.getDelegationContext = getDelegationContext;
