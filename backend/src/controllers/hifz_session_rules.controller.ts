import { Request, Response } from 'express';
import { db } from '../config/db';

function slugCode(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function cleanText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
}

export const getHifzSessionSetup = async (req: Request, res: Response) => {
    try {
        const academicYearId = String(req.query.academic_year_id || '').trim();
        if (!academicYearId) return res.status(400).json({ success: false, error: 'academic_year_id is required' });

        const [sessionsRes, rulesRes, overridesRes] = await Promise.all([
            db.query(
                `SELECT *
                 FROM hifz_sessions
                 WHERE academic_year_id = $1
                 ORDER BY sort_order, name`,
                [academicYearId]
            ),
            db.query(
                `SELECT r.*, s.name AS session_name, st.name AS mentor_name
                 FROM hifz_session_rules r
                 JOIN hifz_sessions s ON s.id = r.hifz_session_id
                 LEFT JOIN staff st ON st.id = r.mentor_id
                 WHERE r.academic_year_id = $1
                 ORDER BY r.standard, r.section NULLS FIRST, s.sort_order, s.name`,
                [academicYearId]
            ),
            db.query(
                `SELECT a.*, hs.name AS session_name, st.name AS student_name
                 FROM student_hifz_session_assignments a
                 JOIN hifz_sessions hs ON hs.id = a.hifz_session_id
                 JOIN students st ON st.adm_no = a.student_id
                 WHERE a.academic_year_id = $1
                 ORDER BY st.name, hs.sort_order, hs.name`,
                [academicYearId]
            ),
        ]);

        res.json({
            success: true,
            sessions: sessionsRes.rows,
            rules: rulesRes.rows,
            overrides: overridesRes.rows,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertHifzSession = async (req: Request, res: Response) => {
    try {
        const { id, academic_year_id, name, start_time, end_time, sort_order, is_active } = req.body;
        if (!academic_year_id || !cleanText(name)) {
            return res.status(400).json({ success: false, error: 'academic_year_id and name are required' });
        }
        const code = slugCode(req.body.code || name);

        const result = id
            ? await db.query(
                `UPDATE hifz_sessions
                 SET name=$1, code=$2, start_time=$3, end_time=$4, sort_order=$5,
                     is_active=COALESCE($6, true), updated_at=now()
                 WHERE id=$7
                 RETURNING *`,
                [cleanText(name), code, cleanText(start_time), cleanText(end_time), Number(sort_order) || 0, is_active !== false, id]
            )
            : await db.query(
                `INSERT INTO hifz_sessions (academic_year_id, name, code, start_time, end_time, sort_order, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, true))
                 RETURNING *`,
                [academic_year_id, cleanText(name), code, cleanText(start_time), cleanText(end_time), Number(sort_order) || 0, is_active !== false]
            );

        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const bulkSaveHifzSessionRules = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { academic_year_id, rules } = req.body;
        if (!academic_year_id || !Array.isArray(rules)) {
            return res.status(400).json({ success: false, error: 'academic_year_id and rules[] are required' });
        }

        await client.query('BEGIN');
        let saved = 0;

        for (const rule of rules) {
            const standard = cleanText(rule.standard);
            const sessionId = cleanText(rule.hifz_session_id);
            if (!standard || !sessionId) continue;

            if (rule.enabled === false || rule.is_active === false) {
                await client.query(
                    `UPDATE hifz_session_rules
                     SET is_active = false, updated_at = now()
                     WHERE academic_year_id = $1
                       AND hifz_session_id = $2
                       AND standard = $3
                       AND COALESCE(section, '') = COALESCE($4, '')
                       AND COALESCE(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid) =
                           COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
                    [academic_year_id, sessionId, standard, cleanText(rule.section), cleanText(rule.mentor_id)]
                );
                continue;
            }

            const updateRes = await client.query(
                `UPDATE hifz_session_rules
                 SET effective_from = $6,
                     effective_until = $7,
                     is_active = true,
                     updated_at = now()
                 WHERE academic_year_id = $1
                   AND hifz_session_id = $2
                   AND standard = $3
                   AND COALESCE(section, '') = COALESCE($4, '')
                   AND COALESCE(mentor_id, '00000000-0000-0000-0000-000000000000'::uuid) =
                       COALESCE($5::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
                [
                    academic_year_id,
                    sessionId,
                    standard,
                    cleanText(rule.section),
                    cleanText(rule.mentor_id),
                    cleanText(rule.effective_from),
                    cleanText(rule.effective_until),
                ]
            );
            if ((updateRes.rowCount || 0) === 0) {
                await client.query(
                    `INSERT INTO hifz_session_rules (
                        academic_year_id, hifz_session_id, standard, section, mentor_id,
                        effective_from, effective_until, is_active, updated_at
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())`,
                    [
                        academic_year_id,
                        sessionId,
                        standard,
                        cleanText(rule.section),
                        cleanText(rule.mentor_id),
                        cleanText(rule.effective_from),
                        cleanText(rule.effective_until),
                    ]
                );
            }
            saved++;
        }

        await client.query('COMMIT');
        res.json({ success: true, saved });
    } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const upsertStudentHifzSessionAssignment = async (req: Request, res: Response) => {
    try {
        const {
            academic_year_id, student_id, hifz_session_id, assignment_type,
            reason, effective_from, effective_until, is_active,
        } = req.body;
        if (!academic_year_id || !student_id || !hifz_session_id || !['include', 'exclude'].includes(assignment_type)) {
            return res.status(400).json({ success: false, error: 'academic_year_id, student_id, hifz_session_id, and valid assignment_type are required' });
        }

        const result = await db.query(
            `INSERT INTO student_hifz_session_assignments (
                academic_year_id, student_id, hifz_session_id, assignment_type,
                reason, effective_from, effective_until, is_active, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, true), now())
             ON CONFLICT (academic_year_id, student_id, hifz_session_id)
             DO UPDATE SET
                assignment_type = EXCLUDED.assignment_type,
                reason = EXCLUDED.reason,
                effective_from = EXCLUDED.effective_from,
                effective_until = EXCLUDED.effective_until,
                is_active = EXCLUDED.is_active,
                updated_at = now()
             RETURNING *`,
            [
                academic_year_id,
                student_id,
                hifz_session_id,
                assignment_type,
                cleanText(reason),
                cleanText(effective_from),
                cleanText(effective_until),
                is_active !== false,
            ]
        );

        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
