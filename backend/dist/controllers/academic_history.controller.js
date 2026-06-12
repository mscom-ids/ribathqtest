"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistoryHealth = exports.getMigrationReports = exports.getYearSnapshots = exports.getStudentAcademicHistory = exports.upsertAcademicYearSettings = exports.getCurrentAcademicYear = exports.getAcademicYearsWithSettings = void 0;
const db_1 = require("../config/db");
const academic_year_1 = require("../utils/academic-year");
function numberParam(value, fallback, max) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed < 0)
        return fallback;
    return Math.min(parsed, max);
}
function missingHistoryLayerMessage(error) {
    if (error?.code !== '42P01')
        return null;
    return 'Academic history tables are not available yet. Apply the academic-year history migrations first.';
}
const getAcademicYearsWithSettings = async (_req, res) => {
    try {
        const result = await db_1.db.query(`SELECT ay.*,
                    ays.id AS settings_id,
                    COALESCE(ays.year_locked, ay.is_locked, false) AS year_locked,
                    COALESCE(ays.promotion_completed, false) AS promotion_completed,
                    ays.school_fee_plan_id,
                    ays.madrasa_fee_plan_id,
                    ays.updated_at AS settings_updated_at
             FROM academic_years ay
             LEFT JOIN academic_year_settings ays ON ays.academic_year_id = ay.id
             ORDER BY ay.start_date DESC`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getAcademicYearsWithSettings = getAcademicYearsWithSettings;
const getCurrentAcademicYear = async (req, res) => {
    try {
        const context = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
        if (!context.academicYearId) {
            return res.json({ success: true, context, academic_year: null, settings: null });
        }
        const result = await db_1.db.query(`SELECT ay.*,
                    ays.id AS settings_id,
                    COALESCE(ays.year_locked, ay.is_locked, false) AS year_locked,
                    COALESCE(ays.promotion_completed, false) AS promotion_completed,
                    ays.school_fee_plan_id,
                    ays.madrasa_fee_plan_id
             FROM academic_years ay
             LEFT JOIN academic_year_settings ays ON ays.academic_year_id = ay.id
             WHERE ay.id = $1
             LIMIT 1`, [context.academicYearId]);
        res.json({ success: true, context, academic_year: result.rows[0] || null });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getCurrentAcademicYear = getCurrentAcademicYear;
const upsertAcademicYearSettings = async (req, res) => {
    try {
        const { academic_year_id, school_fee_plan_id, madrasa_fee_plan_id, promotion_completed, year_locked } = req.body;
        if (!academic_year_id) {
            return res.status(400).json({ success: false, error: 'academic_year_id is required' });
        }
        const result = await db_1.db.query(`INSERT INTO academic_year_settings (
                academic_year_id,
                school_fee_plan_id,
                madrasa_fee_plan_id,
                promotion_completed,
                year_locked,
                updated_at
             )
             VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, false), now())
             ON CONFLICT (academic_year_id) DO UPDATE SET
                school_fee_plan_id = EXCLUDED.school_fee_plan_id,
                madrasa_fee_plan_id = EXCLUDED.madrasa_fee_plan_id,
                promotion_completed = EXCLUDED.promotion_completed,
                year_locked = EXCLUDED.year_locked,
                updated_at = now()
             RETURNING *`, [
            academic_year_id,
            school_fee_plan_id || null,
            madrasa_fee_plan_id || null,
            promotion_completed,
            year_locked,
        ]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.upsertAcademicYearSettings = upsertAcademicYearSettings;
const getStudentAcademicHistory = async (req, res) => {
    try {
        const { studentId } = req.params;
        const [studentRes, schoolRes, madrasaRes, hifzRes, snapshotRes] = await Promise.all([
            db_1.db.query(`SELECT adm_no, name, status, standard, batch_year, hifz_mentor_id, school_mentor_id, madrasa_mentor_id
                 FROM students
                 WHERE adm_no = $1`, [studentId]),
            db_1.db.query(`SELECT se.*, ay.name AS academic_year_name, ay.start_date, ay.end_date
                 FROM student_school_enrollments se
                 JOIN academic_years ay ON ay.id = se.academic_year_id
                 WHERE se.student_id = $1
                 ORDER BY ay.start_date DESC`, [studentId]),
            db_1.db.query(`SELECT me.*, ay.name AS academic_year_name, ay.start_date, ay.end_date
                 FROM student_madrasa_enrollments me
                 JOIN academic_years ay ON ay.id = me.academic_year_id
                 WHERE me.student_id = $1
                 ORDER BY ay.start_date DESC`, [studentId]),
            db_1.db.query(`SELECT hp.*, st.name AS mentor_name
                 FROM student_hifz_profiles hp
                 LEFT JOIN staff st ON st.id = hp.mentor_id
                 WHERE hp.student_id = $1
                 LIMIT 1`, [studentId]),
            db_1.db.query(`SELECT sys.*, ay.name AS academic_year_name, ay.start_date, ay.end_date
                 FROM student_year_snapshots sys
                 JOIN academic_years ay ON ay.id = sys.academic_year_id
                 WHERE sys.student_id = $1
                 ORDER BY ay.start_date DESC`, [studentId]),
        ]);
        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        res.json({
            success: true,
            student: studentRes.rows[0],
            school_enrollments: schoolRes.rows,
            madrasa_enrollments: madrasaRes.rows,
            hifz_profile: hifzRes.rows[0] || null,
            snapshots: snapshotRes.rows,
        });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getStudentAcademicHistory = getStudentAcademicHistory;
const getYearSnapshots = async (req, res) => {
    try {
        const context = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
        if (!context.academicYearId) {
            return res.json({ success: true, data: [], pagination: { total: 0, limit: 0, offset: 0 } });
        }
        const limit = numberParam(req.query.limit, 100, 500);
        const offset = numberParam(req.query.offset, 0, 100000);
        const search = String(req.query.search || '').trim();
        const params = [context.academicYearId];
        const whereParts = ['sys.academic_year_id = $1'];
        if (search) {
            params.push(`%${search}%`);
            whereParts.push(`(s.name ILIKE $${params.length} OR s.adm_no ILIKE $${params.length} OR sys.school_standard ILIKE $${params.length})`);
        }
        const where = whereParts.join(' AND ');
        const [rowsRes, countRes] = await Promise.all([
            db_1.db.query(`SELECT sys.*, s.name, s.photo_url, s.batch_year
                 FROM student_year_snapshots sys
                 JOIN students s ON s.adm_no = sys.student_id
                 WHERE ${where}
                 ORDER BY sys.school_standard NULLS LAST, sys.school_section NULLS LAST, s.name ASC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
            db_1.db.query(`SELECT COUNT(*)::integer AS total
                 FROM student_year_snapshots sys
                 JOIN students s ON s.adm_no = sys.student_id
                 WHERE ${where}`, params),
        ]);
        res.json({
            success: true,
            academic_year_id: context.academicYearId,
            academic_year_mode: context.mode,
            data: rowsRes.rows,
            pagination: { total: countRes.rows[0]?.total || 0, limit, offset },
        });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getYearSnapshots = getYearSnapshots;
const getMigrationReports = async (_req, res) => {
    try {
        const result = await db_1.db.query(`SELECT *
             FROM academic_year_migration_reports
             ORDER BY created_at DESC
             LIMIT 20`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getMigrationReports = getMigrationReports;
const getHistoryHealth = async (req, res) => {
    try {
        const context = await (0, academic_year_1.getAcademicYearContext)(db_1.db, req.query.academic_year_id);
        const result = await db_1.db.query(`WITH active_students AS (
                SELECT adm_no
                FROM students
                WHERE COALESCE(LOWER(status), 'active') = 'active'
             )
             SELECT
                (SELECT COUNT(*)::integer FROM active_students) AS active_students,
                (SELECT COUNT(*)::integer FROM student_school_enrollments WHERE academic_year_id = $1) AS school_enrollments,
                (SELECT COUNT(*)::integer FROM student_madrasa_enrollments WHERE academic_year_id = $1) AS madrasa_enrollments,
                (SELECT COUNT(*)::integer FROM student_year_snapshots WHERE academic_year_id = $1) AS snapshots,
                (SELECT COUNT(*)::integer FROM student_hifz_profiles WHERE active = true) AS active_hifz_profiles,
                (SELECT COUNT(*)::integer
                 FROM active_students s
                 WHERE NOT EXISTS (
                    SELECT 1
                    FROM student_year_snapshots sys
                    WHERE sys.student_id = s.adm_no
                      AND sys.academic_year_id = $1
                 )) AS active_students_missing_snapshot`, [context.academicYearId]);
        res.json({ success: true, academic_year_id: context.academicYearId, academic_year_mode: context.mode, health: result.rows[0] });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.getHistoryHealth = getHistoryHealth;
