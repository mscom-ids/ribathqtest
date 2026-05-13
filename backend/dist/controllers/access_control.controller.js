"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMentorAccessDecisionForDate = exports.updateMentorAccessPolicy = exports.getMentorAccessPolicies = void 0;
const mentor_access_policy_1 = require("../utils/mentor-access-policy");
const server_cache_1 = require("../utils/server-cache");
const getMentorAccessPolicies = async (req, res) => {
    try {
        const policies = await (0, mentor_access_policy_1.listMentorAccessPolicies)();
        res.json({ success: true, policies });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getMentorAccessPolicies = getMentorAccessPolicies;
const updateMentorAccessPolicy = async (req, res) => {
    try {
        const role = req.user?.role;
        if (!(0, mentor_access_policy_1.canManageMentorAccess)(role)) {
            return res.status(403).json({ success: false, error: 'Only admins can manage mentor access locks.' });
        }
        const { feature, default_window_days, unlock_start_date, unlock_end_date, note } = req.body;
        const policy = await (0, mentor_access_policy_1.saveMentorAccessPolicy)({
            feature,
            default_window_days,
            unlock_start_date,
            unlock_end_date,
            note,
            updated_by: req.user?.id || null,
        });
        (0, server_cache_1.invalidateCacheByPrefix)('attendance:');
        (0, server_cache_1.invalidateCacheByPrefix)('hifz:');
        res.json({ success: true, policy });
    }
    catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
exports.updateMentorAccessPolicy = updateMentorAccessPolicy;
const getMentorAccessDecisionForDate = async (req, res) => {
    try {
        const { feature, date } = req.query;
        if (!feature || !date) {
            return res.status(400).json({ success: false, error: 'feature and date are required' });
        }
        const decision = await (0, mentor_access_policy_1.getMentorAccessDecision)(feature, String(date));
        res.json({ success: true, decision });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getMentorAccessDecisionForDate = getMentorAccessDecisionForDate;
