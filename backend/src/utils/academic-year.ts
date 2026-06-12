import { cachedResult, makeCacheKey } from './server-cache';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type AcademicYearContext = {
  academicYearId: string | null;
  currentAcademicYearId: string | null;
  mode: 'current' | 'historical' | 'legacy';
};

export function getAcademicYearParam(value: unknown): string | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

export async function getAcademicYearContext(
  db: Queryable,
  requestedAcademicYearId?: unknown
): Promise<AcademicYearContext> {
  const requested = getAcademicYearParam(requestedAcademicYearId);

  const currentAcademicYearId = await cachedResult(
    'academic-year:current',
    30 * 60_000,   // 30 min — academic year changes at most once a year
    async () => {
      const currentRes = await db.query(
        `SELECT id
         FROM academic_years
         WHERE is_current = true
         ORDER BY start_date DESC
         LIMIT 1`
      );
      return currentRes.rows[0]?.id || null;
    }
  );
  const academicYearId = requested || currentAcademicYearId;

  if (!academicYearId) {
    return { academicYearId: null, currentAcademicYearId: null, mode: 'legacy' };
  }

  return {
    academicYearId,
    currentAcademicYearId,
    mode: currentAcademicYearId && academicYearId !== currentAcademicYearId ? 'historical' : 'current',
  };
}

export async function getStudentYearSnapshotMap(
  db: Queryable,
  studentIds: string[],
  academicYearId: string | null
) {
  const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
  if (!academicYearId || uniqueIds.length === 0) return new Map<string, any>();

  return cachedResult(
    makeCacheKey('academic-year:snapshots', {
      academic_year_id: academicYearId,
      students: uniqueIds.sort().join(','),
    }),
    60_000,
    async () => {
      const snapshots = new Map<string, any>();
      const res = await db.query(
        `SELECT student_id, academic_year_id, school_standard, school_section,
                madrasa_standard, madrasa_section, hifz_mentor_id, status
         FROM student_year_snapshots
         WHERE academic_year_id = $1
           AND student_id = ANY($2::text[])`,
        [academicYearId, uniqueIds]
      );

      res.rows.forEach((row: any) => snapshots.set(row.student_id, row));
      return snapshots;
    }
  );
}

export function applyAcademicSnapshot(student: any, snapshot?: any) {
  if (!snapshot) return student;

  return {
    ...student,
    standard: snapshot.school_standard || student.standard,
    school_standard: snapshot.school_standard || student.school_standard || student.standard,
    school_section: snapshot.school_section || student.school_section || null,
    madrasa_standard: snapshot.madrasa_standard || student.madrasa_standard || null,
    madrasa_section: snapshot.madrasa_section || student.madrasa_section || null,
    hifz_mentor_id: snapshot.hifz_mentor_id || student.hifz_mentor_id || null,
    academic_year_id: snapshot.academic_year_id,
    academic_status: snapshot.status || student.status,
    attendance_standard: snapshot.school_standard || student.attendance_standard || student.standard,
  };
}

export function studentAcademicJoin(alias = 's') {
  return `
    LEFT JOIN student_year_snapshots sys
      ON sys.student_id = ${alias}.adm_no
     AND sys.academic_year_id = $1
  `;
}

export function studentAcademicSelect(alias = 's') {
  return `
    COALESCE(sys.school_standard, ${alias}.standard) AS standard,
    COALESCE(sys.school_standard, ${alias}.school_standard, ${alias}.standard) AS school_standard,
    sys.school_section AS school_section,
    COALESCE(sys.madrasa_standard, ${alias}.madrassa_standard) AS madrasa_standard,
    sys.madrasa_section AS madrasa_section
  `;
}
