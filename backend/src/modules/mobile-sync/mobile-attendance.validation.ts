export type MobileAttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Leave' | 'Outside';

export type MobileAttendanceMutationInput = {
  mutationId: string;
  scheduleId: string;
  date: string;
  scheduleRevision: number;
  sessionRevision: number;
  rosterStateHash: string;
  marks: Array<{ studentId: string; status: MobileAttendanceStatus }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const STATUS_BY_KEY: Record<string, MobileAttendanceStatus> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  leave: 'Leave',
  on_leave: 'Leave',
  outside: 'Outside',
};

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

function revision(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseMobileAttendanceMutation(body: unknown): { input?: MobileAttendanceMutationInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid attendance mutation payload' };
  const value = body as Record<string, unknown>;
  const mutationId = text(value.mutationId, 36);
  const scheduleId = text(value.scheduleId, 36);
  const date = text(value.date, 10);
  const scheduleRevision = revision(value.scheduleRevision);
  const sessionRevision = revision(value.sessionRevision);
  const rosterStateHash = text(value.rosterStateHash, 64);

  if (!mutationId || !UUID_PATTERN.test(mutationId)) return { error: 'A valid mutationId is required' };
  if (!scheduleId || !UUID_PATTERN.test(scheduleId)) return { error: 'A valid schedule is required' };
  if (!date || !DATE_PATTERN.test(date)) return { error: 'A valid attendance date is required' };
  if (scheduleRevision === null || sessionRevision === null) return { error: 'Valid session revisions are required' };
  if (!rosterStateHash || !HASH_PATTERN.test(rosterStateHash)) return { error: 'A valid roster state is required' };
  if (!Array.isArray(value.marks) || value.marks.length < 1 || value.marks.length > 250) {
    return { error: 'Attendance must contain between 1 and 250 student marks' };
  }

  const seen = new Set<string>();
  const marks: MobileAttendanceMutationInput['marks'] = [];
  for (const raw of value.marks) {
    if (!raw || typeof raw !== 'object') return { error: 'Invalid student attendance mark' };
    const mark = raw as Record<string, unknown>;
    const studentId = text(mark.studentId, 100);
    const statusKey = String(mark.status || '').trim().toLowerCase().replace(/\s+/g, '_');
    const status = STATUS_BY_KEY[statusKey];
    if (!studentId || !status) return { error: 'Every student requires a valid attendance status' };
    if (seen.has(studentId)) return { error: `Duplicate attendance mark for ${studentId}` };
    seen.add(studentId);
    marks.push({ studentId, status });
  }

  return {
    input: { mutationId, scheduleId, date, scheduleRevision, sessionRevision, rosterStateHash, marks },
  };
}

export function parseAttendanceDate(value: unknown) {
  const date = text(value, 10);
  return date && DATE_PATTERN.test(date) ? date : null;
}
