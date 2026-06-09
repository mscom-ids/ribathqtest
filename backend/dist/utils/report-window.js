"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studentExitDate = studentExitDate;
exports.getAcademicYearBounds = getAcademicYearBounds;
exports.resolveStudentReportWindow = resolveStudentReportWindow;
function dateKey(value) {
    if (!value)
        return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))
        return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return null;
    return date.toISOString().slice(0, 10);
}
function maxDate(...values) {
    const sorted = values.filter(Boolean).sort();
    return sorted.length ? sorted[sorted.length - 1] : null;
}
function minDate(...values) {
    return values.filter(Boolean).sort()[0] || null;
}
function studentExitDate(student) {
    const details = student?.comprehensive_details || {};
    return dateKey(student?.exit_date ||
        student?.leaving_date ||
        details.leaving_date ||
        details.exit_date ||
        details.completed_date ||
        details.transfer_date);
}
async function getAcademicYearBounds(db, academicYearId) {
    if (!academicYearId)
        return { start_date: null, end_date: null };
    const result = await db.query(`SELECT start_date, end_date
     FROM academic_years
     WHERE id = $1
     LIMIT 1`, [academicYearId]);
    return {
        start_date: dateKey(result.rows[0]?.start_date),
        end_date: dateKey(result.rows[0]?.end_date),
    };
}
function resolveStudentReportWindow(student, requestedStartDate, requestedEndDate, academicYearBounds) {
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
