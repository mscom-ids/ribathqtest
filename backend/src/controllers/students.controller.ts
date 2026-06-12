import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { db } from '../config/db';
import { devLog } from '../utils/logger';
import { getStaffId } from '../utils/staff.utils';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../utils/server-cache';
import { applyAcademicSnapshot, getAcademicYearContext, getStudentYearSnapshotMap } from '../utils/academic-year';

const MENTOR_ROLES = ['staff', 'usthad', 'mentor'];
const ALUMNI_STATUSES = ['completed', 'dropout', 'stopped', 'higher_education'];
const ACTIVE_OPERATIONAL_LEAVE_STATUSES = ['approved', 'outside'];

// Columns required for the listing/grid views and the dashboard. Excludes the
// heavy `comprehensive_details` JSON blob and `address` text — callers that
// actually need those should fetch the single student via /students/:id.
const LIGHT_STUDENT_COLS =
    `adm_no, name, dob, standard, batch_year, phone, email, father_name, photo_url, status, gender,
     COALESCE(admission_date::text, comprehensive_details #>> '{admission,admission_date}') AS admission_date,
     COALESCE(admission_date::text, comprehensive_details #>> '{admission,admission_date}') AS date_of_join,
     place, hifz_mentor_id, school_mentor_id, madrasa_mentor_id, phone_number`;

const FULL_STUDENT_COLS =
    LIGHT_STUDENT_COLS + ', address, nationality, pincode, post, district, state, local_body, aadhar, id_mark, comprehensive_details';

let studentCurrentPresenceTableExists: boolean | null = null;

const formatJoinedAdmittedBatchYear = (student: any) => {
  if (student.admission_date) {
    const date = new Date(student.admission_date);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
    return String(student.admission_date);
  }

  return student.batch_year || '';
};

function isAlumniStatus(status: unknown) {
  return ALUMNI_STATUSES.includes(String(status || '').toLowerCase());
}

async function hasStudentCurrentPresenceTable(client: any) {
  if (studentCurrentPresenceTableExists !== null) return studentCurrentPresenceTableExists;

  const result = await client.query(`SELECT to_regclass('public.student_current_presence') AS table_name`);
  studentCurrentPresenceTableExists = Boolean(result.rows[0]?.table_name);
  return studentCurrentPresenceTableExists;
}

async function getActiveOperationalRecords(client: any, studentId: string) {
  const [leaveRes, hasPresenceTable] = await Promise.all([
    client.query(
      `SELECT COUNT(*)::integer AS count
       FROM student_leaves
       WHERE student_id = $1 AND status = ANY($2::text[])`,
      [studentId, ACTIVE_OPERATIONAL_LEAVE_STATUSES]
    ),
    hasStudentCurrentPresenceTable(client),
  ]);

  const presenceRes = hasPresenceTable
    ? await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM student_current_presence
       WHERE student_id = $1 AND status IN ('outside', 'on-campus')`,
      [studentId]
    )
    : { rows: [{ count: 0 }] };

  return {
    active_leaves: Number(leaveRes.rows[0]?.count || 0),
    active_presence: Number(presenceRes.rows[0]?.count || 0),
    active_hostel: 0,
  };
}

function hasActiveOperationalRecords(records: { active_leaves: number; active_presence: number; active_hostel: number }) {
  return records.active_leaves > 0 || records.active_presence > 0 || records.active_hostel > 0;
}

async function closeActiveOperationalRecords(client: any, studentId: string, userId?: string) {
  const cancelledLeavesRes = await client.query(
    `UPDATE student_leaves
     SET status = 'cancelled',
         actual_return_datetime = NULL,
         return_status = NULL,
         updated_at = NOW()
     WHERE student_id = $1 AND status = ANY($2::text[])
     RETURNING id, status`,
    [studentId, ACTIVE_OPERATIONAL_LEAVE_STATUSES]
  );

  if (await hasStudentCurrentPresenceTable(client)) {
    await client.query(
      `DELETE FROM student_current_presence
       WHERE student_id = $1 AND status IN ('outside', 'on-campus')`,
      [studentId]
    );
  }

  return { cancelled_leaves: cancelledLeavesRes.rowCount || 0 };
}

export const getAllStudents = async (req: Request, res: Response) => {
  try {
    const { search, class: className, status, light, sort } = req.query;
    const includeCount = req.query.count !== 'false';
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
    const rawLimit = Number(req.query.limit);
    const rawOffset = Number(req.query.offset);
    const shouldPaginate = Number.isFinite(rawLimit);
    const limit = Math.min(Math.max(shouldPaginate ? rawLimit : 0, 1), 500);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    // ?light=true skips the heavy comprehensive_details JSON column —
    // the listing pages don't need it and dropping it cuts payload size
    // and serialization time significantly when there are many students.
    const cols = light === 'true' ? LIGHT_STUDENT_COLS : FULL_STUDENT_COLS;
    const whereParts: string[] = ['1=1'];
    let query = `SELECT ${cols} FROM students WHERE `;
    const params: any[] = [];
    let paramCount = 1;
    const user = (req as any).user;
    let mentorScopeStaffId = 'all';

    // By default, mentor roles only see their own assigned students.
    // Pass ?scope=all to see every student (used by the "All Students" tab).
    if (MENTOR_ROLES.includes(user?.role) && req.query.scope !== 'all') {
      const staffId = await getStaffId(req);
      if (!staffId) {
        return res.status(403).json({ success: false, error: 'Staff profile not found' });
      }
      mentorScopeStaffId = String(staffId);
      whereParts.push(`(hifz_mentor_id = $${paramCount} OR school_mentor_id = $${paramCount} OR madrasa_mentor_id = $${paramCount})`);
      params.push(staffId);
      paramCount++;
    }

    if (search) {
      whereParts.push(`(name ILIKE $${paramCount} OR adm_no ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    if (className && className !== 'all') {
      if (academicContext.mode === 'historical' && academicContext.academicYearId) {
        const yearParam = paramCount++;
        const classParam = paramCount++;
        whereParts.push(`EXISTS (
          SELECT 1
          FROM student_year_snapshots sys
          WHERE sys.student_id = students.adm_no
            AND sys.academic_year_id = $${yearParam}
            AND sys.school_standard = $${classParam}
        )`);
        params.push(academicContext.academicYearId, className);
      } else {
        whereParts.push(`standard = $${paramCount}`);
        params.push(className);
        paramCount++;
      }
    }

    if (status) {
      if (status === 'alumni') {
         whereParts.push(`status IN ('completed', 'dropout', 'stopped', 'higher_education')`);
      } else if (status !== 'all') {
         whereParts.push(`status = $${paramCount}`);
         params.push(status);
         paramCount++;
      }
    } else {
      whereParts.push(`status = 'active'`);
    }

    query += whereParts.join(' AND ');
    const sortColumns: Record<string, string> = {
      name: 'name ASC, adm_no ASC',
      adm_no: 'adm_no ASC',
      standard: 'standard ASC NULLS LAST, name ASC',
    };
    const orderBy = sortColumns[String(sort || 'name')] || sortColumns.name;
    query += ` ORDER BY ${orderBy}`;

    if (shouldPaginate) {
      const limitIdx = paramCount++;
      const offsetIdx = paramCount++;
      query += ` LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
      const pagedParams = [...params, limit, offset];
      const countQuery = `SELECT COUNT(*)::integer as total FROM students WHERE ${whereParts.join(' AND ')}`;
      const cacheable = light === 'true' && academicContext.mode !== 'historical';
      const cacheKey = makeCacheKey('students:list', {
        role: user?.role || '',
        staff: mentorScopeStaffId,
        scope: req.query.scope || '',
        search: search || '',
        class: className || '',
        status: status || '',
        sort: sort || 'name',
        limit,
        offset,
        count: includeCount,
        academic_year_id: academicContext.academicYearId || 'current',
      });
      const payload = await (cacheable
        ? cachedResult(cacheKey, 60_000, async () => {
            const [result, countRes] = await Promise.all([
              db.query(query, pagedParams),
              includeCount ? db.query(countQuery, params) : Promise.resolve({ rows: [{ total: null }] }),
            ]);
            return { rows: result.rows, total: countRes.rows[0]?.total ?? null };
          })
        : (async () => {
            const [result, countRes] = await Promise.all([
              db.query(query, pagedParams),
              includeCount ? db.query(countQuery, params) : Promise.resolve({ rows: [{ total: null }] }),
            ]);
            return { rows: result.rows, total: countRes.rows[0]?.total ?? null };
          })());
      const snapshotMap = academicContext.mode === 'historical' && academicContext.academicYearId
        ? await getStudentYearSnapshotMap(
            db,
            payload.rows.map((student: any) => student.adm_no),
            academicContext.academicYearId
          )
        : new Map<string, any>();
      return res.json({
        success: true,
        students: payload.rows.map((student: any) => applyAcademicSnapshot(student, snapshotMap.get(student.adm_no))),
        academic_year_mode: academicContext.mode,
        pagination: { limit, offset, total: includeCount ? payload.total || 0 : null },
      });
    }

    const cacheable = light === 'true' && academicContext.mode !== 'historical';
    const cacheKey = makeCacheKey('students:list', {
      role: user?.role || '',
      staff: mentorScopeStaffId,
      scope: req.query.scope || '',
      search: search || '',
      class: className || '',
      status: status || '',
      sort: sort || 'name',
      limit: 'all',
      offset: 0,
      count: false,
      academic_year_id: academicContext.academicYearId || 'current',
    });
    const rows = await (cacheable
      ? cachedResult(cacheKey, 60_000, async () => {
          const result = await db.query(query, params);
          return result.rows;
        })
      : (async () => {
          const result = await db.query(query, params);
          return result.rows;
        })());
    const snapshotMap = academicContext.mode === 'historical' && academicContext.academicYearId
      ? await getStudentYearSnapshotMap(
          db,
          rows.map((student: any) => student.adm_no),
          academicContext.academicYearId
        )
      : new Map<string, any>();
    res.json({
      success: true,
      students: rows.map((student: any) => applyAcademicSnapshot(student, snapshotMap.get(student.adm_no))),
      academic_year_mode: academicContext.mode,
    });

  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
};

// Lightweight counts for the admin dashboard. Single aggregation query
// instead of fetching every row and counting in JS.
export const getStudentCounts = async (_req: Request, _res: Response) => {
  try {
    const counts = await cachedResult('students:counts', 5 * 60_000, async () => {
      const presencePromise = hasStudentCurrentPresenceTable(db).then((hasPresenceTable) => {
        if (hasPresenceTable) {
          return db.query(
            `SELECT
                COUNT(*) FILTER (WHERE scp.status = 'outside') AS out_campus,
                COUNT(*) FILTER (WHERE scp.status = 'on-campus') AS on_campus_leave
             FROM student_current_presence scp
             JOIN students s ON scp.student_id = s.adm_no
             WHERE s.status = 'active'`
          );
        }

        return db.query(
          `SELECT
              COUNT(DISTINCT student_id) AS out_campus,
              0::integer AS on_campus_leave
           FROM student_leaves sl
           JOIN students s ON sl.student_id = s.adm_no
           WHERE sl.status = 'outside'
             AND s.status = 'active'`
        );
      });

      const [statusRes, presenceRes] = await Promise.all([
        db.query(
          `SELECT
              COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL) AS active,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status IN ('dropout', 'stopped', 'higher_education')) AS dropout,
              COUNT(*) AS total
            FROM students`
        ),
        presencePromise,
      ]);

      const r = statusRes.rows[0];
      const active = parseInt(r.active, 10) || 0;
      const completed = parseInt(r.completed, 10) || 0;
      const dropout = parseInt(r.dropout, 10) || 0;
      const total = parseInt(r.total, 10) || 0;
      const outCampus = parseInt(presenceRes.rows[0].out_campus, 10) || 0;
      const onCampus = Math.max(0, active - outCampus);

      return {
        total,
        active,
        completed,
        dropout,
        on_campus: onCampus,
        out_campus: outCampus,
        alumni: completed + dropout,
      };
    });

    _res.json({
      success: true,
      counts,
    });
  } catch (err) {
    console.error('Error fetching student counts:', err);
    _res.status(500).json({ success: false, error: 'Failed to fetch student counts' });
  }
};

export const getStudentInsideOutsideSummary = async (req: Request, res: Response) => {
  try {
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
    const academicYearId = academicContext.academicYearId;

    const buildQuery = (outsideSource: string) => `
      WITH scoped_students AS (
        SELECT
          s.adm_no,
          s.name,
          s.batch_year,
          s.photo_url,
          COALESCE(sys.school_standard, s.standard, s.school_standard, s.hifz_standard, s.madrassa_standard, 'Unassigned') AS standard
        FROM students s
        LEFT JOIN student_year_snapshots sys
          ON sys.student_id = s.adm_no
         AND sys.academic_year_id = $1
        WHERE s.status = 'active'
      ),
      outside_students AS (
        ${outsideSource}
      )
      SELECT
        ss.adm_no,
        ss.name,
        ss.batch_year,
        ss.photo_url,
        ss.standard,
        (os.student_id IS NOT NULL) AS is_outside
      FROM scoped_students ss
      LEFT JOIN outside_students os ON os.student_id = ss.adm_no
      ORDER BY ss.standard ASC NULLS LAST, ss.name ASC, ss.adm_no ASC
    `;

    const presenceOutsideSource = `
      SELECT DISTINCT scp.student_id
      FROM student_current_presence scp
      WHERE scp.status = 'outside'
    `;
    const leaveOutsideSource = `
      SELECT DISTINCT sl.student_id
      FROM student_leaves sl
      WHERE sl.status = 'outside'
    `;

    let result;
    try {
      result = await db.query(buildQuery(presenceOutsideSource), [academicYearId]);
    } catch (presenceErr: any) {
      if (presenceErr?.code !== '42P01') throw presenceErr;
      result = await db.query(buildQuery(leaveOutsideSource), [academicYearId]);
    }

    const classMap = new Map<string, any>();
    result.rows.forEach((student: any) => {
      const standard = student.standard || 'Unassigned';
      if (!classMap.has(standard)) {
        classMap.set(standard, {
          standard,
          total: 0,
          inside_count: 0,
          outside_count: 0,
          inside_students: [],
          outside_students: [],
        });
      }

      const group = classMap.get(standard);
      const compactStudent = {
        adm_no: student.adm_no,
        name: student.name,
        batch_year: student.batch_year,
        photo_url: student.photo_url,
      };

      group.total += 1;
      if (student.is_outside) {
        group.outside_count += 1;
        group.outside_students.push(compactStudent);
      } else {
        group.inside_count += 1;
        group.inside_students.push(compactStudent);
      }
    });

    const classSortValue = (standard: string) => {
      const lower = standard.toLowerCase();
      if (lower.includes('plus one')) return 11;
      if (lower.includes('plus two')) return 12;
      const numeric = lower.match(/\d+/);
      return numeric ? Number(numeric[0]) : 999;
    };

    const classes = Array.from(classMap.values()).sort((a, b) => {
      const rank = classSortValue(a.standard) - classSortValue(b.standard);
      return rank !== 0 ? rank : String(a.standard).localeCompare(String(b.standard));
    });

    const totals = classes.reduce((acc, group) => ({
      total: acc.total + group.total,
      inside_count: acc.inside_count + group.inside_count,
      outside_count: acc.outside_count + group.outside_count,
    }), { total: 0, inside_count: 0, outside_count: 0 });

    res.json({
      success: true,
      summary: {
        ...totals,
        classes,
        academic_year_mode: academicContext.mode,
      },
    });
  } catch (err) {
    console.error('Error fetching inside/outside summary:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch inside/outside summary' });
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const studentId = String(id);
    const { light } = req.query;
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);

    // ?light=true skips the heavy comprehensive_details JSON for callers like
    // the daily-entry form that only need name + a couple of flags.
    const cols = light === 'true' ? LIGHT_STUDENT_COLS : '*';
    const user = (req as any).user;
    const params: any[] = [studentId];
    let studentQuery = `SELECT ${cols} FROM students WHERE adm_no = $1`;

    if (MENTOR_ROLES.includes(user?.role)) {
      const staffId = await getStaffId(req);
      if (!staffId) {
        return res.status(403).json({ success: false, error: 'Staff profile not found' });
      }
      studentQuery += ` AND (hifz_mentor_id = $2 OR school_mentor_id = $2 OR madrasa_mentor_id = $2)`;
      params.push(staffId);
    }

    // Both queries are independent — fire in parallel (was sequential).
    const [result, leaveRes] = await Promise.all([
      db.query(studentQuery, params),
      db.query(
        `SELECT sl.id
         FROM student_leaves sl
         JOIN students s ON sl.student_id = s.adm_no
         WHERE sl.student_id = $1
           AND sl.status = 'outside'
           AND s.status = 'active'
         LIMIT 1`,
        [studentId]
      ),
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const is_outside = leaveRes.rows.length > 0;
    const snapshotMap = academicContext.mode === 'historical' && academicContext.academicYearId
      ? await getStudentYearSnapshotMap(db, [studentId], academicContext.academicYearId)
      : new Map<string, any>();
    const student = applyAcademicSnapshot(result.rows[0], snapshotMap.get(studentId));

    res.json({ success: true, student: { ...student, is_outside, academic_year_mode: academicContext.mode } });
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch student' });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    // Map the incoming frontend fields to the actual database columns.
    // Ensure we handle both legacy/frontend keys AND verbatim backend keys just in case.
    const mappedStudent = {
      adm_no: data.admission_number || data.adm_no,
      name: data.full_name || data.name,
      dob: data.date_of_birth || data.dob,
      address: data.address_line || data.address,
      father_name: data.parent_name || data.father_name,
      phone: data.parent_phone || data.phone,
      email: data.email,
      batch_year: data.batch_year,
      standard: data.class || data.standard,
      hifz_mentor_id: data.hifz_mentor_id === "unassigned" ? null : data.hifz_mentor_id,
      school_mentor_id: data.school_mentor_id === "unassigned" ? null : data.school_mentor_id,
      madrasa_mentor_id: data.madrasa_mentor_id === "unassigned" ? null : data.madrasa_mentor_id,
      photo_url: data.photo_url,
      status: data.status || 'active',
      comprehensive_details: data.comprehensive_details || {},
      gender: data.gender,
      admission_date: data.admission_date || data.date_of_join,
      nationality: data.nationality || 'Indian',
      pincode: data.pincode,
      post: data.post,
      district: data.district,
      state: data.state,
      place: data.place,
      local_body: data.local_body,
      aadhar: data.aadhar,
      id_mark: data.id_mark,
      country: data.country,
    };

    // We explicitly list the columns to avoid SQL injection
    const validColumns = [
      'adm_no', 'name', 'dob', 'address', 'father_name', 'phone',
      'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
      'photo_url', 'status', 'comprehensive_details',
      'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
      'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
    ];
    
    const values: any[] = [];
    const placeholders: string[] = [];
    const insertCols: string[] = [];
    
    let paramCount = 1;
    for (const col of validColumns) {
      // Use standard Object mapping, allowing nulls but excluding undefined mapping
      if (mappedStudent[col as keyof typeof mappedStudent] !== undefined) {
        insertCols.push(col);
        values.push(mappedStudent[col as keyof typeof mappedStudent]);
        placeholders.push(`$${paramCount}`);
        paramCount++;
      }
    }

    const query = `
      INSERT INTO students (${insertCols.join(', ')}) 
      VALUES (${placeholders.join(', ')}) 
      RETURNING *
    `;

    const result = await db.query(query, values);
    
    invalidateCacheByPrefix('students:');
    invalidateCacheByPrefix('hifz:');
    invalidateCacheByPrefix('finance:active-students');
    invalidateCacheByPrefix('attendance:');
    res.status(201).json({ success: true, student: result.rows[0] });
  } catch (err) {
    console.error('Error creating student:', err);
    res.status(500).json({ success: false, error: 'Failed to create student' });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Student ID is required' });
    }
    const studentId = String(id);
    const updateData = req.body;
    const user = (req as any).user;
    devLog('[updateStudent] id:', id, 'keys:', Object.keys(updateData));

    // Safety check - don't allow updating ID
    delete updateData.id;

    // Map legacy/frontend fields to db fields if they exist
    if ('assigned_usthad_id' in updateData) {
      updateData.hifz_mentor_id = updateData.assigned_usthad_id;
      delete updateData.assigned_usthad_id;
    }

    const validColumns = [
      'name', 'dob', 'address', 'father_name', 'phone',
      'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
      'photo_url', 'status', 'comprehensive_details',
      'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
      'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
    ];

    const keysToUpdate = Object.keys(updateData).filter(key => validColumns.includes(key));

    if (keysToUpdate.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid data provided for update' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const currentRes = await client.query(
        `SELECT adm_no, status, hifz_mentor_id FROM students WHERE adm_no = $1 FOR UPDATE`,
        [studentId]
      );
      if (currentRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Student not found' });
      }

      const nextStatus = updateData.status;
      const becomingAlumni = nextStatus !== undefined
        && isAlumniStatus(nextStatus)
        && !isAlumniStatus(currentRes.rows[0].status);

      if (becomingAlumni) {
        const activeRecords = await getActiveOperationalRecords(client, studentId);
        const forceTransfer = updateData.forceAlumniTransfer === true || updateData.closeActiveRecords === true;
        if (hasActiveOperationalRecords(activeRecords) && !forceTransfer) {
          await client.query('ROLLBACK');
          const message = 'This student currently has active operational records. Transferring to Alumni will automatically cancel active leave records. Do you want to continue?';
          return res.status(409).json({
            success: false,
            code: 'ALUMNI_TRANSFER_REQUIRES_CONFIRMATION',
            message,
            error: message,
            active_records: activeRecords,
          });
        }
        if (hasActiveOperationalRecords(activeRecords)) {
          await closeActiveOperationalRecords(client, studentId, user?.id);
        }
      }

      delete updateData.forceAlumniTransfer;
      delete updateData.closeActiveRecords;

      const setClauses = [];
      const values = [];
      let paramCount = 1;

      for (const key of keysToUpdate) {
        if (key === 'comprehensive_details') {
          // Deep merge the new JSON inside Postgres so we don't accidentally overwrite other saved tabs
          setClauses.push(`${key} = COALESCE(students.${key}, '{}'::jsonb) || $${paramCount}::jsonb`);
        } else {
          setClauses.push(`${key} = $${paramCount}`);
        }
        values.push(updateData[key]);
        paramCount++;
      }

      // Add exactly one more parameter for the ID
      values.push(studentId);
      
      const query = `
        UPDATE students 
        SET ${setClauses.join(', ')} 
        WHERE adm_no = $${paramCount} 
        RETURNING *
      `;

      const result = await client.query(query, values);

      // ── Hifz mentor history: if hifz_mentor_id changed, close old entry and open new one ──
      const newHifzMentorId = updateData.hifz_mentor_id !== undefined ? (updateData.hifz_mentor_id || null) : undefined;
      const oldHifzMentorId = currentRes.rows[0]?.hifz_mentor_id || null;
      if (newHifzMentorId !== undefined && String(newHifzMentorId || '') !== String(oldHifzMentorId || '')) {
        try {
          // Close existing active entry
          await client.query(
            `UPDATE hifz_mentor_history
             SET assigned_until = CURRENT_DATE
             WHERE student_id = $1 AND assigned_until IS NULL`,
            [studentId]
          );
          // Open new entry if a mentor is now assigned
          if (newHifzMentorId) {
            await client.query(
              `INSERT INTO hifz_mentor_history (student_id, mentor_id, assigned_from)
               VALUES ($1, $2, CURRENT_DATE)
               ON CONFLICT DO NOTHING`,
              [studentId, newHifzMentorId]
            );
          }
          // Also sync student_hifz_profiles if it exists
          await client.query(
            `UPDATE student_hifz_profiles
             SET mentor_id = $2, updated_at = now()
             WHERE student_id = $1`,
            [studentId, newHifzMentorId]
          );
        } catch (hifzErr: any) {
          // Non-fatal: hifz_mentor_history table may not be applied yet
          console.warn('[updateStudent] Could not record hifz mentor history:', hifzErr?.message);
        }
      }

      await client.query('COMMIT');

      invalidateCacheByPrefix('students:');
      invalidateCacheByPrefix('hifz:');
      invalidateCacheByPrefix('finance:active-students');
      invalidateCacheByPrefix('attendance:');
      invalidateCacheByPrefix('leaves:');
      res.json({ success: true, student: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Error updating student:', err);
    // Surface the PostgreSQL error detail so it's easier to diagnose (e.g. missing column)
    const detail = err.detail || err.hint || '';
    res.status(500).json({ success: false, error: `${err.message || 'Failed to update student'}${detail ? ` — ${detail}` : ''}` });
  }
};

// ── Export students as JSON ────────────────────────────────────
export const exportStudents = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT adm_no, name, standard, admission_date, batch_year, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`
    );
    const data = result.rows.map((s: any) => ({
      rollNo: s.adm_no,
      name: s.name,
      standard: s.standard || '',
      joinedAdmittedBatchYear: formatJoinedAdmittedBatchYear(s),
      phoneNumber: s.phone_number || ''
    }));
    res.json({ success: true, students: data });
  } catch (err) {
    console.error('Error exporting students:', err);
    res.status(500).json({ success: false, error: 'Failed to export students' });
  }
};

// ── Download students as Excel (.xlsx) ────────────────────────
export const downloadStudentsExcel = async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT adm_no, name, standard, admission_date, batch_year, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`
    );

    const rows = result.rows.map((s: any, i: number) => ({
      'S.No': i + 1,
      'Roll No': s.adm_no,
      'Student Name': s.name,
      'Class / Standard': s.standard || '',
      'Joined / Admitted / Batch Year': formatJoinedAdmittedBatchYear(s),
      'Phone Number': s.phone_number || ''
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 28 }, { wch: 15 }];

    XLSX.utils.book_append_sheet(wb, ws, 'Students');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    console.error('Error generating Excel:', err);
    res.status(500).json({ success: false, error: 'Failed to generate Excel file' });
  }
};
