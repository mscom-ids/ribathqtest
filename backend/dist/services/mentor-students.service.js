"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveMentorStudents = getActiveMentorStudents;
exports.getActiveMentorStudentIds = getActiveMentorStudentIds;
const server_cache_1 = require("../utils/server-cache");
function uniqueStudentIds(options) {
    return Array.from(new Set([
        ...(options.studentIds || []),
        ...(options.studentId ? [options.studentId] : []),
    ].map(String).map(id => id.trim()).filter(Boolean))).sort();
}
/**
 * Canonical current Hifz roster lookup.
 *
 * Mentor ownership comes only from the academic-year assignment snapshot.
 * Academic placement is joined for display fields and never decides ownership.
 * The legacy students.hifz_mentor_id path is used only when no academic year exists.
 */
async function getActiveMentorStudents(queryable, mentorId, options = {}) {
    const academicYearId = options.academicYearId || null;
    const requestedStudentIds = uniqueStudentIds(options);
    const load = async () => {
        const params = academicYearId
            ? [academicYearId, mentorId]
            : [mentorId];
        let studentFilter = '';
        if (requestedStudentIds.length > 0) {
            params.push(requestedStudentIds);
            studentFilter = `AND s.adm_no = ANY($${params.length}::text[])`;
        }
        const result = academicYearId
            ? await queryable.query(`SELECT s.adm_no AS id,
                        s.adm_no,
                        s.name,
                        s.photo_url,
                        s.batch_year,
                        COALESCE(p.standard, assignment.school_standard, s.standard) AS standard,
                        COALESCE(p.division, assignment.school_section) AS division,
                        COALESCE(p.standard, assignment.school_standard, s.standard) AS attendance_standard,
                        s.dob,
                        assignment.hifz_mentor_id,
                        mentor.name AS hifz_mentor_name,
                        mentor.phone AS hifz_mentor_phone,
                        NULL::text AS school_mentor_name,
                        NULL::text AS madrasa_mentor_name,
                        true AS is_hifz
                 FROM student_year_snapshots assignment
                 JOIN students s
                   ON s.adm_no = assignment.student_id
                  AND LOWER(COALESCE(s.status, 'active')) = 'active'
                 LEFT JOIN academic_student_placements p
                   ON p.student_id = assignment.student_id
                  AND p.academic_year_id = assignment.academic_year_id
                  AND p.status = 'active'
                 LEFT JOIN staff mentor ON mentor.id = assignment.hifz_mentor_id
                 WHERE assignment.academic_year_id = $1
                   AND assignment.hifz_mentor_id = $2
                   AND LOWER(COALESCE(assignment.status, 'active')) = 'active'
                   ${studentFilter}
                 ORDER BY s.name, s.adm_no`, params)
            : await queryable.query(`SELECT s.adm_no AS id,
                        s.adm_no,
                        s.name,
                        s.photo_url,
                        s.batch_year,
                        s.standard,
                        NULL::text AS division,
                        s.standard AS attendance_standard,
                        s.dob,
                        s.hifz_mentor_id,
                        mentor.name AS hifz_mentor_name,
                        mentor.phone AS hifz_mentor_phone,
                        NULL::text AS school_mentor_name,
                        NULL::text AS madrasa_mentor_name,
                        true AS is_hifz
                 FROM students s
                 LEFT JOIN staff mentor ON mentor.id = s.hifz_mentor_id
                 WHERE s.hifz_mentor_id = $1
                   AND LOWER(COALESCE(s.status, 'active')) = 'active'
                   ${studentFilter}
                 ORDER BY s.name, s.adm_no`, params);
        return result.rows;
    };
    if (options.useCache === false)
        return load();
    return (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('mentor-students:active', {
        mentor_id: mentorId,
        academic_year_id: academicYearId || 'legacy',
        students: requestedStudentIds.join(',') || 'all',
    }), 30000, load);
}
async function getActiveMentorStudentIds(queryable, mentorId, options = {}) {
    const students = await getActiveMentorStudents(queryable, mentorId, options);
    return new Set(students.map(student => student.adm_no));
}
