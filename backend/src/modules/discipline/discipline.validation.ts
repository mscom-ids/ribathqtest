import {
    ACTION_STATUSES,
    INCIDENT_STATUSES,
    PARENT_STATUSES,
    SEVERITIES,
    IncidentCreateInput,
} from './discipline.types';

function cleanText(value: unknown, max = 500) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text ? text.slice(0, max) : null;
}

function requiredText(value: unknown, field: string, max = 500) {
    const text = cleanText(value, max);
    if (!text) throw new Error(`${field} is required`);
    return text;
}

function oneOf<T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
    const normalized = String(value || '').trim().toLowerCase();
    if (!values.includes(normalized as T[number])) throw new Error(`Invalid ${field}`);
    return normalized as T[number];
}

function validDateTime(value: unknown, field: string) {
    const raw = requiredText(value, field, 40);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${field}`);
    return date.toISOString();
}

export function parseIncidentCreate(body: any): IncidentCreateInput {
    const marks = Number(body?.discipline_marks);
    if (!Number.isInteger(marks) || marks < 0 || marks > 100) {
        throw new Error('Discipline marks must be a whole number between 0 and 100');
    }

    const witnesses = Array.isArray(body?.witnesses)
        ? body.witnesses.slice(0, 10).map((item: any) => ({
            name: requiredText(item?.name, 'Witness name', 120),
            details: cleanText(item?.details, 500),
        }))
        : [];

    const evidence = Array.isArray(body?.evidence)
        ? body.evidence.slice(0, 10).map((item: any) => ({
            file_name: requiredText(item?.file_name, 'Evidence file name', 180),
            file_url: requiredText(item?.file_url, 'Evidence file URL', 1000),
            mime_type: cleanText(item?.mime_type, 100),
            file_size: item?.file_size == null ? null : Math.max(0, Number(item.file_size) || 0),
            visibility: item?.visibility === 'student_parent' ? 'student_parent' as const : 'staff_only' as const,
        }))
        : [];

    const studentPosition = String(body?.student_position || 'not_recorded').toLowerCase();
    if (!['not_recorded', 'accepted', 'denied'].includes(studentPosition)) {
        throw new Error('Invalid student position');
    }

    return {
        student_id: requiredText(body?.student_id, 'Student', 40),
        category_id: requiredText(body?.category_id, 'Problem category', 60),
        offence_type_id: requiredText(body?.offence_type_id, 'Specific problem', 60),
        severity: oneOf(body?.severity, SEVERITIES, 'severity'),
        discipline_marks: marks,
        reported_at: validDateTime(body?.reported_at, 'incident date and time'),
        location: cleanText(body?.location, 180),
        hostel: cleanText(body?.hostel, 120),
        floor: cleanText(body?.floor, 50),
        room_number: cleanText(body?.room_number, 50),
        class_name: cleanText(body?.class_name, 80),
        division: cleanText(body?.division, 40),
        short_description: requiredText(body?.short_description, 'Short description', 2000),
        immediate_action: cleanText(body?.immediate_action, 1000),
        student_position: studentPosition as IncidentCreateInput['student_position'],
        parent_notification_required: Boolean(body?.parent_notification_required),
        private_staff_notes: cleanText(body?.private_staff_notes, 3000),
        witnesses,
        evidence,
        save_as_draft: Boolean(body?.save_as_draft),
        idempotency_key: cleanText(body?.idempotency_key, 120),
    };
}

export function parseReview(body: any) {
    return {
        decision: oneOf(body?.decision, ['approve', 'request_explanation', 'assign_action', 'cancel', 'escalate'] as const, 'review decision'),
        severity: body?.severity ? oneOf(body.severity, SEVERITIES, 'severity') : undefined,
        discipline_marks: body?.discipline_marks == null ? undefined : Math.max(0, Math.min(100, Number(body.discipline_marks) || 0)),
        note: cleanText(body?.note, 2000),
        parent_notification_status: body?.parent_notification_status
            ? oneOf(body.parent_notification_status, PARENT_STATUSES, 'parent notification status')
            : undefined,
    };
}

export function parseStatus(value: unknown) {
    return oneOf(value, INCIDENT_STATUSES, 'status');
}

export function parseActionStatus(value: unknown) {
    return oneOf(value, ACTION_STATUSES, 'action status');
}

export function parsePositiveMark(body: any) {
    const marks = Number(body?.marks);
    if (!Number.isInteger(marks) || marks <= 0 || marks > 100) {
        throw new Error('Positive marks must be a whole number between 1 and 100');
    }
    return {
        category: requiredText(body?.category, 'Positive behaviour category', 120),
        marks,
        note: cleanText(body?.note, 1000),
    };
}

export function pagination(query: any) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(query?.limit) || 20));
    return { page, limit, offset: (page - 1) * limit };
}

export { cleanText, requiredText };

