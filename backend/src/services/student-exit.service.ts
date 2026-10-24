/** Disconnect operational assignments without deleting academic or financial history.
 * Called inside the student's status-change transaction.
 */
export async function disconnectAlumniAssignments(client: any, studentId: string, exitDate: string) {
    const operations: [string, string][] = [
        ['attendance_group_students', `UPDATE attendance_group_students SET effective_until = $2::date
            WHERE student_id = $1 AND (effective_until IS NULL OR effective_until > $2::date)`],
        ['academic_student_placements', `UPDATE academic_student_placements SET status = 'inactive'
            WHERE student_id = $1 AND status = 'active'`],
        ['student_school_enrollments', `UPDATE student_school_enrollments SET status = 'inactive', left_at = $2::date
            WHERE student_id = $1 AND status = 'active'`],
        ['student_madrasa_enrollments', `UPDATE student_madrasa_enrollments SET status = 'inactive', left_at = $2::date
            WHERE student_id = $1 AND status = 'active'`],
        ['student_hifz_profiles', `UPDATE student_hifz_profiles SET active = false, mentor_id = NULL, updated_at = now()
            WHERE student_id = $1`],
        ['hifz_mentor_history', `UPDATE hifz_mentor_history SET assigned_until = $2::date
            WHERE student_id = $1 AND assigned_until IS NULL`],
        ['mentor_delegations', `UPDATE mentor_delegations SET status = 'terminated', terminated_at = now(), updated_at = now()
            WHERE student_id = $1 AND status IN ('pending', 'approved')`],
    ];
    for (const [table, sql] of operations) {
        // Some older installations do not have every optional module installed.
        const exists = await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
        if (exists.rows[0]?.table_name) {
            await client.query(sql, sql.includes('$2') ? [studentId, exitDate] : [studentId]);
        }
    }
    await client.query(`UPDATE students SET hifz_mentor_id = NULL, school_mentor_id = NULL, madrasa_mentor_id = NULL
        WHERE adm_no = $1`, [studentId]);
}
