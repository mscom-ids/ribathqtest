import { Request, Response } from 'express';
import { db } from '../config/db';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../utils/server-cache';
import { TEACHING_STAFF_ROLES } from '../utils/staff.utils';

export const BUILT_IN_STANDARDS = ['Non-class', '5th', '6th', '7th', '8th', '9th', '10th', 'Plus One', 'Plus Two'] as const;
const ATTENDANCE_DEPARTMENTS = ['hifz', 'school', 'madrasa'] as const;
const MENTOR_FIELD_BY_DEPARTMENT = { hifz: 'hifz_mentor_id', school: 'school_mentor_id', madrasa: 'madrasa_mentor_id' } as const;
const NO_DIVISION_ROSTER = '__none';

function isStandard(value: unknown): value is typeof BUILT_IN_STANDARDS[number] {
    return typeof value === 'string' && (BUILT_IN_STANDARDS as readonly string[]).includes(value);
}

function cleanDivision(value: unknown) {
    const division = String(value || '').trim();
    return division || null;
}

function isAttendanceDepartment(value: unknown): value is typeof ATTENDANCE_DEPARTMENTS[number] {
    return typeof value === 'string' && (ATTENDANCE_DEPARTMENTS as readonly string[]).includes(value);
}

function invalidatePlacementCaches() {
    invalidateCacheByPrefix('academic-placements:');
    invalidateCacheByPrefix('attendance:');
    invalidateCacheByPrefix('students:');
    invalidateCacheByPrefix('staff:');
    invalidateCacheByPrefix('reports:');
}

export const getPlacementAcademicYears = async (_req: Request, res: Response) => {
    try {
        const result = await cachedResult(
            'academic-placements:years',
            10 * 60_000,
            () => db.query('SELECT id, name, start_date, end_date, is_current FROM academic_years ORDER BY start_date DESC'),
        );
        return res.json({ success: true, data: result.rows, standards: BUILT_IN_STANDARDS });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getAcademicPlacements = async (req: Request, res: Response) => {
    try {
        const academicYearId = String(req.query.academic_year_id || '');
        if (!academicYearId) return res.status(400).json({ success: false, error: 'academic_year_id is required' });
        const search = String(req.query.search || '').trim();
        const params: unknown[] = [academicYearId];
        let filter = `s.status = 'active'`;
        if (search) {
            params.push(`%${search}%`);
            filter += ` AND (s.name ILIKE $${params.length} OR s.adm_no ILIKE $${params.length})`;
        }
        const result = await cachedResult(
            makeCacheKey('academic-placements:list', { academic_year_id: academicYearId, search }),
            2 * 60_000,
            () => db.query(
                `SELECT s.adm_no, s.name, s.photo_url,
                        COALESCE(p.standard, 'Non-class') AS standard,
                        p.division,
                        p.status AS placement_status
                 FROM students s
                 LEFT JOIN academic_student_placements p
                   ON p.student_id = s.adm_no
                  AND p.academic_year_id = $1
                  AND p.status = 'active'
                 WHERE ${filter}
                 ORDER BY CASE COALESCE(p.standard, 'Non-class')
                            WHEN '5th' THEN 1 WHEN '6th' THEN 2 WHEN '7th' THEN 3
                            WHEN '8th' THEN 4 WHEN '9th' THEN 5 WHEN '10th' THEN 6
                            WHEN 'Plus One' THEN 7 WHEN 'Plus Two' THEN 8 ELSE 9 END,
                          COALESCE(p.division, ''), s.name`,
                params,
            ),
        );
        return res.json({ success: true, data: result.rows, standards: BUILT_IN_STANDARDS });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getStandardDivisions = async (req: Request, res: Response) => {
    try {
        const academicYearId = String(req.query.academic_year_id || '');
        if (!academicYearId) return res.status(400).json({ success: false, error: 'academic_year_id is required' });
        const result = await cachedResult(
            makeCacheKey('academic-placements:divisions', { academic_year_id: academicYearId }),
            5 * 60_000,
            () => db.query(
                `SELECT id, standard, name, created_at
                 FROM academic_standard_divisions
                 WHERE academic_year_id = $1
                 ORDER BY standard, name`,
                [academicYearId],
            ),
        );
        return res.json({ success: true, data: result.rows });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const getAttendanceGroups = async (req: Request, res: Response) => {
    try {
        const academicYearId = String(req.query.academic_year_id || '');
        if (!academicYearId) return res.status(400).json({ success: false, error: 'academic_year_id is required' });

        const payload = await cachedResult(
            makeCacheKey('academic-placements:attendance-groups', { academic_year_id: academicYearId }),
            2 * 60_000,
            async () => {
                const [groups, mentors] = await Promise.all([
                    db.query(
                        `SELECT g.id, g.academic_year_id, g.department, g.standard, g.division,
                                g.mentor_id, st.name AS mentor_name,
                                COUNT(gs.student_id)::int AS student_count,
                                COALESCE(array_agg(gs.student_id ORDER BY s.name)
                                    FILTER (WHERE gs.student_id IS NOT NULL), ARRAY[]::text[]) AS student_ids
                         FROM attendance_groups g
                         LEFT JOIN staff st ON st.id = g.mentor_id
                         LEFT JOIN attendance_group_students gs ON gs.group_id = g.id
                         LEFT JOIN students s ON s.adm_no = gs.student_id
                         WHERE g.academic_year_id = $1
                         GROUP BY g.id, st.name
                         ORDER BY g.department, g.standard, g.division`,
                        [academicYearId],
                    ),
                    db.query(
                        `SELECT id, name, role
                         FROM staff
                         WHERE is_active = true AND lower(role) = ANY($1::text[])
                         ORDER BY name`,
                        [TEACHING_STAFF_ROLES],
                    ),
                ]);
                return { groups: groups.rows, mentors: mentors.rows };
            },
        );

        return res.json({
            success: true,
            data: payload.groups,
            mentors: payload.mentors,
            departments: ATTENDANCE_DEPARTMENTS,
        });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};
export const saveAttendanceGroup = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { academic_year_id, department, standard, division, mentor_id } = req.body || {};
        const requestedDivision = cleanDivision(division);
        if (!academic_year_id || !isAttendanceDepartment(department) || !isStandard(standard)) {
            return res.status(400).json({ success: false, error: 'Academic year, department, and standard are required.' });
        }

        const configuredDivisions = (await client.query(
            `SELECT name FROM academic_standard_divisions
             WHERE academic_year_id = $1 AND standard = $2`,
            [academic_year_id, standard],
        )).rows.map((row: any) => row.name);
        const hasConfiguredDivisions = configuredDivisions.length > 0;
        let normalizedDivision = requestedDivision;

        if (!normalizedDivision || normalizedDivision === NO_DIVISION_ROSTER) {
            if (hasConfiguredDivisions) {
                return res.status(400).json({ success: false, error: 'Select a configured division for this standard.' });
            }
            normalizedDivision = NO_DIVISION_ROSTER;
        } else if (!hasConfiguredDivisions) {
            return res.status(400).json({ success: false, error: 'This standard has no configured divisions. Create a No division roster instead.' });
        } else if (!configuredDivisions.includes(normalizedDivision)) {
            return res.status(400).json({ success: false, error: 'Select a configured division for this standard.' });
        }

        await client.query('BEGIN');
        if (mentor_id) {
            const mentor = await client.query(
                `SELECT id FROM staff WHERE id = $1 AND is_active = true AND lower(role) = ANY($2::text[])`,
                [mentor_id, TEACHING_STAFF_ROLES],
            );
            if (!mentor.rows.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: 'Select an active teaching staff member.' });
            }
        }
        const result = await client.query(
            `INSERT INTO attendance_groups (academic_year_id, department, standard, division, mentor_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (academic_year_id, department, standard, division)
             DO UPDATE SET mentor_id = EXCLUDED.mentor_id, updated_at = now()
             RETURNING *`,
            [academic_year_id, department, standard, normalizedDivision, mentor_id || null],
        );
        const group = result.rows[0];
        const mentorField = MENTOR_FIELD_BY_DEPARTMENT[department];
        await client.query(
            `UPDATE student_year_snapshots sys
             SET ${mentorField} = $2, updated_at = now()
             FROM attendance_group_students gs
             WHERE gs.group_id = $1
               AND sys.academic_year_id = gs.academic_year_id
               AND sys.student_id = gs.student_id`,
            [group.id, mentor_id || null],
        );
        const year = await client.query('SELECT is_current FROM academic_years WHERE id = $1', [academic_year_id]);
        if (year.rows[0]?.is_current) {
            await client.query(
                `UPDATE students s
                 SET ${mentorField} = $2
                 FROM attendance_group_students gs
                 WHERE gs.group_id = $1 AND s.adm_no = gs.student_id`,
                [group.id, mentor_id || null],
            );
        }
        await client.query('COMMIT');
        invalidatePlacementCaches();
        return res.status(201).json({ success: true, data: group });
    } catch (err: any) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
export const replaceAttendanceGroupStudents = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const groupId = String(req.params.id || '');
        const studentIds = Array.isArray(req.body?.student_ids)
            ? [...new Set(req.body.student_ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0))]
            : [];
        await client.query('BEGIN');
        const group = await client.query(
            `SELECT id, academic_year_id, department, standard, division, mentor_id
             FROM attendance_groups WHERE id = $1 FOR UPDATE`,
            [groupId],
        );
        if (!group.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Attendance group not found.' });
        }
        const target = group.rows[0];
        const previous = await client.query(
            'SELECT student_id FROM attendance_group_students WHERE group_id = $1',
            [groupId],
        );
        const previousIds = previous.rows.map((row: any) => row.student_id);
        if (studentIds.length) {
            const eligible = await client.query(
                `SELECT s.adm_no AS student_id
                 FROM students s
                 LEFT JOIN academic_student_placements p
                   ON p.student_id = s.adm_no
                  AND p.academic_year_id = $1
                  AND p.status = 'active'
                 WHERE s.status = 'active'
                   AND (($2 = 'Non-class' AND COALESCE(p.standard, 'Non-class') = 'Non-class') OR p.standard = $2)
                   AND (($3 = '__none' AND p.division IS NULL) OR ($3 <> '__none' AND p.division = $3))
                   AND s.adm_no = ANY($4::text[])`,
                [target.academic_year_id, target.standard, target.division, studentIds],
            );
            if (eligible.rows.length !== studentIds.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ success: false, error: 'Every selected student must match this roster standard and division in this academic year.' });
            }
        }

        await client.query('DELETE FROM attendance_group_students WHERE group_id = $1', [groupId]);
        if (studentIds.length) {
            await client.query(
                `INSERT INTO attendance_group_students (group_id, academic_year_id, department, student_id)
                 SELECT $1, $2, $3, student_id FROM unnest($4::text[]) AS student_id
                 ON CONFLICT (academic_year_id, department, student_id)
                 DO UPDATE SET group_id = EXCLUDED.group_id, created_at = now()`,
                [groupId, target.academic_year_id, target.department, studentIds],
            );
        }

        const mentorField = MENTOR_FIELD_BY_DEPARTMENT[target.department as keyof typeof MENTOR_FIELD_BY_DEPARTMENT];
        if (previousIds.length) {
            await client.query(
                `UPDATE student_year_snapshots
                 SET ${mentorField} = NULL, updated_at = now()
                 WHERE academic_year_id = $1 AND student_id = ANY($2::text[])`,
                [target.academic_year_id, previousIds],
            );
        }
        if (studentIds.length) {
            await client.query(
                `INSERT INTO student_year_snapshots (student_id, academic_year_id, ${mentorField}, status, updated_at)
                 SELECT student_id, $2, $3, 'active', now() FROM unnest($1::text[]) AS student_id
                 ON CONFLICT (student_id, academic_year_id)
                 DO UPDATE SET ${mentorField} = EXCLUDED.${mentorField}, status = 'active', updated_at = now()`,
                [studentIds, target.academic_year_id, target.mentor_id || null],
            );
        }
        const year = await client.query('SELECT is_current FROM academic_years WHERE id = $1', [target.academic_year_id]);
        if (year.rows[0]?.is_current) {
            if (previousIds.length) {
                await client.query(
                    `UPDATE students SET ${mentorField} = NULL WHERE adm_no = ANY($1::text[])`,
                    [previousIds],
                );
            }
            if (studentIds.length) {
                await client.query(
                    `UPDATE students SET ${mentorField} = $2 WHERE adm_no = ANY($1::text[])`,
                    [studentIds, target.mentor_id || null],
                );
            }
        }

        await client.query('COMMIT');
        invalidatePlacementCaches();
        return res.json({ success: true, updated: studentIds.length });
    } catch (err: any) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const deleteAttendanceGroup = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const group = await client.query(
            `SELECT id, academic_year_id, department
             FROM attendance_groups WHERE id = $1 FOR UPDATE`,
            [req.params.id],
        );
        if (!group.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Attendance group not found.' });
        }
        const target = group.rows[0];
        const members = await client.query('SELECT student_id FROM attendance_group_students WHERE group_id = $1', [target.id]);
        const studentIds = members.rows.map((row: any) => row.student_id);
        const mentorField = MENTOR_FIELD_BY_DEPARTMENT[target.department as keyof typeof MENTOR_FIELD_BY_DEPARTMENT];
        if (studentIds.length) {
            await client.query(
                `UPDATE student_year_snapshots
                 SET ${mentorField} = NULL, updated_at = now()
                 WHERE academic_year_id = $1 AND student_id = ANY($2::text[])`,
                [target.academic_year_id, studentIds],
            );
            const year = await client.query('SELECT is_current FROM academic_years WHERE id = $1', [target.academic_year_id]);
            if (year.rows[0]?.is_current) {
                await client.query(
                    `UPDATE students SET ${mentorField} = NULL WHERE adm_no = ANY($1::text[])`,
                    [studentIds],
                );
            }
        }
        await client.query('DELETE FROM attendance_groups WHERE id = $1', [target.id]);
        await client.query('COMMIT');
        invalidatePlacementCaches();
        return res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};
export const createStandardDivision = async (req: Request, res: Response) => {
    try {
        const { academic_year_id, standard, name } = req.body || {};
        const division = cleanDivision(name);
        if (!academic_year_id || !isStandard(standard) || !division) {
            return res.status(400).json({ success: false, error: 'A valid academic year, standard, and division name are required.' });
        }

        const result = await db.query(
            `INSERT INTO academic_standard_divisions (academic_year_id, standard, name)
             VALUES ($1, $2, $3)
             ON CONFLICT (academic_year_id, standard, name) DO UPDATE SET name = EXCLUDED.name
             RETURNING *`,
            [academic_year_id, standard, division],
        );
        invalidateCacheByPrefix('academic-placements:');
        return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        return res.status(500).json({ success: false, error: err.message });
    }
};

export const saveAcademicPlacements = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { academic_year_id, student_ids, standard, division } = req.body || {};
        const studentIds = Array.isArray(student_ids) ? [...new Set(student_ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))] : [];
        const normalizedDivision = cleanDivision(division);
        if (!academic_year_id || !isStandard(standard) || studentIds.length === 0) {
            return res.status(400).json({ success: false, error: 'Select at least one student and a valid standard.' });
        }

        await client.query('BEGIN');
        const updated = await client.query(
            `INSERT INTO academic_student_placements (academic_year_id, student_id, standard, division, status, updated_at)
             SELECT $1, student_id, $3, $4, 'active', now()
             FROM unnest($2::text[]) AS student_id
             JOIN students s ON s.adm_no = student_id AND s.status = 'active'
             ON CONFLICT (academic_year_id, student_id)
             DO UPDATE SET standard = EXCLUDED.standard,
                           division = EXCLUDED.division,
                           status = 'active',
                           updated_at = now()
             RETURNING student_id`,
            [academic_year_id, studentIds, standard, normalizedDivision],
        );

        const year = await client.query('SELECT is_current FROM academic_years WHERE id = $1', [academic_year_id]);
        if (year.rows[0]?.is_current) {
            await client.query(
                `UPDATE students s
                 SET standard = p.standard
                 FROM academic_student_placements p
                 WHERE p.academic_year_id = $1
                   AND p.student_id = s.adm_no
                   AND p.student_id = ANY($2::text[])`,
                [academic_year_id, studentIds],
            );
        }
        const removedGroups = await client.query(
            `SELECT gs.student_id, g.department
             FROM attendance_group_students gs
             JOIN attendance_groups g ON g.id = gs.group_id
             JOIN academic_student_placements p
               ON p.academic_year_id = g.academic_year_id
              AND p.student_id = gs.student_id
             WHERE p.academic_year_id = $1
               AND p.student_id = ANY($2::text[])
               AND p.standard <> g.standard`,
            [academic_year_id, studentIds],
        );
        await client.query(
            `DELETE FROM attendance_group_students gs
             USING attendance_groups g, academic_student_placements p
             WHERE gs.group_id = g.id
               AND p.academic_year_id = g.academic_year_id
               AND p.student_id = gs.student_id
               AND p.academic_year_id = $1
               AND p.student_id = ANY($2::text[])
               AND p.standard <> g.standard`,
            [academic_year_id, studentIds],
        );
        for (const department of ATTENDANCE_DEPARTMENTS) {
            const removedIds = removedGroups.rows
                .filter((row: any) => row.department === department)
                .map((row: any) => row.student_id);
            if (!removedIds.length) continue;
            const mentorField = MENTOR_FIELD_BY_DEPARTMENT[department];
            await client.query(
                `UPDATE student_year_snapshots
                 SET ${mentorField} = NULL, updated_at = now()
                 WHERE academic_year_id = $1 AND student_id = ANY($2::text[])`,
                [academic_year_id, removedIds],
            );
            if (year.rows[0]?.is_current) {
                await client.query(
                    `UPDATE students SET ${mentorField} = NULL WHERE adm_no = ANY($1::text[])`,
                    [removedIds],
                );
            }
        }

        await client.query(
            `INSERT INTO student_year_snapshots (student_id, academic_year_id, school_standard, school_section, status, updated_at)
             SELECT p.student_id, p.academic_year_id, p.standard, p.division, 'active', now()
             FROM academic_student_placements p
             WHERE p.academic_year_id = $1 AND p.student_id = ANY($2::text[])
             ON CONFLICT (student_id, academic_year_id)
             DO UPDATE SET school_standard = EXCLUDED.school_standard,
                           school_section = EXCLUDED.school_section,
                           status = 'active',
                           updated_at = now()`,
            [academic_year_id, studentIds],
        );
        await client.query('COMMIT');
        invalidateCacheByPrefix('academic-placements:');
        invalidateCacheByPrefix('students:');
        invalidateCacheByPrefix('reports:');
        return res.json({ success: true, updated: updated.rows.length });
    } catch (err: any) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};