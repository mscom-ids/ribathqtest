import { cachedResult, makeCacheKey } from '../utils/server-cache';

type Queryable = {
    query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

export type ActiveMentorStudent = {
    id: string;
    adm_no: string;
    name: string;
    photo_url: string | null;
    batch_year: string | null;
    standard: string | null;
    division: string | null;
    attendance_standard: string | null;
    dob: string | null;
    hifz_mentor_id: string;
    hifz_mentor_name: string | null;
    hifz_mentor_phone: string | null;
    school_mentor_name: null;
    madrasa_mentor_name: null;
    is_hifz: true;
};

export type ActiveMentorStudentOptions = {
    academicYearId?: string | null;
    studentIds?: string[];
    studentId?: string | null;
    useCache?: boolean;
};

function uniqueStudentIds(options: ActiveMentorStudentOptions) {
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
export async function getActiveMentorStudents(
    queryable: Queryable,
    mentorId: string,
    options: ActiveMentorStudentOptions = {},
): Promise<ActiveMentorStudent[]> {
    const academicYearId = options.academicYearId || null;
    const requestedStudentIds = uniqueStudentIds(options);

    const load = async () => {
        const params: any[] = academicYearId
            ? [academicYearId, mentorId]
            : [mentorId];
        let studentFilter = '';
        if (requestedStudentIds.length > 0) {
            params.push(requestedStudentIds);
            studentFilter = `AND s.adm_no = ANY($${params.length}::text[])`;
        }

        const result = academicYearId
            ? await queryable.query(
                `SELECT s.adm_no AS id,
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
                 ORDER BY s.name, s.adm_no`,
                params,
            )
            : await queryable.query(
                `SELECT s.adm_no AS id,
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
                 ORDER BY s.name, s.adm_no`,
                params,
            );

        return result.rows as ActiveMentorStudent[];
    };

    if (options.useCache === false) return load();

    return cachedResult(
        makeCacheKey('mentor-students:active', {
            mentor_id: mentorId,
            academic_year_id: academicYearId || 'legacy',
            students: requestedStudentIds.join(',') || 'all',
        }),
        30_000,
        load,
    );
}

export async function getActiveMentorStudentIds(
    queryable: Queryable,
    mentorId: string,
    options: ActiveMentorStudentOptions = {},
) {
    const students = await getActiveMentorStudents(queryable, mentorId, options);
    return new Set(students.map(student => student.adm_no));
}
