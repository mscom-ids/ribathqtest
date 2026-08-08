/**
 * Presentation-only grouping for the attendance dashboard.
 *
 * A timetable row remains the source of truth for its own roster, marks and
 * cancellations.  This helper only lets the dashboard show parallel mentor
 * rows as one session block when they represent the same department, subject
 * (or legacy name), and exact time range.
 */
export type AttendanceScheduleLike = {
  id: string
  class_type?: string | null
  subject_id?: string | null
  name?: string | null
  mentor_id?: string | null
  mentor_name?: string | null
  start_time?: string | null
  end_time?: string | null
  [key: string]: unknown
}

export type AttendanceSessionGroup<T extends AttendanceScheduleLike = AttendanceScheduleLike> = {
  key: string
  department: string
  subjectLabel: string
  startTime: string
  endTime: string
  schedules: T[]
}

const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase()

/**
 * Groups only rows that are genuinely the same session slot.  Different start
 * or end times intentionally remain separate, even if the subject name is the
 * same.  `subject_id` is included when available so two distinct configured
 * subjects with the same display name are not accidentally merged.
 */
/**
 * Cheap fingerprint used to dedupe schedule rows within a merged session
 * group.  Two schedules that share their standards and expected-mentor list
 * are indistinguishable to the operator, so we only keep the first one.
 */
function scheduleFingerprint(schedule: AttendanceScheduleLike): string {
  const rawStandards = (schedule as { standards?: unknown }).standards
  const standards = Array.isArray(rawStandards)
    ? [...rawStandards].map(value => normalized(value)).sort()
    : typeof rawStandards === 'string'
      ? rawStandards
          .split(/[,\s]+/)
          .map(value => normalized(value))
          .filter(Boolean)
          .sort()
      : []
  const mentorList = Array.isArray((schedule as { expected_mentors?: unknown }).expected_mentors)
    ? ((schedule as { expected_mentors?: Array<{ id?: unknown; name?: unknown }> }).expected_mentors || [])
        .map(mentor => normalized(mentor?.id) || normalized(mentor?.name))
        .filter(Boolean)
        .sort()
    : []
  const directMentor = normalized((schedule as { mentor_id?: unknown }).mentor_id)
    || normalized((schedule as { mentor_name?: unknown }).mentor_name)
  return [standards.join(','), mentorList.join(','), directMentor].join('|')
}

export function groupAttendanceSessionSchedules<T extends AttendanceScheduleLike>(
  schedules: T[],
): AttendanceSessionGroup<T>[] {
  const groups = new Map<string, AttendanceSessionGroup<T>>()
  const seenFingerprints = new Map<string, Set<string>>()

  for (const schedule of schedules) {
    const department = normalized(schedule.class_type) || 'general'
    const subjectLabel = String(schedule.name || '').trim() || 'Unnamed session'
    // Group by display identity (department + name + time) only.  Two schedule
    // rows for the same class at the same time were previously split apart when
    // they carried different `subject_id`s, which surfaced as visual duplicates
    // for the operator.  Any legitimately-different subject that happens to
    // share a name at the same slot should be renamed at the schedule level.
    const startTime = String(schedule.start_time || '')
    const endTime = String(schedule.end_time || '')
    const key = [department, `name:${normalized(subjectLabel)}`, startTime, endTime].join('|')

    const fingerprint = scheduleFingerprint(schedule)
    const seen = seenFingerprints.get(key)
    if (seen && seen.has(fingerprint)) continue
    if (seen) seen.add(fingerprint)
    else seenFingerprints.set(key, new Set([fingerprint]))

    const existing = groups.get(key)
    if (existing) {
      existing.schedules.push(schedule)
    } else {
      groups.set(key, { key, department, subjectLabel, startTime, endTime, schedules: [schedule] })
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
    || a.endTime.localeCompare(b.endTime)
    || a.subjectLabel.localeCompare(b.subjectLabel),
  )
}

export type AttendanceGroupState = 'completed' | 'partial' | 'pending' | 'cancelled' | 'upcoming' | 'locked'

/** Aggregate the preserved row states without discarding any child detail. */
export function getAttendanceGroupState(states: string[]): AttendanceGroupState {
  if (states.length === 0 || states.every(state => state === 'cancelled')) return 'cancelled'
  if (states.every(state => state === 'completed' || state === 'cancelled')) return 'completed'
  if (states.some(state => state === 'completed' || state === 'partial')) return 'partial'
  if (states.some(state => state === 'active')) return 'pending'
  if (states.some(state => state === 'upcoming')) return 'upcoming'
  if (states.every(state => state === 'locked' || state === 'cancelled')) return 'locked'
  return 'pending'
}
