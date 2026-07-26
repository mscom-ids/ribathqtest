export const INCIDENT_STATUSES = [
    'draft',
    'submitted',
    'under_review',
    'waiting_student_explanation',
    'action_assigned',
    'follow_up_pending',
    'completed',
    'cancelled',
] as const;

export const SEVERITIES = ['minor', 'moderate', 'major', 'critical'] as const;

export const ACTION_STATUSES = ['not_started', 'in_progress', 'completed', 'overdue', 'cancelled'] as const;

export const PARENT_STATUSES = [
    'not_required',
    'pending',
    'message_sent',
    'called',
    'meeting_scheduled',
    'acknowledged',
] as const;

export type IncidentStatus = typeof INCIDENT_STATUSES[number];
export type Severity = typeof SEVERITIES[number];
export type ActionStatus = typeof ACTION_STATUSES[number];
export type ParentStatus = typeof PARENT_STATUSES[number];

export const DISCIPLINE_VIEW_ROLES = [
    'admin', 'principal', 'vice_principal', 'controller', 'staff', 'teacher', 'usthad', 'mentor',
];

export const DISCIPLINE_REPORT_ROLES = DISCIPLINE_VIEW_ROLES;
export const DISCIPLINE_REVIEW_ROLES = ['admin', 'principal', 'vice_principal', 'controller'];
export const DISCIPLINE_SETTINGS_ROLES = ['admin', 'principal', 'controller'];

export function isReviewRole(role: unknown) {
    return DISCIPLINE_REVIEW_ROLES.includes(String(role || '').toLowerCase());
}

export function isSettingsRole(role: unknown) {
    return DISCIPLINE_SETTINGS_ROLES.includes(String(role || '').toLowerCase());
}

export type IncidentCreateInput = {
    student_id: string;
    category_id: string;
    offence_type_id: string;
    severity: Severity;
    discipline_marks: number;
    reported_at: string;
    location?: string | null;
    hostel?: string | null;
    floor?: string | null;
    room_number?: string | null;
    class_name?: string | null;
    division?: string | null;
    short_description: string;
    immediate_action?: string | null;
    student_position?: 'not_recorded' | 'accepted' | 'denied';
    parent_notification_required?: boolean;
    private_staff_notes?: string | null;
    witnesses?: Array<{ name: string; details?: string | null }>;
    evidence?: Array<{
        file_name: string;
        file_url: string;
        mime_type?: string | null;
        file_size?: number | null;
        visibility?: 'staff_only' | 'student_parent';
    }>;
    save_as_draft?: boolean;
    idempotency_key?: string | null;
};

