type Queryable = { query: (text: string, params?: any[]) => Promise<any> };

export type AttendanceSessionKey = { scheduleId: string; date: string };

export function attendanceSessionLockKey(session: AttendanceSessionKey) {
  return `attendance:${session.scheduleId}:${session.date.slice(0, 10)}`;
}

/**
 * Serializes every writer for a timetable slot on a date. Call this only
 * inside a database transaction and always pass the full batch so keys are
 * acquired in deterministic order.
 */
export async function lockAttendanceSessions(db: Queryable, sessions: AttendanceSessionKey[]) {
  const keys = Array.from(new Set(sessions.map(attendanceSessionLockKey))).sort();
  if (keys.length === 0) return;
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
     FROM unnest($1::text[]) AS lock_key
     ORDER BY lock_key`,
    [keys],
  );
}
