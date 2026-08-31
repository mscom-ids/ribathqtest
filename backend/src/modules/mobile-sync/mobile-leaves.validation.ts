export type MobileLeaveMutationInput = {
  mutationId: string;
  operation: 'create' | 'return';
  studentId?: string;
  leaveId?: string;
  leaveType?: 'out-campus' | 'on-campus';
  startDatetime?: string;
  endDatetime?: string | null;
  reasonCategory?: string;
  remarks?: string | null;
  companionName?: string | null;
  companionRelationship?: string | null;
  expectedPresenceStateHash?: string;
  expectedLeaveRevision?: number;
  returnDatetime?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, maxLength);
}

function isoDateTime(value: unknown) {
  const text = requiredText(value, 50);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseMobileLeaveMutation(body: unknown): { input?: MobileLeaveMutationInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid leave mutation payload' };
  const value = body as Record<string, unknown>;
  const mutationId = requiredText(value.mutationId, 36);
  const operation = value.operation;
  if (!mutationId || !UUID_PATTERN.test(mutationId)) return { error: 'A valid mutationId is required' };
  if (operation !== 'create' && operation !== 'return') return { error: 'A valid leave operation is required' };

  if (operation === 'create') {
    const studentId = requiredText(value.studentId, 100);
    const leaveType = value.leaveType === 'out-campus' || value.leaveType === 'on-campus'
      ? value.leaveType
      : null;
    const startDatetime = isoDateTime(value.startDatetime);
    const endDatetime = value.endDatetime === null ? null : isoDateTime(value.endDatetime);
    const reasonCategory = requiredText(value.reasonCategory, 100);
    const remarks = optionalText(value.remarks, 1000);
    const companionName = optionalText(value.companionName, 200);
    const companionRelationship = optionalText(value.companionRelationship, 200);
    const expectedPresenceStateHash = requiredText(value.expectedPresenceStateHash, 64);
    if (!studentId || !leaveType) return { error: 'A valid student and leave type are required' };
    if (!startDatetime || !reasonCategory) return { error: 'Start date/time and reason are required' };
    if (!expectedPresenceStateHash || !HASH_PATTERN.test(expectedPresenceStateHash)) return { error: 'A valid student presence state is required' };
    if (leaveType === 'out-campus' && (!endDatetime || !companionName || !companionRelationship)) {
      return { error: 'Expected return, companion name, and relationship are required for out-campus leave' };
    }
    if (endDatetime && new Date(endDatetime) <= new Date(startDatetime)) return { error: 'Expected return must be after the leave starts' };
    return { input: {
      mutationId, operation, studentId, leaveType, startDatetime,
      endDatetime: leaveType === 'on-campus' ? null : endDatetime,
      reasonCategory, remarks, companionName, companionRelationship, expectedPresenceStateHash,
    } };
  }

  const leaveId = requiredText(value.leaveId, 36);
  const returnDatetime = isoDateTime(value.returnDatetime);
  const expectedLeaveRevision = Number(value.expectedLeaveRevision);
  if (!leaveId || !UUID_PATTERN.test(leaveId)) return { error: 'A valid leave is required' };
  if (!returnDatetime) return { error: 'A valid return date/time is required' };
  if (!Number.isSafeInteger(expectedLeaveRevision) || expectedLeaveRevision < 1) return { error: 'A valid leave revision is required' };
  return { input: { mutationId, operation, leaveId, returnDatetime, expectedLeaveRevision } };
}
