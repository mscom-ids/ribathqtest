type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type ReportWindow = {
  requested_start_date: string;
  requested_end_date: string;
  effective_start_date: string;
  effective_end_date: string;
  academic_year_start_date?: string | null;
  academic_year_end_date?: string | null;
  admission_date?: string | null;
  exit_date?: string | null;
  has_overlap: boolean;
};

function dateKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function maxDate(...values: Array<string | null | undefined>) {
  const sorted = values.filter(Boolean).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function minDate(...values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort()[0] || null;
}

export function studentExitDate(student: any): string | null {
  const details = student?.comprehensive_details || {};
  return dateKey(
    student?.exit_date ||
    student?.leaving_date ||
    details.leaving_date ||
    details.exit_date ||
    details.completed_date ||
    details.transfer_date
  );
}

export async function getAcademicYearBounds(db: Queryable, academicYearId?: string | null) {
  if (!academicYearId) return { start_date: null, end_date: null };
  const result = await db.query(
    `SELECT start_date, end_date
     FROM academic_years
     WHERE id = $1
     LIMIT 1`,
    [academicYearId]
  );
  return {
    start_date: dateKey(result.rows[0]?.start_date),
    end_date: dateKey(result.rows[0]?.end_date),
  };
}

export function resolveStudentReportWindow(
  student: any,
  requestedStartDate: string,
  requestedEndDate: string,
  academicYearBounds?: { start_date?: string | null; end_date?: string | null }
): ReportWindow {
  const admissionDate = dateKey(student?.admission_date);
  const exitDate = studentExitDate(student);
  const academicStart = academicYearBounds?.start_date || null;
  const academicEnd = academicYearBounds?.end_date || null;

  const effectiveStart = maxDate(requestedStartDate, academicStart, admissionDate) || requestedStartDate;
  const effectiveEnd = minDate(requestedEndDate, academicEnd, exitDate) || requestedEndDate;

  return {
    requested_start_date: requestedStartDate,
    requested_end_date: requestedEndDate,
    effective_start_date: effectiveStart,
    effective_end_date: effectiveEnd,
    academic_year_start_date: academicStart,
    academic_year_end_date: academicEnd,
    admission_date: admissionDate,
    exit_date: exitDate,
    has_overlap: effectiveStart <= effectiveEnd,
  };
}
