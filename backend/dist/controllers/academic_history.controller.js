"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistoryHealth = exports.getMigrationReports = exports.getYearSnapshots = exports.getStudentAcademicHistory = exports.commitYearStart = exports.previewYearStart = exports.upsertAcademicYearSettings = exports.getCurrentAcademicYear = exports.getAcademicYearsWithSettings = void 0;
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
function normalizeText(value) {
    return String(value ?? '').trim();
}
function normalizeSection(value) {
    const text = normalizeText(value);
    return text ? text.toUpperCase() : null;
}
function nextStandard(value) {
    const text = normalizeText(value);
    if (!text)
        return '';
    const match = text.match(/^(\d+)(.*)$/);
    if (!match)
        return text;
    const suffix = match[2] || '';
    return `${Number(match[1]) + 1}${suffix}`;
}
function buildPromotionMap(rules, defaults) {
    const map = new Map();
    for (const item of defaults) {
        map.set(`${item.standard}|||${item.section || ''}`, {
            to_standard: nextStandard(item.standard),
            to_section: item.section || null,
        });
    }
    for (const rule of rules || []) {
        const fromStandard = normalizeText(rule.from_standard);
        if (!fromStandard)
            continue;
        const fromSection = normalizeSection(rule.from_section);
        map.set(`${fromStandard}|||${fromSection || ''}`, {
            to_standard: normalizeText(rule.to_standard) || nextStandard(fromStandard),
            to_section: normalizeSection(rule.to_section) || fromSection,
        });
    }
    return map;
}
function ruleFor(map, standard, section) {
    return map.get(`${standard}|||${section || ''}`)
        || map.get(`${standard}|||`)
        || { to_standard: nextStandard(standard), to_section: section || null };
}
function idSet(values) {
    return new Set(Array.isArray(values)
        ? values.map(value => normalizeText(value)).filter(Boolean)
        : []);
}
async function buildYearStartPreview(plan) {
    const { source_academic_year_id, target_academic_year_id } = plan;
    if (!source_academic_year_id || !target_academic_year_id) {
        throw new Error('source_academic_year_id and target_academic_year_id are required');
    }
    if (source_academic_year_id === target_academic_year_id) {
        throw new Error('Source and target academic years must be different');
    }
    const [yearRes, targetSettings, schoolDefaultsRes, madrasaDefaultsRes] = await Promise.all([
        db_1.db.query(`SELECT id, name, start_date, end_date
             FROM academic_years
             WHERE id = ANY($1::uuid[])`, [[source_academic_year_id, target_academic_year_id]]),
        db_1.db.query(`SELECT COALESCE(ays.year_locked, ay.is_locked, false) AS year_locked
             FROM academic_years ay
             LEFT JOIN academic_year_settings ays ON ays.academic_year_id = ay.id
             WHERE ay.id = $1`, [target_academic_year_id]),
        db_1.db.query(`SELECT DISTINCT school_standard AS standard, school_section AS section
             FROM student_school_enrollments
             WHERE academic_year_id = $1
               AND status = 'active'
               AND COALESCE(school_standard, '') <> ''
             ORDER BY school_standard, school_section`, [source_academic_year_id]),
        db_1.db.query(`WITH history_rows AS (
                SELECT madrasa_standard AS standard, madrasa_section AS section
                FROM student_madrasa_enrollments
                WHERE academic_year_id = $1
                  AND status = 'active'
                  AND COALESCE(madrasa_standard, '') <> ''
             ),
             fallback_rows AS (
                SELECT s.madrassa_standard AS standard, NULL::text AS section
                FROM students s
                WHERE NOT EXISTS (SELECT 1 FROM history_rows)
                  AND COALESCE(LOWER(s.status), 'active') = 'active'
                  AND COALESCE(s.madrassa_standard, '') <> ''
             )
             SELECT DISTINCT standard, section
             FROM (
                SELECT * FROM history_rows
                UNION ALL
                SELECT * FROM fallback_rows
             ) source
             ORDER BY standard, section`, [source_academic_year_id]),
    ]);
    if (yearRes.rows.length < 2)
        throw new Error('Source or target academic year not found');
    if (targetSettings.rows[0]?.year_locked)
        throw new Error('Target academic year is locked');
    const schoolMap = buildPromotionMap(plan.school_rules, schoolDefaultsRes.rows);
    const madrasaMap = buildPromotionMap(plan.madrasa_rules, madrasaDefaultsRes.rows);
    const [schoolSourceRes, madrasaSourceRes, hifzRes, existingTargetRes] = await Promise.all([
        db_1.db.query(`SELECT se.student_id, s.name, se.school_standard, se.school_section
             FROM student_school_enrollments se
             JOIN students s ON s.adm_no = se.student_id
             WHERE se.academic_year_id = $1
               AND se.status = 'active'
               AND COALESCE(LOWER(s.status), 'active') = 'active'
               AND COALESCE(se.school_standard, '') <> ''
             ORDER BY se.school_standard, se.school_section, s.name`, [source_academic_year_id]),
        db_1.db.query(`WITH history_rows AS (
                SELECT me.student_id, s.name, me.madrasa_standard, me.madrasa_section
                FROM student_madrasa_enrollments me
                JOIN students s ON s.adm_no = me.student_id
                WHERE me.academic_year_id = $1
                  AND me.status = 'active'
                  AND COALESCE(LOWER(s.status), 'active') = 'active'
                  AND COALESCE(me.madrasa_standard, '') <> ''
             ),
             fallback_rows AS (
                SELECT s.adm_no AS student_id, s.name, s.madrassa_standard AS madrasa_standard, NULL::text AS madrasa_section
                FROM students s
                WHERE NOT EXISTS (SELECT 1 FROM history_rows)
                  AND COALESCE(LOWER(s.status), 'active') = 'active'
                  AND COALESCE(s.madrassa_standard, '') <> ''
             )
             SELECT *
             FROM (
                SELECT * FROM history_rows
                UNION ALL
                SELECT * FROM fallback_rows
             ) source
             ORDER BY madrasa_standard, madrasa_section, name`, [source_academic_year_id]),
        db_1.db.query(`SELECT hp.student_id, s.name, hp.mentor_id, st.name AS mentor_name,
                    hp.hifz_group_class_id, c.name AS hifz_group_name
             FROM student_hifz_profiles hp
             JOIN students s ON s.adm_no = hp.student_id
             LEFT JOIN staff st ON st.id = hp.mentor_id
             LEFT JOIN classes c ON c.id = hp.hifz_group_class_id
             WHERE hp.active = true
               AND COALESCE(LOWER(s.status), 'active') = 'active'
             ORDER BY s.name`),
        db_1.db.query(`SELECT
                (SELECT COUNT(*)::integer FROM student_school_enrollments WHERE academic_year_id = $1) AS school,
                (SELECT COUNT(*)::integer FROM student_madrasa_enrollments WHERE academic_year_id = $1) AS madrasa,
                (SELECT COUNT(*)::integer FROM student_year_snapshots WHERE academic_year_id = $1) AS snapshots`, [target_academic_year_id]),
    ]);
    const excludedSchoolIds = idSet(plan.excluded_school_student_ids);
    const excludedMadrasaIds = idSet(plan.excluded_madrasa_student_ids);
    const excludedHifzIds = idSet(plan.excluded_hifz_student_ids);
    const all_school_students = schoolSourceRes.rows.map((row) => {
        const target = ruleFor(schoolMap, row.school_standard, row.school_section || null);
        return {
            student_id: row.student_id,
            name: row.name,
            from_standard: row.school_standard,
            from_section: row.school_section || null,
            to_standard: target.to_standard,
            to_section: target.to_section,
        };
    });
    const all_madrasa_students = madrasaSourceRes.rows.map((row) => {
        const target = ruleFor(madrasaMap, row.madrasa_standard, row.madrasa_section || null);
        return {
            student_id: row.student_id,
            name: row.name,
            from_standard: row.madrasa_standard,
            from_section: row.madrasa_section || null,
            to_standard: target.to_standard,
            to_section: target.to_section,
        };
    });
    const hifz = plan.hifz || {};
    const all_hifz_students = hifzRes.rows.map((row) => ({
        student_id: row.student_id,
        name: row.name,
        from_mentor_id: row.mentor_id || null,
        from_mentor_name: row.mentor_name || null,
        to_mentor_id: hifz.carry_mentor !== false ? (row.mentor_id || null) : (hifz.mentor_id || null),
        from_hifz_group_class_id: row.hifz_group_class_id || null,
        from_hifz_group_name: row.hifz_group_name || null,
        to_hifz_group_class_id: hifz.carry_group !== false ? (row.hifz_group_class_id || null) : (hifz.hifz_group_class_id || null),
    }));
    const school_students = all_school_students.filter((row) => !excludedSchoolIds.has(row.student_id));
    const madrasa_students = all_madrasa_students.filter((row) => !excludedMadrasaIds.has(row.student_id));
    const hifz_students = all_hifz_students.filter((row) => !excludedHifzIds.has(row.student_id));
    const touched = new Set();
    school_students.forEach((item) => touched.add(item.student_id));
    madrasa_students.forEach((item) => touched.add(item.student_id));
    hifz_students.forEach((item) => touched.add(item.student_id));
    return {
        years: yearRes.rows,
        target_existing: existingTargetRes.rows[0],
        rules: {
            school: Array.from(schoolMap.entries()).map(([key, value]) => {
                const [from_standard, from_section] = key.split('|||');
                return { from_standard, from_section: from_section || null, ...value };
            }),
            madrasa: Array.from(madrasaMap.entries()).map(([key, value]) => {
                const [from_standard, from_section] = key.split('|||');
                return { from_standard, from_section: from_section || null, ...value };
            }),
        },
        totals: {
            students_touched: touched.size,
            school_students: school_students.length,
            madrasa_students: madrasa_students.length,
            hifz_students: hifz_students.length,
            excluded_school_students: excludedSchoolIds.size,
            excluded_madrasa_students: excludedMadrasaIds.size,
            excluded_hifz_students: excludedHifzIds.size,
        },
        samples: {
            school: school_students.slice(0, 20),
            madrasa: madrasa_students.slice(0, 20),
            hifz: hifz_students.slice(0, 20),
        },
        all_school_students,
        all_madrasa_students,
        all_hifz_students,
        school_students,
        madrasa_students,
        hifz_students,
    };
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
const previewYearStart = async (req, res) => {
    try {
        const preview = await buildYearStartPreview(req.body);
        res.json({ success: true, preview });
    }
    catch (err) {
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
};
exports.previewYearStart = previewYearStart;
const commitYearStart = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const plan = req.body;
        const preview = await buildYearStartPreview(plan);
        const sourceYearId = plan.source_academic_year_id;
        const targetYearId = plan.target_academic_year_id;
        const userId = req.user?.id || null;
        await client.query('BEGIN');
        const schoolBatch = preview.school_students.length > 0
            ? await client.query(`INSERT INTO promotion_batches (from_academic_year_id, to_academic_year_id, track_type, created_by)
                 VALUES ($1, $2, 'school', $3)
                 RETURNING id`, [sourceYearId, targetYearId, userId])
            : { rows: [] };
        const madrasaBatch = preview.madrasa_students.length > 0
            ? await client.query(`INSERT INTO promotion_batches (from_academic_year_id, to_academic_year_id, track_type, created_by)
                 VALUES ($1, $2, 'madrasa', $3)
                 RETURNING id`, [sourceYearId, targetYearId, userId])
            : { rows: [] };
        let schoolCreated = 0;
        let madrasaCreated = 0;
        let schoolLogs = 0;
        let madrasaLogs = 0;
        const merged = new Map();
        for (const row of preview.school_students) {
            const result = await client.query(`INSERT INTO student_school_enrollments (
                    student_id, academic_year_id, school_standard, school_section, status, joined_at
                 )
                 VALUES ($1, $2, $3, $4, 'active', now())
                 ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                    school_standard = EXCLUDED.school_standard,
                    school_section = EXCLUDED.school_section,
                    status = 'active'
                 RETURNING (xmax = 0) AS inserted`, [row.student_id, targetYearId, row.to_standard, row.to_section || null]);
            if (result.rows[0]?.inserted)
                schoolCreated++;
            if (schoolBatch.rows[0]?.id) {
                await client.query(`INSERT INTO promotion_logs (
                        promotion_batch_id, student_id, track_type,
                        old_standard, new_standard, old_section, new_section
                     )
                     VALUES ($1, $2, 'school', $3, $4, $5, $6)`, [schoolBatch.rows[0].id, row.student_id, row.from_standard, row.to_standard, row.from_section || null, row.to_section || null]);
                schoolLogs++;
            }
            merged.set(row.student_id, {
                ...(merged.get(row.student_id) || {}),
                student_id: row.student_id,
                school_standard: row.to_standard,
                school_section: row.to_section || null,
            });
        }
        for (const row of preview.madrasa_students) {
            const result = await client.query(`INSERT INTO student_madrasa_enrollments (
                    student_id, academic_year_id, madrasa_standard, madrasa_section, status, joined_at
                 )
                 VALUES ($1, $2, $3, $4, 'active', now())
                 ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                    madrasa_standard = EXCLUDED.madrasa_standard,
                    madrasa_section = EXCLUDED.madrasa_section,
                    status = 'active'
                 RETURNING (xmax = 0) AS inserted`, [row.student_id, targetYearId, row.to_standard, row.to_section || null]);
            if (result.rows[0]?.inserted)
                madrasaCreated++;
            if (madrasaBatch.rows[0]?.id) {
                await client.query(`INSERT INTO promotion_logs (
                        promotion_batch_id, student_id, track_type,
                        old_standard, new_standard, old_section, new_section
                     )
                     VALUES ($1, $2, 'madrasa', $3, $4, $5, $6)`, [madrasaBatch.rows[0].id, row.student_id, row.from_standard, row.to_standard, row.from_section || null, row.to_section || null]);
                madrasaLogs++;
            }
            merged.set(row.student_id, {
                ...(merged.get(row.student_id) || {}),
                student_id: row.student_id,
                madrasa_standard: row.to_standard,
                madrasa_section: row.to_section || null,
            });
        }
        let hifzProfilesUpdated = 0;
        for (const row of preview.hifz_students) {
            const hifzPlan = plan.hifz || {};
            if (hifzPlan.carry_mentor === false || hifzPlan.carry_group === false) {
                await client.query(`UPDATE student_hifz_profiles
                     SET mentor_id = CASE WHEN $2::boolean THEN mentor_id ELSE $3::uuid END,
                         hifz_group_class_id = CASE WHEN $4::boolean THEN hifz_group_class_id ELSE $5::uuid END,
                         updated_at = now()
                     WHERE student_id = $1`, [
                    row.student_id,
                    hifzPlan.carry_mentor !== false,
                    row.to_mentor_id || null,
                    hifzPlan.carry_group !== false,
                    row.to_hifz_group_class_id || null,
                ]);
                hifzProfilesUpdated++;
            }
            merged.set(row.student_id, {
                ...(merged.get(row.student_id) || {}),
                student_id: row.student_id,
                hifz_mentor_id: row.to_mentor_id || null,
                hifz_group_class_id: row.to_hifz_group_class_id || null,
            });
        }
        let snapshotsCreated = 0;
        for (const row of Array.from(merged.values())) {
            const result = await client.query(`INSERT INTO student_year_snapshots (
                    student_id, academic_year_id,
                    school_standard, school_section,
                    madrasa_standard, madrasa_section,
                    hifz_mentor_id, hifz_group_class_id,
                    status, updated_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now())
                 ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                    school_standard = COALESCE(EXCLUDED.school_standard, student_year_snapshots.school_standard),
                    school_section = COALESCE(EXCLUDED.school_section, student_year_snapshots.school_section),
                    madrasa_standard = COALESCE(EXCLUDED.madrasa_standard, student_year_snapshots.madrasa_standard),
                    madrasa_section = COALESCE(EXCLUDED.madrasa_section, student_year_snapshots.madrasa_section),
                    hifz_mentor_id = COALESCE(EXCLUDED.hifz_mentor_id, student_year_snapshots.hifz_mentor_id),
                    hifz_group_class_id = COALESCE(EXCLUDED.hifz_group_class_id, student_year_snapshots.hifz_group_class_id),
                    status = 'active',
                    updated_at = now()
                 RETURNING (xmax = 0) AS inserted`, [
                row.student_id,
                targetYearId,
                row.school_standard || null,
                row.school_section || null,
                row.madrasa_standard || null,
                row.madrasa_section || null,
                row.hifz_mentor_id || null,
                row.hifz_group_class_id || null,
            ]);
            if (result.rows[0]?.inserted)
                snapshotsCreated++;
        }
        const reportRes = await client.query(`INSERT INTO academic_year_migration_reports (
                migration_name,
                academic_year_id,
                total_students,
                school_enrollments_created,
                madrasa_enrollments_created,
                hifz_profiles_created,
                snapshots_created,
                skipped_missing_standard,
                warnings
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8::jsonb)
             RETURNING *`, [
            'year_start_wizard',
            targetYearId,
            preview.totals.students_touched,
            schoolCreated,
            madrasaCreated,
            hifzProfilesUpdated,
            snapshotsCreated,
            JSON.stringify([
                'Year Start Wizard created/updated enrollment history and target-year snapshots only.',
                'attendance_marks, student_attendance_marks, attendance_schedules, hifz_logs, student_leaves, and monthly_reports were not modified.',
                `Excluded from this run: school=${preview.totals.excluded_school_students || 0}, madrasa=${preview.totals.excluded_madrasa_students || 0}, hifz=${preview.totals.excluded_hifz_students || 0}.`,
                `Promotion logs created: school=${schoolLogs}, madrasa=${madrasaLogs}.`,
            ]),
        ]);
        await client.query(`INSERT INTO academic_year_settings (academic_year_id, promotion_completed, updated_at)
             VALUES ($1, true, now())
             ON CONFLICT (academic_year_id) DO UPDATE SET
                promotion_completed = true,
                updated_at = now()`, [targetYearId]);
        await client.query('COMMIT');
        res.json({
            success: true,
            report: reportRes.rows[0],
            totals: {
                ...preview.totals,
                school_enrollments_created: schoolCreated,
                madrasa_enrollments_created: madrasaCreated,
                hifz_profiles_updated: hifzProfilesUpdated,
                snapshots_created: snapshotsCreated,
                school_promotion_logs: schoolLogs,
                madrasa_promotion_logs: madrasaLogs,
            },
        });
    }
    catch (err) {
        await client.query('ROLLBACK');
        const message = missingHistoryLayerMessage(err);
        res.status(message ? 428 : 500).json({ success: false, error: message || err.message });
    }
    finally {
        client.release();
    }
};
exports.commitYearStart = commitYearStart;
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
