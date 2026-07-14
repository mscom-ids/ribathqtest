"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyPreviousYearPlacements = void 0;
const db_1 = require("../config/db");
const server_cache_1 = require("../utils/server-cache");
/**
 * Carry the previous year's student standards and divisions forward unchanged.
 * It intentionally does not copy timetables, attendance, or mentor assignments.
 */
const copyPreviousYearPlacements = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const targetAcademicYearId = req.params.id;
        const requestedSourceYearId = req.body?.source_academic_year_id;
        const targetRes = await client.query('SELECT id, name, start_date FROM academic_years WHERE id = $1', [targetAcademicYearId]);
        if (!targetRes.rows.length)
            return res.status(404).json({ success: false, error: 'Academic year not found.' });
        const sourceRes = requestedSourceYearId
            ? await client.query('SELECT id, name FROM academic_years WHERE id = $1 AND id <> $2', [requestedSourceYearId, targetAcademicYearId])
            : await client.query(`SELECT id, name FROM academic_years
                 WHERE id <> $1 AND start_date < $2
                 ORDER BY start_date DESC LIMIT 1`, [targetAcademicYearId, targetRes.rows[0].start_date]);
        if (!sourceRes.rows.length)
            return res.status(400).json({ success: false, error: 'No earlier academic year is available to copy.' });
        const sourceAcademicYearId = sourceRes.rows[0].id;
        await client.query('BEGIN');
        const copiedDivisions = await client.query(`INSERT INTO academic_standard_divisions (academic_year_id, standard, name)
             SELECT $1, standard, name
             FROM academic_standard_divisions
             WHERE academic_year_id = $2
             ON CONFLICT (academic_year_id, standard, name) DO NOTHING
             RETURNING id`, [targetAcademicYearId, sourceAcademicYearId]);
        const copiedPlacements = await client.query(`INSERT INTO academic_student_placements (academic_year_id, student_id, standard, division, status, created_at, updated_at)
             SELECT $1, source.student_id, source.standard, source.division, 'active', now(), now()
             FROM academic_student_placements source
             JOIN students s ON s.adm_no = source.student_id AND s.status = 'active'
             WHERE source.academic_year_id = $2 AND source.status = 'active'
             ON CONFLICT (academic_year_id, student_id) DO NOTHING
             RETURNING student_id`, [targetAcademicYearId, sourceAcademicYearId]);
        const copiedSnapshots = await client.query(`INSERT INTO student_year_snapshots (
                student_id, academic_year_id, school_standard, school_section,
                hifz_mentor_id, school_mentor_id, madrasa_mentor_id, status, updated_at
             )
             SELECT p.student_id, $1, p.standard, p.division, NULL, NULL, NULL, 'active', now()
             FROM academic_student_placements p
             WHERE p.academic_year_id = $1
             ON CONFLICT (student_id, academic_year_id)
             DO UPDATE SET school_standard = EXCLUDED.school_standard,
                           school_section = EXCLUDED.school_section,
                           hifz_mentor_id = NULL,
                           school_mentor_id = NULL,
                           madrasa_mentor_id = NULL,
                           updated_at = now()
             RETURNING student_id`, [targetAcademicYearId]);
        await client.query('COMMIT');
        (0, server_cache_1.invalidateCacheByPrefix)('academic-year:');
        (0, server_cache_1.invalidateCacheByPrefix)('academic-placements:');
        (0, server_cache_1.invalidateCacheByPrefix)('students:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:');
        return res.json({
            success: true,
            data: {
                source_academic_year: sourceRes.rows[0].name,
                target_academic_year: targetRes.rows[0].name,
                divisions_copied: copiedDivisions.rows.length,
                placements_copied: copiedPlacements.rows.length,
                snapshots_updated: copiedSnapshots.rows.length,
            },
        });
    }
    catch (err) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.copyPreviousYearPlacements = copyPreviousYearPlacements;
