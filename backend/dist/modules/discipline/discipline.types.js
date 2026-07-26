"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCIPLINE_SETTINGS_ROLES = exports.DISCIPLINE_REVIEW_ROLES = exports.DISCIPLINE_REPORT_ROLES = exports.DISCIPLINE_VIEW_ROLES = exports.PARENT_STATUSES = exports.ACTION_STATUSES = exports.SEVERITIES = exports.INCIDENT_STATUSES = void 0;
exports.isReviewRole = isReviewRole;
exports.isSettingsRole = isSettingsRole;
exports.INCIDENT_STATUSES = [
    'draft',
    'submitted',
    'under_review',
    'waiting_student_explanation',
    'action_assigned',
    'follow_up_pending',
    'completed',
    'cancelled',
];
exports.SEVERITIES = ['minor', 'moderate', 'major', 'critical'];
exports.ACTION_STATUSES = ['not_started', 'in_progress', 'completed', 'overdue', 'cancelled'];
exports.PARENT_STATUSES = [
    'not_required',
    'pending',
    'message_sent',
    'called',
    'meeting_scheduled',
    'acknowledged',
];
exports.DISCIPLINE_VIEW_ROLES = [
    'admin', 'principal', 'vice_principal', 'controller', 'staff', 'teacher', 'usthad', 'mentor',
];
exports.DISCIPLINE_REPORT_ROLES = exports.DISCIPLINE_VIEW_ROLES;
exports.DISCIPLINE_REVIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
exports.DISCIPLINE_SETTINGS_ROLES = ['admin', 'principal', 'controller'];
function isReviewRole(role) {
    return exports.DISCIPLINE_REVIEW_ROLES.includes(String(role || '').toLowerCase());
}
function isSettingsRole(role) {
    return exports.DISCIPLINE_SETTINGS_ROLES.includes(String(role || '').toLowerCase());
}
