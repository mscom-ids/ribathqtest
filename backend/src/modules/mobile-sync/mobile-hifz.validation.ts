export type MobileHifzMutationInput = {
  mutationId: string;
  studentId: string;
  entryDate: string;
  mode: 'New Verses' | 'Recent Revision';
  surahName: string;
  startVerse: number;
  endVerse: number;
  sessionId: string | null;
  notes: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_MODES = new Set(['New Verses', 'Recent Revision']);

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= max ? normalized : null;
}

export function parseMobileHifzMutation(body: unknown): { input?: MobileHifzMutationInput; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid mutation payload' };
  const value = body as Record<string, unknown>;
  const mutationId = text(value.mutationId, 36);
  const studentId = text(value.studentId, 100);
  const entryDate = text(value.entryDate, 10);
  const mode = text(value.mode, 50);
  const surahName = text(value.surahName, 100);
  const startVerse = Number(value.startVerse);
  const endVerse = Number(value.endVerse);
  const sessionId = value.sessionId === undefined || value.sessionId === null || value.sessionId === ''
    ? null
    : text(value.sessionId, 36);
  const notes = value.notes === undefined || value.notes === null || value.notes === ''
    ? null
    : text(value.notes, 1000);

  if (!mutationId || !UUID_PATTERN.test(mutationId)) return { error: 'A valid mutationId is required' };
  if (!studentId) return { error: 'Student is required' };
  if (!entryDate || !DATE_PATTERN.test(entryDate)) return { error: 'A valid entry date is required' };
  if (!mode || !VALID_MODES.has(mode)) return { error: 'This mobile Hifz activity is not supported yet' };
  if (!surahName) return { error: 'Surah is required' };
  if (!Number.isSafeInteger(startVerse) || startVerse < 1 || startVerse > 286) return { error: 'Start verse must be between 1 and 286' };
  if (!Number.isSafeInteger(endVerse) || endVerse < startVerse || endVerse > 286) return { error: 'End verse must be after the start verse and no more than 286' };
  if (sessionId !== null && (!sessionId || !UUID_PATTERN.test(sessionId))) return { error: 'Invalid Hifz session' };
  if (value.notes && notes === null) return { error: 'Notes cannot exceed 1000 characters' };

  return {
    input: {
      mutationId,
      studentId,
      entryDate,
      mode: mode as MobileHifzMutationInput['mode'],
      surahName,
      startVerse,
      endVerse,
      sessionId,
      notes,
    },
  };
}
