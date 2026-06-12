"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelegationContext = exports.getStaffId = exports.NON_TEACHING_STAFF_ROLES = exports.ADMINISTRATIVE_STAFF_ROLES = exports.LEADERSHIP_STAFF_ROLES = exports.TEACHING_STAFF_ROLES = void 0;
exports.normalizeStaffRole = normalizeStaffRole;
exports.isTeachingStaffRole = isTeachingStaffRole;
exports.isLeadershipStaffRole = isLeadershipStaffRole;
exports.isAdministrativeStaffRole = isAdministrativeStaffRole;
exports.staffDomainForRole = staffDomainForRole;
exports.staffRoleLabel = staffRoleLabel;
const db_1 = require("../config/db");
const server_cache_1 = require("./server-cache");
exports.TEACHING_STAFF_ROLES = ['usthad', 'mentor', 'staff', 'teacher'];
exports.LEADERSHIP_STAFF_ROLES = ['principal', 'vice_principal'];
exports.ADMINISTRATIVE_STAFF_ROLES = ['admin', 'controller'];
exports.NON_TEACHING_STAFF_ROLES = [...exports.LEADERSHIP_STAFF_ROLES, ...exports.ADMINISTRATIVE_STAFF_ROLES];
function normalizeStaffRole(role) {
    return String(role || '').trim().toLowerCase();
}
function isTeachingStaffRole(role) {
    return exports.TEACHING_STAFF_ROLES.includes(normalizeStaffRole(role));
}
function isLeadershipStaffRole(role) {
    return exports.LEADERSHIP_STAFF_ROLES.includes(normalizeStaffRole(role));
}
function isAdministrativeStaffRole(role) {
    return exports.ADMINISTRATIVE_STAFF_ROLES.includes(normalizeStaffRole(role));
}
function staffDomainForRole(role) {
    if (isLeadershipStaffRole(role))
        return 'leadership';
    if (isAdministrativeStaffRole(role))
        return 'administrative';
    return 'teaching';
}
function staffRoleLabel(role) {
    const normalized = normalizeStaffRole(role);
    const labels = {
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
    //    Cache for 10 min per user — this lookup runs on EVERY API request
    //    and was the top slow query (1000-1039ms each time).
    const actualStaffId = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('staff:id-by-user', { uid: user.id }), 10 * 60000, async () => {
        const staffRes = await db_1.db.query('SELECT id FROM staff WHERE id = $1 OR profile_id = $1 OR email = $2 LIMIT 1', [user.id, user.email]);
        return staffRes.rows[0]?.id || null;
    });
    if (!actualStaffId)
        return null;
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
