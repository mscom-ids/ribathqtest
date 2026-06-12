"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkAssignHifzClass = exports.createManualClassEvent = exports.updateClassEventStatus = exports.generateDailyEvents = exports.getClassEvents = exports.deleteWeeklySchedule = exports.upsertWeeklySchedule = exports.getWeeklySchedule = exports.deleteEnrollment = exports.enrollStudent = exports.getEnrollments = exports.executePromotion = exports.getPromotionStudents = exports.deleteClass = exports.upsertClass = exports.upsertStudentClassAssignment = exports.getStudentClassAssignments = exports.getClassStudents = exports.getClasses = exports.deleteAcademicYear = exports.upsertAcademicYear = exports.getAcademicYears = void 0;
const db_1 = require("../config/db");
const server_cache_1 = require("../utils/server-cache");
function normalizeDepartment(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'madrasa' || raw === 'madrassa')
        return 'Madrassa';
    if (raw === 'hifz')
        return 'Hifz';
    return 'School';
}
function classDisplayName(type, standard, section, name) {
    if (name && String(name).trim())
        return String(name).trim();
    if (type === 'Hifz')
        return standard || 'Hifz Group';
    return [standard, section].filter(Boolean).join(' ').trim();
}
// --- ACADEMIC YEARS ---
const getAcademicYears = async (req, res) => {
    try {
        const rows = await (0, server_cache_1.cachedResult)('classes:academic-years', 5 * 60000, async () => {
            const result = await db_1.db.query('SELECT * FROM academic_years ORDER BY start_date DESC');
            return result.rows;
        });
        res.json({ success: true, data: rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getAcademicYears = getAcademicYears;
async function syncCurrentYearMentorAssignments(academicYearId) {
    await db_1.db.query(`WITH snapshot_values AS (
            SELECT student_id, hifz_mentor_id, school_mentor_id, madrasa_mentor_id
            FROM student_year_snapshots
            WHERE academic_year_id = $1
         )
         UPDATE students s
         SET hifz_mentor_id = sv.hifz_mentor_id,
             school_mentor_id = sv.school_mentor_id,
             madrasa_mentor_id = sv.madrasa_mentor_id
         FROM snapshot_values sv
         WHERE s.adm_no = sv.student_id
           AND s.status = 'active'`, [academicYearId]);
    await db_1.db.query(`UPDATE students s
         SET hifz_mentor_id = NULL,
             school_mentor_id = NULL,
             madrasa_mentor_id = NULL
         WHERE s.status = 'active'
           AND NOT EXISTS (
               SELECT 1
               FROM student_year_snapshots sys
               WHERE sys.student_id = s.adm_no
                 AND sys.academic_year_id = $1
           )
           AND (
               s.hifz_mentor_id IS NOT NULL
               OR s.school_mentor_id IS NOT NULL
               OR s.madrasa_mentor_id IS NOT NULL
           )`, [academicYearId]);
}
const upsertAcademicYear = async (req, res) => {
    try {
        const { id, name, start_date, end_date, is_current, is_locked, promotion_window_open } = req.body;
        if (is_current) {
            await db_1.db.query('UPDATE academic_years SET is_current = false WHERE ($1::uuid IS NULL OR id <> $1::uuid)', [id || null]);
        }
        let result;
        if (id) {
            result = await db_1.db.query(`UPDATE academic_years SET name=$1, start_date=$2, end_date=$3, is_current=$4, is_locked=$5, promotion_window_open=$6 WHERE id=$7 RETURNING *`, [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false, id]);
        }
        else {
            result = await db_1.db.query(`INSERT INTO academic_years (name, start_date, end_date, is_current, is_locked, promotion_window_open) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false]);
        }
        if (is_current && result.rows[0]?.id) {
            await syncCurrentYearMentorAssignments(result.rows[0].id);
        }
        (0, server_cache_1.invalidateCacheByPrefix)('academic-year:');
        (0, server_cache_1.invalidateCacheByPrefix)('classes:');
        (0, server_cache_1.invalidateCacheByPrefix)('students:');
        (0, server_cache_1.invalidateCacheByPrefix)('attendance:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:');
        return res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertAcademicYear = upsertAcademicYear;
const deleteAcademicYear = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM academic_years WHERE id = $1', [req.params.id]);
        (0, server_cache_1.invalidateCacheByPrefix)('classes:');
        (0, server_cache_1.invalidateCacheByPrefix)('academic-year:');
        (0, server_cache_1.invalidateCacheByPrefix)('students:');
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteAcademicYear = deleteAcademicYear;
// --- CLASSES ---
const getClasses = async (req, res) => {
    try {
        const { academic_year_id, type, include_archived } = req.query;
        const rows = await (0, server_cache_1.cachedResult)((0, server_cache_1.makeCacheKey)('classes:list', { academic_year_id, type, include_archived }), 60000, async () => {
            let query = 'SELECT * FROM classes WHERE 1=1';
            const params = [];
            if (academic_year_id) {
                params.push(academic_year_id);
                query += ` AND academic_year_id = $${params.length}`;
            }
            if (type && type !== 'all') {
                params.push(normalizeDepartment(type));
                query += ` AND type = $${params.length}`;
            }
            if (include_archived !== 'true') {
                query += ' AND COALESCE(is_archived, false) = false';
            }
            query += ' ORDER BY type, standard NULLS LAST, section NULLS LAST, name';
            const result = await db_1.db.query(query, params);
            return result.rows;
        });
        res.json({ success: true, data: rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getClasses = getClasses;
const getClassStudents = async (req, res) => {
    try {
        const { id } = req.params;
        const classRes = await db_1.db.query('SELECT * FROM classes WHERE id = $1', [id]);
        if (classRes.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Class not found' });
        const klass = classRes.rows[0];
        let result;
        if (klass.type === 'School') {
            result = await db_1.db.query(`SELECT se.id, se.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        se.school_standard AS standard, se.school_section AS section
                 FROM student_school_enrollments se
                 JOIN students s ON s.adm_no = se.student_id
                 WHERE se.academic_year_id = $1
                   AND se.school_standard = $2
                   AND COALESCE(se.school_section, '') = COALESCE($3, '')
                   AND se.status = 'active'
                 ORDER BY s.name`, [klass.academic_year_id, klass.standard, klass.section || '']);
        }
        else if (klass.type === 'Madrassa') {
            result = await db_1.db.query(`SELECT me.id, me.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        me.madrasa_standard AS standard, me.madrasa_section AS section
                 FROM student_madrasa_enrollments me
                 JOIN students s ON s.adm_no = me.student_id
                 WHERE me.academic_year_id = $1
                   AND me.madrasa_standard = $2
                   AND COALESCE(me.madrasa_section, '') = COALESCE($3, '')
                   AND me.status = 'active'
                 ORDER BY s.name`, [klass.academic_year_id, klass.standard, klass.section || '']);
        }
        else {
            result = await db_1.db.query(`SELECT hp.id, hp.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        c.name AS group_name
                 FROM student_hifz_profiles hp
                 JOIN students s ON s.adm_no = hp.student_id
                 LEFT JOIN classes c ON c.id = hp.hifz_group_class_id
                 WHERE hp.hifz_group_class_id = $1
                   AND hp.active = true
                 ORDER BY s.name`, [id]);
        }
        res.json({ success: true, class: klass, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getClassStudents = getClassStudents;
const getStudentClassAssignments = async (req, res) => {
    try {
        const { academic_year_id, search } = req.query;
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        if (!academic_year_id)
            return res.status(400).json({ success: false, error: 'academic_year_id is required' });
        const params = [academic_year_id];
        const countParams = [];
        const whereParts = [`s.status = 'active'`];
        const countWhereParts = [`s.status = 'active'`];
        if (search) {
            params.push(`%${search}%`);
            whereParts.push(`(s.name ILIKE $${params.length} OR s.adm_no ILIKE $${params.length})`);
            countParams.push(`%${search}%`);
            countWhereParts.push(`(s.name ILIKE $${countParams.length} OR s.adm_no ILIKE $${countParams.length})`);
        }
        const where = whereParts.join(' AND ');
        const countWhere = countWhereParts.join(' AND ');
        const result = await db_1.db.query(`SELECT s.adm_no, s.name, s.photo_url, s.standard,
                    sc.id AS school_class_id,
                    sc.name AS school_class_name,
                    sc.standard AS school_standard,
                    sc.section AS school_section,
                    mc.id AS madrasa_class_id,
                    mc.name AS madrasa_class_name,
                    mc.standard AS madrasa_standard,
                    mc.section AS madrasa_section,
                    COALESCE(he.hifz_class_ids, '[]'::json) AS hifz_class_ids,
                    hp.hifz_group_class_id AS hifz_class_id,
                    hc.name AS hifz_group_name
             FROM students s
             LEFT JOIN student_school_enrollments se
               ON se.student_id = s.adm_no AND se.academic_year_id = $1 AND se.status = 'active'
             LEFT JOIN classes sc
               ON sc.academic_year_id = se.academic_year_id
              AND sc.type = 'School'
              AND sc.standard = se.school_standard
              AND COALESCE(sc.section, '') = COALESCE(se.school_section, '')
              AND COALESCE(sc.is_archived, false) = false
             LEFT JOIN student_madrasa_enrollments me
               ON me.student_id = s.adm_no AND me.academic_year_id = $1 AND me.status = 'active'
             LEFT JOIN classes mc
               ON mc.academic_year_id = me.academic_year_id
              AND mc.type = 'Madrassa'
              AND mc.standard = me.madrasa_standard
              AND COALESCE(mc.section, '') = COALESCE(me.madrasa_section, '')
              AND COALESCE(mc.is_archived, false) = false
             LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
             LEFT JOIN classes hc ON hc.id = hp.hifz_group_class_id
             LEFT JOIN (
                 SELECT e.student_id, json_agg(e.class_id) AS hifz_class_ids
                 FROM enrollments e
                 JOIN classes c ON e.class_id = c.id
                 WHERE c.type = 'Hifz' AND e.academic_year_id = $1
                 GROUP BY e.student_id
             ) he ON he.student_id = s.adm_no
             WHERE ${where}
             ORDER BY s.name
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
        const countRes = await db_1.db.query(`SELECT COUNT(*)::integer AS total FROM students s WHERE ${countWhere}`, countParams);
        res.json({ success: true, data: result.rows, pagination: { total: countRes.rows[0]?.total || 0, limit, offset } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getStudentClassAssignments = getStudentClassAssignments;
const upsertStudentClassAssignment = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { student_id, academic_year_id, school_class_id, madrasa_class_id, hifz_class_id, hifz_class_ids } = req.body;
        if (!student_id || !academic_year_id)
            return res.status(400).json({ success: false, error: 'student_id and academic_year_id are required' });
        // Determine which departments were explicitly included in this request.
        // This allows partial updates: updating school won't touch hifz, and vice versa.
        const has = (key) => Object.prototype.hasOwnProperty.call(req.body, key);
        const schoolProvided = has('school_class_id');
        const madrasaProvided = has('madrasa_class_id');
        const hifzProvided = has('hifz_class_ids') || has('hifz_class_id');
        let effectiveHifzClassIds = [];
        if (hifzProvided) {
            if (Array.isArray(hifz_class_ids))
                effectiveHifzClassIds = hifz_class_ids.filter(Boolean);
            else if (hifz_class_id)
                effectiveHifzClassIds = [hifz_class_id];
        }
        await client.query('BEGIN');
        // Fetch only the classes we actually need
        const classIds = [
            ...(schoolProvided && school_class_id ? [school_class_id] : []),
            ...(madrasaProvided && madrasa_class_id ? [madrasa_class_id] : []),
            ...effectiveHifzClassIds,
        ].filter(Boolean);
        const classesRes = classIds.length
            ? await client.query(`SELECT * FROM classes WHERE id = ANY($1::uuid[])`, [classIds])
            : { rows: [] };
        const classesById = new Map(classesRes.rows.map((r) => [r.id, r]));
        const schoolClass = school_class_id ? classesById.get(school_class_id) : null;
        const madrasaClass = madrasa_class_id ? classesById.get(madrasa_class_id) : null;
        if (schoolProvided && school_class_id && (!schoolClass || schoolClass.type !== 'School'))
            throw new Error('Invalid school class selected');
        if (madrasaProvided && madrasa_class_id && (!madrasaClass || madrasaClass.type !== 'Madrassa'))
            throw new Error('Invalid madrasa class selected');
        if (hifzProvided) {
            for (const hid of effectiveHifzClassIds) {
                const hc = classesById.get(hid);
                if (!hc || hc.type !== 'Hifz')
                    throw new Error('Invalid hifz class selected');
            }
        }
        const primaryHifzClassId = effectiveHifzClassIds[0] ?? null;
        // ── School ──────────────────────────────────────────────────────────
        if (schoolProvided) {
            if (schoolClass) {
                // Assign to school class
                await client.query(`INSERT INTO student_school_enrollments (student_id, academic_year_id, school_standard, school_section, status, joined_at)
                     VALUES ($1, $2, $3, $4, 'active', now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        school_standard = EXCLUDED.school_standard,
                        school_section  = EXCLUDED.school_section,
                        status          = 'active'`, [student_id, academic_year_id, schoolClass.standard, schoolClass.section || null]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='School')`, [student_id, academic_year_id]);
                await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [student_id, school_class_id, academic_year_id]);
            }
            else {
                // null = remove from school class
                await client.query(`UPDATE student_school_enrollments SET status='inactive' WHERE student_id=$1 AND academic_year_id=$2`, [student_id, academic_year_id]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='School')`, [student_id, academic_year_id]);
            }
        }
        // ── Madrasa ─────────────────────────────────────────────────────────
        if (madrasaProvided) {
            if (madrasaClass) {
                // Assign to madrasa class
                await client.query(`INSERT INTO student_madrasa_enrollments (student_id, academic_year_id, madrasa_standard, madrasa_section, status, joined_at)
                     VALUES ($1, $2, $3, $4, 'active', now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        madrasa_standard = EXCLUDED.madrasa_standard,
                        madrasa_section  = EXCLUDED.madrasa_section,
                        status           = 'active'`, [student_id, academic_year_id, madrasaClass.standard, madrasaClass.section || null]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='Madrassa')`, [student_id, academic_year_id]);
                await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [student_id, madrasa_class_id, academic_year_id]);
            }
            else {
                // null = remove from madrasa class
                await client.query(`UPDATE student_madrasa_enrollments SET status='inactive' WHERE student_id=$1 AND academic_year_id=$2`, [student_id, academic_year_id]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='Madrassa')`, [student_id, academic_year_id]);
            }
        }
        // ── Hifz ────────────────────────────────────────────────────────────
        // Only touched when hifz data was explicitly sent in the request.
        if (hifzProvided) {
            const studentRes = await client.query(`SELECT hifz_mentor_id, admission_date FROM students WHERE adm_no = $1`, [student_id]);
            await client.query(`INSERT INTO student_hifz_profiles (student_id, mentor_id, active, started_on, hifz_group_class_id, updated_at)
                 VALUES ($1, $2, true, COALESCE($3::date, CURRENT_DATE), $4, now())
                 ON CONFLICT (student_id) DO UPDATE SET
                    hifz_group_class_id = EXCLUDED.hifz_group_class_id,
                    active              = true,
                    updated_at          = now()`, [student_id, studentRes.rows[0]?.hifz_mentor_id || null, studentRes.rows[0]?.admission_date || null, primaryHifzClassId]);
            await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='Hifz')`, [student_id, academic_year_id]);
            for (const hid of effectiveHifzClassIds) {
                await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [student_id, hid, academic_year_id]);
            }
        }
        // ── Snapshot ────────────────────────────────────────────────────────
        await client.query(`INSERT INTO student_year_snapshots (
                student_id, academic_year_id, school_standard, school_section,
                madrasa_standard, madrasa_section, hifz_group_class_id, status, updated_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now())
             ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                school_standard   = COALESCE(EXCLUDED.school_standard,   student_year_snapshots.school_standard),
                school_section    = COALESCE(EXCLUDED.school_section,    student_year_snapshots.school_section),
                madrasa_standard  = COALESCE(EXCLUDED.madrasa_standard,  student_year_snapshots.madrasa_standard),
                madrasa_section   = COALESCE(EXCLUDED.madrasa_section,   student_year_snapshots.madrasa_section),
                hifz_group_class_id = COALESCE(EXCLUDED.hifz_group_class_id, student_year_snapshots.hifz_group_class_id),
                status            = 'active',
                updated_at        = now()`, [
            student_id, academic_year_id,
            schoolClass?.standard || null, schoolClass?.section || null,
            madrasaClass?.standard || null, madrasaClass?.section || null,
            hifzProvided ? primaryHifzClassId : null,
        ]);
        await client.query('COMMIT');
        (0, server_cache_1.invalidateCacheByPrefix)('academic-year:snapshots');
        (0, server_cache_1.invalidateCacheByPrefix)('students:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.upsertStudentClassAssignment = upsertStudentClassAssignment;
const upsertClass = async (req, res) => {
    try {
        const { id, academic_year_id, section } = req.body;
        const type = normalizeDepartment(req.body.type || req.body.department);
        const standard = type === 'Hifz' ? (req.body.standard || 'Hifz') : req.body.standard;
        const name = classDisplayName(type, standard, section, req.body.name);
        if (!academic_year_id || !type || !name || !standard) {
            return res.status(400).json({ success: false, error: 'academic_year_id, department, standard/group, and name are required' });
        }
        if (id) {
            const result = await db_1.db.query(`UPDATE classes SET name=$1, type=$2, standard=$3, section=$4, updated_at=now() WHERE id=$5 RETURNING *`, [name, type, standard, section || null, id]);
            (0, server_cache_1.invalidateCacheByPrefix)('classes:');
            return res.json({ success: true, data: result.rows[0] });
        }
        else {
            const result = await db_1.db.query(`INSERT INTO classes (academic_year_id, name, type, standard, section) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [academic_year_id, name, type, standard, section || null]);
            (0, server_cache_1.invalidateCacheByPrefix)('classes:');
            return res.json({ success: true, data: result.rows[0] });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertClass = upsertClass;
const deleteClass = async (req, res) => {
    try {
        await db_1.db.query('UPDATE classes SET is_archived = true, archived_at = now(), updated_at = now() WHERE id = $1', [req.params.id]);
        (0, server_cache_1.invalidateCacheByPrefix)('classes:');
        res.json({ success: true, message: 'Class archived. Existing history remains preserved.' });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteClass = deleteClass;
const getPromotionStudents = async (req, res) => {
    try {
        const { from_academic_year_id, from_standard, from_section, to_academic_year_id, department } = req.query;
        if (!from_academic_year_id || !from_standard || !to_academic_year_id || !department) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        const dept = normalizeDepartment(department);
        const sourceSection = from_section && from_section !== 'all' ? String(from_section) : null;
        let result;
        if (dept === 'School') {
            result = await db_1.db.query(`SELECT se.student_id, s.name, s.name as student_name, s.gender, s.photo_url, s.adm_no,
                        se.school_standard as from_standard, se.school_section as from_section,
                        EXISTS(SELECT 1 FROM student_school_enrollments WHERE student_id = s.adm_no AND academic_year_id = $4 AND status = 'active') as already_assigned_in_target
                 FROM student_school_enrollments se
                 JOIN students s ON s.adm_no = se.student_id
                 WHERE se.academic_year_id = $1
                   AND se.school_standard = $2
                   AND ($3::text IS NULL OR COALESCE(se.school_section, '') = COALESCE($3, ''))
                   AND se.status = 'active'
                   AND COALESCE(s.status, 'active') = 'active'
                 ORDER BY s.name`, [from_academic_year_id, from_standard, sourceSection, to_academic_year_id]);
        }
        else if (dept === 'Madrassa') {
            result = await db_1.db.query(`SELECT me.student_id, s.name, s.name as student_name, s.gender, s.photo_url, s.adm_no,
                        me.madrasa_standard as from_standard, me.madrasa_section as from_section,
                        EXISTS(SELECT 1 FROM student_madrasa_enrollments WHERE student_id = s.adm_no AND academic_year_id = $4 AND status = 'active') as already_assigned_in_target
                 FROM student_madrasa_enrollments me
                 JOIN students s ON s.adm_no = me.student_id
                 WHERE me.academic_year_id = $1
                   AND me.madrasa_standard = $2
                   AND ($3::text IS NULL OR COALESCE(me.madrasa_section, '') = COALESCE($3, ''))
                   AND me.status = 'active'
                   AND COALESCE(s.status, 'active') = 'active'
                 ORDER BY s.name`, [from_academic_year_id, from_standard, sourceSection, to_academic_year_id]);
        }
        else {
            return res.status(400).json({ success: false, error: 'Invalid department' });
        }
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getPromotionStudents = getPromotionStudents;
const executePromotion = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { to_academic_year_id, to_class_id, from_standard, from_section, department, rows, actions } = req.body;
        const dept = normalizeDepartment(department);
        const promotionRows = Array.isArray(rows)
            ? rows
            : Object.entries(actions || {}).map(([student_id, action]) => ({
                student_id,
                action: action === 'stay' ? 'no_promotion' : action === 'none' ? 'skip' : action,
            }));
        const needsSourceClass = promotionRows.some((row) => row.action !== 'promote' && row.action !== 'skip');
        if (!to_academic_year_id || !to_class_id || !department || !Array.isArray(promotionRows) || (needsSourceClass && !from_standard)) {
            return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }
        const classRes = await client.query('SELECT * FROM classes WHERE id = $1', [to_class_id]);
        if (classRes.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Target class not found' });
        }
        const targetClass = classRes.rows[0];
        await client.query('BEGIN');
        for (const row of promotionRows) {
            if (row.action === 'skip')
                continue;
            const studentRes = await client.query(`SELECT adm_no FROM students WHERE adm_no = $1 AND COALESCE(status, 'active') = 'active'`, [row.student_id]);
            if (studentRes.rows.length === 0)
                continue;
            const targetStandard = row.action === 'promote' ? targetClass.standard : (row.from_standard || from_standard);
            const targetSection = row.action === 'promote' ? targetClass.section : (row.from_section ?? from_section);
            let enrollmentClassId = null;
            if (row.action === 'promote') {
                enrollmentClassId = to_class_id;
            }
            else {
                const sameClassRes = await client.query(`SELECT id FROM classes WHERE academic_year_id = $1 AND type = $2 AND standard = $3 AND COALESCE(section, '') = COALESCE($4, '') LIMIT 1`, [to_academic_year_id, dept, targetStandard, targetSection || '']);
                if (sameClassRes.rows.length > 0) {
                    enrollmentClassId = sameClassRes.rows[0].id;
                }
            }
            if (dept === 'School') {
                await client.query(`INSERT INTO student_school_enrollments (student_id, academic_year_id, school_standard, school_section, status, joined_at)
                     VALUES ($1, $2, $3, $4, 'active', now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        school_standard = EXCLUDED.school_standard,
                        school_section  = EXCLUDED.school_section,
                        status          = 'active'`, [row.student_id, to_academic_year_id, targetStandard, targetSection || null]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='School')`, [row.student_id, to_academic_year_id]);
                if (enrollmentClassId) {
                    await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [row.student_id, enrollmentClassId, to_academic_year_id]);
                }
                await client.query(`INSERT INTO student_year_snapshots (
                        student_id, academic_year_id, school_standard, school_section, status, updated_at
                     ) VALUES ($1,$2,$3,$4,'active',now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        school_standard   = COALESCE(EXCLUDED.school_standard,   student_year_snapshots.school_standard),
                        school_section    = COALESCE(EXCLUDED.school_section,    student_year_snapshots.school_section),
                        status            = 'active',
                        updated_at        = now()`, [row.student_id, to_academic_year_id, targetStandard, targetSection || null]);
            }
            else if (dept === 'Madrassa') {
                await client.query(`INSERT INTO student_madrasa_enrollments (student_id, academic_year_id, madrasa_standard, madrasa_section, status, joined_at)
                     VALUES ($1, $2, $3, $4, 'active', now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        madrasa_standard = EXCLUDED.madrasa_standard,
                        madrasa_section  = EXCLUDED.madrasa_section,
                        status           = 'active'`, [row.student_id, to_academic_year_id, targetStandard, targetSection || null]);
                await client.query(`DELETE FROM enrollments WHERE student_id=$1 AND academic_year_id=$2 AND class_id IN (SELECT id FROM classes WHERE type='Madrassa')`, [row.student_id, to_academic_year_id]);
                if (enrollmentClassId) {
                    await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [row.student_id, enrollmentClassId, to_academic_year_id]);
                }
                await client.query(`INSERT INTO student_year_snapshots (
                        student_id, academic_year_id, madrasa_standard, madrasa_section, status, updated_at
                     ) VALUES ($1,$2,$3,$4,'active',now())
                     ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                        madrasa_standard   = COALESCE(EXCLUDED.madrasa_standard,   student_year_snapshots.madrasa_standard),
                        madrasa_section    = COALESCE(EXCLUDED.madrasa_section,    student_year_snapshots.madrasa_section),
                        status            = 'active',
                        updated_at        = now()`, [row.student_id, to_academic_year_id, targetStandard, targetSection || null]);
            }
        }
        await client.query('COMMIT');
        (0, server_cache_1.invalidateCacheByPrefix)('academic-year:snapshots');
        (0, server_cache_1.invalidateCacheByPrefix)('students:');
        (0, server_cache_1.invalidateCacheByPrefix)('reports:');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.executePromotion = executePromotion;
// --- ENROLLMENTS ---
const getEnrollments = async (req, res) => {
    try {
        const { class_id, academic_year_id } = req.query;
        let query = `
            SELECT e.*, s.name as student_name, s.photo_url 
            FROM enrollments e 
            JOIN students s ON e.student_id = s.adm_no 
            WHERE 1=1
        `;
        const params = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND e.class_id = $${params.length}`;
        }
        if (academic_year_id) {
            params.push(academic_year_id);
            query += ` AND e.academic_year_id = $${params.length}`;
        }
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getEnrollments = getEnrollments;
const enrollStudent = async (req, res) => {
    try {
        const { student_id, class_id, academic_year_id } = req.body;
        const result = await db_1.db.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) RETURNING *`, [student_id, class_id, academic_year_id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.enrollStudent = enrollStudent;
const deleteEnrollment = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM enrollments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteEnrollment = deleteEnrollment;
// --- WEEKLY SCHEDULE ---
const getWeeklySchedule = async (req, res) => {
    try {
        const { class_id } = req.query;
        let query = 'SELECT ws.*, c.name as class_name, c.type FROM weekly_schedule ws JOIN classes c ON ws.class_id = c.id WHERE 1=1';
        const params = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND ws.class_id = $${params.length}`;
        }
        query += ' ORDER BY ws.day_of_week, ws.start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getWeeklySchedule = getWeeklySchedule;
const upsertWeeklySchedule = async (req, res) => {
    try {
        const { id, class_id, day_of_week, start_time, end_time, teacher_id } = req.body;
        if (id) {
            const result = await db_1.db.query(`UPDATE weekly_schedule SET day_of_week=$1, start_time=$2, end_time=$3, teacher_id=$4 WHERE id=$5 RETURNING *`, [day_of_week, start_time, end_time, teacher_id || null, id]);
            return res.json({ success: true, data: result.rows[0] });
        }
        else {
            const result = await db_1.db.query(`INSERT INTO weekly_schedule (class_id, day_of_week, start_time, end_time, teacher_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [class_id, day_of_week, start_time, end_time, teacher_id || null]);
            return res.json({ success: true, data: result.rows[0] });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.upsertWeeklySchedule = upsertWeeklySchedule;
const deleteWeeklySchedule = async (req, res) => {
    try {
        await db_1.db.query('DELETE FROM weekly_schedule WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.deleteWeeklySchedule = deleteWeeklySchedule;
// --- CLASS EVENTS ---
const getClassEvents = async (req, res) => {
    try {
        const { date, start_date, end_date, class_id } = req.query;
        let query = 'SELECT ce.*, c.name as class_name, c.type FROM class_events ce JOIN classes c ON ce.class_id = c.id WHERE 1=1';
        const params = [];
        if (date) {
            params.push(date);
            query += ` AND ce.date = $${params.length}`;
        }
        else if (start_date && end_date) {
            params.push(start_date, end_date);
            query += ` AND ce.date >= $${params.length - 1} AND ce.date <= $${params.length}`;
        }
        if (class_id) {
            params.push(class_id);
            query += ` AND ce.class_id = $${params.length}`;
        }
        query += ' ORDER BY ce.date, ce.start_time';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getClassEvents = getClassEvents;
const generateDailyEvents = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { date } = req.body; // YYYY-MM-DD
        if (!date)
            return res.status(400).json({ success: false, error: 'Date is required' });
        const dayOfWeek = new Date(date).getDay(); // 0 is Sunday
        await client.query('BEGIN');
        // Find all weekly schedules for this day of week that BELONG to the CURRENT academic year
        const query = `
            SELECT ws.* 
            FROM weekly_schedule ws
            JOIN classes c ON ws.class_id = c.id
            JOIN academic_years ay ON c.academic_year_id = ay.id
            WHERE ws.day_of_week = $1 AND ay.is_current = true
        `;
        const schedules = await client.query(query, [dayOfWeek]);
        let inserted = 0;
        // Insert events for each schedule item, ignoring conflicts
        for (const schedule of schedules.rows) {
            const insertQuery = `
                INSERT INTO class_events (class_id, date, start_time, end_time, teacher_id, source_type, status)
                VALUES ($1, $2, $3, $4, $5, 'weekly', 'scheduled')
                ON CONFLICT (class_id, date, start_time) DO NOTHING
            `;
            const result = await client.query(insertQuery, [
                schedule.class_id,
                date,
                schedule.start_time,
                schedule.end_time,
                schedule.teacher_id
            ]);
            inserted += (result.rowCount || 0);
        }
        await client.query('COMMIT');
        res.json({ success: true, inserted });
    }
    catch (err) {
        await client.query('ROLLBACK');
        console.error('Error generating daily events:', err);
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.generateDailyEvents = generateDailyEvents;
const updateClassEventStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        const result = await db_1.db.query('UPDATE class_events SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.updateClassEventStatus = updateClassEventStatus;
const createManualClassEvent = async (req, res) => {
    try {
        const { class_id, date, start_time, end_time, teacher_id } = req.body;
        const result = await db_1.db.query(`INSERT INTO class_events (class_id, date, start_time, end_time, teacher_id, source_type, status)
             VALUES ($1, $2, $3, $4, $5, 'manual', 'scheduled') RETURNING *`, [class_id, date, start_time, end_time, teacher_id || null]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.createManualClassEvent = createManualClassEvent;
const bulkAssignHifzClass = async (req, res) => {
    const client = await db_1.db.getClient();
    try {
        const { academic_year_id, class_id, add_student_ids, remove_student_ids } = req.body;
        if (!academic_year_id || !class_id)
            return res.status(400).json({ success: false, error: 'academic_year_id and class_id are required' });
        await client.query('BEGIN');
        if (add_student_ids && add_student_ids.length > 0) {
            const values = add_student_ids.map((id) => `('${id}', '${class_id}', '${academic_year_id}')`).join(',');
            await client.query(`INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ${values} ON CONFLICT DO NOTHING`);
        }
        if (remove_student_ids && remove_student_ids.length > 0) {
            await client.query(`DELETE FROM enrollments WHERE academic_year_id = $1 AND class_id = $2 AND student_id = ANY($3::text[])`, [academic_year_id, class_id, remove_student_ids]);
        }
        await client.query('COMMIT');
        res.json({ success: true });
    }
    catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
    finally {
        client.release();
    }
};
exports.bulkAssignHifzClass = bulkAssignHifzClass;
