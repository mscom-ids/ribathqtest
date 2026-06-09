"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAcademicYearParam = getAcademicYearParam;
exports.getAcademicYearContext = getAcademicYearContext;
exports.getStudentYearSnapshotMap = getStudentYearSnapshotMap;
exports.applyAcademicSnapshot = applyAcademicSnapshot;
exports.studentAcademicJoin = studentAcademicJoin;
exports.studentAcademicSelect = studentAcademicSelect;
const server_cache_1 = require("./server-cache");
function getAcademicYearParam(value) {
    if (!value)
        return null;
    const raw = Array.isArray(value) ? value[0] : value;
    const text = String(raw || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
        ? text
        : null;
}
async function getAcademicYearContext(db, requestedAcademicYearId) {
    const requested = getAcademicYearParam(requestedAcademicYearId);
    const currentAcademicYearId = await (0, server_cache_1.cachedResult)('academic-year:current', 5 * 60000, async () => {
        const currentRes = await db.query(`SELECT id
         FROM academic_years
         WHERE is_current = true
         ORDER BY start_date DESC
         LIMIT 1`);
        return currentRes.rows[0]?.id || null;
    });
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
async function getStudentYearSnapshotMap(db, studentIds, academicYearId) {
    const uniqueIds = Array.from(new Set(studentIds.filter(Boolean)));
    const snapshots = new Map();
    if (!academicYearId || uniqueIds.length === 0)
        return snapshots;
    const res = await db.query(`SELECT student_id, academic_year_id, school_standard, school_section,
            madrasa_standard, madrasa_section, hifz_mentor_id, status
     FROM student_year_snapshots
     WHERE academic_year_id = $1
       AND student_id = ANY($2::text[])`, [academicYearId, uniqueIds]);
    res.rows.forEach((row) => snapshots.set(row.student_id, row));
    return snapshots;
}
function applyAcademicSnapshot(student, snapshot) {
    if (!snapshot)
        return student;
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
function studentAcademicJoin(alias = 's') {
    return `
    LEFT JOIN student_year_snapshots sys
      ON sys.student_id = ${alias}.adm_no
     AND sys.academic_year_id = $1
  `;
}
function studentAcademicSelect(alias = 's') {
    return `
    COALESCE(sys.school_standard, ${alias}.standard) AS standard,
    COALESCE(sys.school_standard, ${alias}.school_standard, ${alias}.standard) AS school_standard,
    sys.school_section AS school_section,
    COALESCE(sys.madrasa_standard, ${alias}.madrassa_standard) AS madrasa_standard,
    sys.madrasa_section AS madrasa_section
  `;
}
