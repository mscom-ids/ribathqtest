import { Request, Response } from 'express';
import { db } from '../config/db';

function normalizeDepartment(value: any) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'madrasa' || raw === 'madrassa') return 'Madrassa';
    if (raw === 'hifz') return 'Hifz';
    return 'School';
}

function classDisplayName(type: string, standard?: string | null, section?: string | null, name?: string | null) {
    if (name && String(name).trim()) return String(name).trim();
    if (type === 'Hifz') return standard || 'Hifz Group';
    return [standard, section].filter(Boolean).join(' ').trim();
}

// --- ACADEMIC YEARS ---
export const getAcademicYears = async (req: Request, res: Response) => {
    try {
        const result = await db.query('SELECT * FROM academic_years ORDER BY start_date DESC');
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertAcademicYear = async (req: Request, res: Response) => {
    try {
        const { id, name, start_date, end_date, is_current, is_locked, promotion_window_open } = req.body;
        if (id) {
            const result = await db.query(
                `UPDATE academic_years SET name=$1, start_date=$2, end_date=$3, is_current=$4, is_locked=$5, promotion_window_open=$6 WHERE id=$7 RETURNING *`,
                [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false, id]
            );
            return res.json({ success: true, data: result.rows[0] });
        } else {
            const result = await db.query(
                `INSERT INTO academic_years (name, start_date, end_date, is_current, is_locked, promotion_window_open) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [name, start_date, end_date, is_current || false, is_locked || false, promotion_window_open || false]
            );
            return res.json({ success: true, data: result.rows[0] });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteAcademicYear = async (req: Request, res: Response) => {
    try {
        await db.query('DELETE FROM academic_years WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- CLASSES ---
export const getClasses = async (req: Request, res: Response) => {
    try {
        const { academic_year_id, type, include_archived } = req.query;
        let query = 'SELECT * FROM classes WHERE 1=1';
        const params: any[] = [];
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
        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getClassStudents = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const classRes = await db.query('SELECT * FROM classes WHERE id = $1', [id]);
        if (classRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Class not found' });

        const klass = classRes.rows[0];
        let result;
        if (klass.type === 'School') {
            result = await db.query(
                `SELECT se.id, se.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        se.school_standard AS standard, se.school_section AS section
                 FROM student_school_enrollments se
                 JOIN students s ON s.adm_no = se.student_id
                 WHERE se.academic_year_id = $1
                   AND se.school_standard = $2
                   AND COALESCE(se.school_section, '') = COALESCE($3, '')
                   AND se.status = 'active'
                 ORDER BY s.name`,
                [klass.academic_year_id, klass.standard, klass.section || '']
            );
        } else if (klass.type === 'Madrassa') {
            result = await db.query(
                `SELECT me.id, me.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        me.madrasa_standard AS standard, me.madrasa_section AS section
                 FROM student_madrasa_enrollments me
                 JOIN students s ON s.adm_no = me.student_id
                 WHERE me.academic_year_id = $1
                   AND me.madrasa_standard = $2
                   AND COALESCE(me.madrasa_section, '') = COALESCE($3, '')
                   AND me.status = 'active'
                 ORDER BY s.name`,
                [klass.academic_year_id, klass.standard, klass.section || '']
            );
        } else {
            result = await db.query(
                `SELECT hp.id, hp.student_id, s.name AS student_name, s.photo_url, s.adm_no,
                        c.name AS group_name
                 FROM student_hifz_profiles hp
                 JOIN students s ON s.adm_no = hp.student_id
                 LEFT JOIN classes c ON c.id = hp.hifz_group_class_id
                 WHERE hp.hifz_group_class_id = $1
                   AND hp.active = true
                 ORDER BY s.name`,
                [id]
            );
        }

        res.json({ success: true, class: klass, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getStudentClassAssignments = async (req: Request, res: Response) => {
    try {
        const { academic_year_id, search } = req.query;
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        if (!academic_year_id) return res.status(400).json({ success: false, error: 'academic_year_id is required' });

        const params: any[] = [academic_year_id];
        const countParams: any[] = [];
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
        const result = await db.query(
            `SELECT s.adm_no, s.name, s.photo_url, s.standard,
                    sc.id AS school_class_id,
                    sc.name AS school_class_name,
                    sc.standard AS school_standard,
                    sc.section AS school_section,
                    mc.id AS madrasa_class_id,
                    mc.name AS madrasa_class_name,
                    mc.standard AS madrasa_standard,
                    mc.section AS madrasa_section,
                    hc.id AS hifz_class_id,
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
             WHERE ${where}
             ORDER BY s.name
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );
        const countRes = await db.query(`SELECT COUNT(*)::integer AS total FROM students s WHERE ${countWhere}`, countParams);
        res.json({ success: true, data: result.rows, pagination: { total: countRes.rows[0]?.total || 0, limit, offset } });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertStudentClassAssignment = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { student_id, academic_year_id, school_class_id, madrasa_class_id, hifz_class_id } = req.body;
        if (!student_id || !academic_year_id) return res.status(400).json({ success: false, error: 'student_id and academic_year_id are required' });

        await client.query('BEGIN');
        const classIds = [school_class_id, madrasa_class_id, hifz_class_id].filter(Boolean);
        const classesRes = classIds.length
            ? await client.query(`SELECT * FROM classes WHERE id = ANY($1::uuid[])`, [classIds])
            : { rows: [] as any[] };
        const classesById = new Map(classesRes.rows.map((row: any) => [row.id, row]));
        const schoolClass = school_class_id ? classesById.get(school_class_id) : null;
        const madrasaClass = madrasa_class_id ? classesById.get(madrasa_class_id) : null;
        const hifzClass = hifz_class_id ? classesById.get(hifz_class_id) : null;

        if (school_class_id && (!schoolClass || schoolClass.type !== 'School')) throw new Error('Invalid school class selected');
        if (madrasa_class_id && (!madrasaClass || madrasaClass.type !== 'Madrassa')) throw new Error('Invalid madrasa class selected');
        if (hifz_class_id && (!hifzClass || hifzClass.type !== 'Hifz')) throw new Error('Invalid hifz group selected');

        if (schoolClass) {
            await client.query(
                `INSERT INTO student_school_enrollments (student_id, academic_year_id, school_standard, school_section, status, joined_at)
                 VALUES ($1, $2, $3, $4, 'active', now())
                 ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                    school_standard = EXCLUDED.school_standard,
                    school_section = EXCLUDED.school_section,
                    status = 'active'`,
                [student_id, academic_year_id, schoolClass.standard, schoolClass.section || null]
            );
        }

        if (madrasaClass) {
            await client.query(
                `INSERT INTO student_madrasa_enrollments (student_id, academic_year_id, madrasa_standard, madrasa_section, status, joined_at)
                 VALUES ($1, $2, $3, $4, 'active', now())
                 ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                    madrasa_standard = EXCLUDED.madrasa_standard,
                    madrasa_section = EXCLUDED.madrasa_section,
                    status = 'active'`,
                [student_id, academic_year_id, madrasaClass.standard, madrasaClass.section || null]
            );
        }

        if (hifzClass) {
            const studentRes = await client.query('SELECT hifz_mentor_id, admission_date FROM students WHERE adm_no = $1', [student_id]);
            await client.query(
                `INSERT INTO student_hifz_profiles (student_id, mentor_id, active, started_on, hifz_group_class_id, updated_at)
                 VALUES ($1, $2, true, COALESCE($3::date, CURRENT_DATE), $4, now())
                 ON CONFLICT (student_id) DO UPDATE SET
                    hifz_group_class_id = EXCLUDED.hifz_group_class_id,
                    active = true,
                    updated_at = now()`,
                [student_id, studentRes.rows[0]?.hifz_mentor_id || null, studentRes.rows[0]?.admission_date || null, hifz_class_id]
            );
        }

        await client.query(
            `INSERT INTO student_year_snapshots (
                student_id, academic_year_id, school_standard, school_section,
                madrasa_standard, madrasa_section, hifz_group_class_id, status, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now())
             ON CONFLICT (student_id, academic_year_id) DO UPDATE SET
                school_standard = COALESCE(EXCLUDED.school_standard, student_year_snapshots.school_standard),
                school_section = COALESCE(EXCLUDED.school_section, student_year_snapshots.school_section),
                madrasa_standard = COALESCE(EXCLUDED.madrasa_standard, student_year_snapshots.madrasa_standard),
                madrasa_section = COALESCE(EXCLUDED.madrasa_section, student_year_snapshots.madrasa_section),
                hifz_group_class_id = COALESCE(EXCLUDED.hifz_group_class_id, student_year_snapshots.hifz_group_class_id),
                status = 'active',
                updated_at = now()`,
            [
                student_id,
                academic_year_id,
                schoolClass?.standard || null,
                schoolClass?.section || null,
                madrasaClass?.standard || null,
                madrasaClass?.section || null,
                hifz_class_id || null,
            ]
        );

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err: any) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const upsertClass = async (req: Request, res: Response) => {
    try {
        const { id, academic_year_id, section } = req.body;
        const type = normalizeDepartment(req.body.type || req.body.department);
        const standard = type === 'Hifz' ? (req.body.standard || 'Hifz') : req.body.standard;
        const name = classDisplayName(type, standard, section, req.body.name);
        if (!academic_year_id || !type || !name || !standard) {
            return res.status(400).json({ success: false, error: 'academic_year_id, department, standard/group, and name are required' });
        }
        if (id) {
            const result = await db.query(
                `UPDATE classes SET name=$1, type=$2, standard=$3, section=$4, updated_at=now() WHERE id=$5 RETURNING *`,
                [name, type, standard, section || null, id]
            );
            return res.json({ success: true, data: result.rows[0] });
        } else {
            const result = await db.query(
                `INSERT INTO classes (academic_year_id, name, type, standard, section) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [academic_year_id, name, type, standard, section || null]
            );
            return res.json({ success: true, data: result.rows[0] });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteClass = async (req: Request, res: Response) => {
    try {
        await db.query('UPDATE classes SET is_archived = true, archived_at = now(), updated_at = now() WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Class archived. Existing history remains preserved.' });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- ENROLLMENTS ---
export const getEnrollments = async (req: Request, res: Response) => {
    try {
        const { class_id, academic_year_id } = req.query;
        let query = `
            SELECT e.*, s.name as student_name, s.photo_url 
            FROM enrollments e 
            JOIN students s ON e.student_id = s.adm_no 
            WHERE 1=1
        `;
        const params: any[] = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND e.class_id = $${params.length}`;
        }
        if (academic_year_id) {
            params.push(academic_year_id);
            query += ` AND e.academic_year_id = $${params.length}`;
        }
        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const enrollStudent = async (req: Request, res: Response) => {
    try {
        const { student_id, class_id, academic_year_id } = req.body;
        const result = await db.query(
            `INSERT INTO enrollments (student_id, class_id, academic_year_id) VALUES ($1,$2,$3) RETURNING *`,
            [student_id, class_id, academic_year_id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteEnrollment = async (req: Request, res: Response) => {
    try {
        await db.query('DELETE FROM enrollments WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- WEEKLY SCHEDULE ---
export const getWeeklySchedule = async (req: Request, res: Response) => {
    try {
        const { class_id } = req.query;
        let query = 'SELECT ws.*, c.name as class_name, c.type FROM weekly_schedule ws JOIN classes c ON ws.class_id = c.id WHERE 1=1';
        const params: any[] = [];
        if (class_id) {
            params.push(class_id);
            query += ` AND ws.class_id = $${params.length}`;
        }
        query += ' ORDER BY ws.day_of_week, ws.start_time';
        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertWeeklySchedule = async (req: Request, res: Response) => {
    try {
        const { id, class_id, day_of_week, start_time, end_time, teacher_id } = req.body;
        if (id) {
            const result = await db.query(
                `UPDATE weekly_schedule SET day_of_week=$1, start_time=$2, end_time=$3, teacher_id=$4 WHERE id=$5 RETURNING *`,
                [day_of_week, start_time, end_time, teacher_id || null, id]
            );
            return res.json({ success: true, data: result.rows[0] });
        } else {
            const result = await db.query(
                `INSERT INTO weekly_schedule (class_id, day_of_week, start_time, end_time, teacher_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [class_id, day_of_week, start_time, end_time, teacher_id || null]
            );
            return res.json({ success: true, data: result.rows[0] });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const deleteWeeklySchedule = async (req: Request, res: Response) => {
    try {
        await db.query('DELETE FROM weekly_schedule WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- CLASS EVENTS ---
export const getClassEvents = async (req: Request, res: Response) => {
    try {
        const { date, start_date, end_date, class_id } = req.query;
        let query = 'SELECT ce.*, c.name as class_name, c.type FROM class_events ce JOIN classes c ON ce.class_id = c.id WHERE 1=1';
        const params: any[] = [];
        
        if (date) {
            params.push(date);
            query += ` AND ce.date = $${params.length}`;
        } else if (start_date && end_date) {
            params.push(start_date, end_date);
            query += ` AND ce.date >= $${params.length - 1} AND ce.date <= $${params.length}`;
        }
        
        if (class_id) {
            params.push(class_id);
            query += ` AND ce.class_id = $${params.length}`;
        }
        
        query += ' ORDER BY ce.date, ce.start_time';
        const result = await db.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const generateDailyEvents = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { date } = req.body; // YYYY-MM-DD
        if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
        
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
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('Error generating daily events:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const updateClassEventStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }
        
        const result = await db.query(
            'UPDATE class_events SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};

export const createManualClassEvent = async (req: Request, res: Response) => {
    try {
        const { class_id, date, start_time, end_time, teacher_id } = req.body;
        const result = await db.query(
            `INSERT INTO class_events (class_id, date, start_time, end_time, teacher_id, source_type, status)
             VALUES ($1, $2, $3, $4, $5, 'manual', 'scheduled') RETURNING *`,
            [class_id, date, start_time, end_time, teacher_id || null]
        );
        res.json({ success: true, data: result.rows[0] });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
};
