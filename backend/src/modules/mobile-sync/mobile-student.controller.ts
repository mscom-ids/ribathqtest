import { Request, Response } from 'express';
import { db } from '../../config/db';
import { batchSaveMonthlyHifzEntries } from '../../controllers/hifz.controller';
import { getActiveMentorStudents } from '../../services/mentor-students.service';
import { getHifzStudentMonthRegister } from '../../services/hifz-monthly-register.service';
import { getAcademicYearContext } from '../../utils/academic-year';
import { requireActiveMobileDevice } from './mobile-sync.service';

const MOBILE_MENTOR_ROLES = new Set(['staff', 'usthad', 'mentor']);

function staffId(req: Request) {
  const id = (req as any).user?.id;
  return typeof id === 'string' && id ? id : null;
}

function role(req: Request) {
  return String((req as any).user?.role || '').toLowerCase();
}

function value(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text && text !== 'null' && text !== 'undefined' ? text : null;
}

function fields(entries: Array<[string, unknown]>) {
  return entries
    .map(([label, raw]) => ({ label, value: value(raw) }))
    .filter(field => field.value !== null);
}

function humanize(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function safeNestedFields(raw: unknown) {
  if (!raw || typeof raw !== 'object') return [] as Array<{ label: string; value: string }>;
  const denied = /(aadha?ar|passport|document|password|token|secret)/i;
  const rows: Array<{ label: string; value: string }> = [];
  const append = (item: unknown, prefix = '') => {
    if (item === null || item === undefined) return;
    if (Array.isArray(item)) {
      item.forEach((child, index) => append(child, `${prefix}${prefix ? ' ' : ''}${index + 1}`));
      return;
    }
    if (typeof item === 'object') {
      Object.entries(item as Record<string, unknown>).forEach(([key, child]) => {
        if (!denied.test(key)) append(child, `${prefix}${prefix ? ' · ' : ''}${humanize(key)}`);
      });
      return;
    }
    const normalized = value(item);
    if (normalized && prefix) rows.push({ label: prefix, value: normalized });
  };
  append(raw);
  return rows.slice(0, 100);
}

async function authorizeStudent(req: Request, studentId: string) {
  const id = staffId(req);
  if (!id) return { status: 401, error: 'Unauthenticated' } as const;
  if (!MOBILE_MENTOR_ROLES.has(role(req))) {
    return { status: 403, error: 'This mobile portal is available to mentors only.' } as const;
  }
  const device = await requireActiveMobileDevice(req, id);
  if (!device) return { status: 403, error: 'Unknown or revoked mobile device' } as const;
  const academicYear = await getAcademicYearContext(db, req.query.academic_year_id);
  const roster = await getActiveMentorStudents(db, id, {
    academicYearId: academicYear.academicYearId,
    studentId,
    useCache: false,
  });
  if (!roster.some(student => student.adm_no === studentId)) {
    return { status: 403, error: 'This student is not assigned to you for the active academic year.' } as const;
  }
  return { id, device, academicYear } as const;
}

export async function mobileStudentProfile(req: Request, res: Response) {
  try {
    const studentId = String(req.params.studentId || '').trim();
    if (!studentId) return res.status(400).json({ success: false, error: 'Student is required.' });
    const access = await authorizeStudent(req, studentId);
    if ('error' in access) return res.status(access.status || 403).json({ success: false, error: access.error });

    const result = await db.query(
      `SELECT s.adm_no AS id, s.name, s.photo_url, s.status, s.dob, s.gender,
              s.batch_year, s.admission_date, s.address, s.place, s.local_body,
              s.pincode, s.post, s.district, s.state, s.nationality, s.country,
              s.father_name, s.phone AS parent_phone, s.email AS parent_email,
              COALESCE(placement.standard, snapshot.school_standard, s.standard) AS standard,
              COALESCE(placement.division, snapshot.school_section) AS division,
              COALESCE(hifz_profile.hifz_stage,
                CASE WHEN COALESCE(hifz_profile.completed_hifz, false)
                     THEN 'HAFIZ_REVISION' ELSE 'MEMORIZING' END) AS hifz_stage,
              hifz_mentor.name AS hifz_mentor_name,
              school_mentor.name AS school_mentor_name,
              madrasa_mentor.name AS madrasa_mentor_name,
              COALESCE(s.comprehensive_details, '{}'::jsonb) AS comprehensive_details
       FROM students s
       LEFT JOIN student_year_snapshots snapshot
         ON snapshot.student_id = s.adm_no
        AND snapshot.academic_year_id = $2::uuid
       LEFT JOIN academic_student_placements placement
         ON placement.student_id = s.adm_no
        AND placement.academic_year_id = $2::uuid
        AND placement.status = 'active'
       LEFT JOIN student_hifz_profiles hifz_profile ON hifz_profile.student_id = s.adm_no
       LEFT JOIN staff hifz_mentor
         ON hifz_mentor.id = COALESCE(snapshot.hifz_mentor_id, hifz_profile.mentor_id, s.hifz_mentor_id)
       LEFT JOIN staff school_mentor ON school_mentor.id = COALESCE(snapshot.school_mentor_id, s.school_mentor_id)
       LEFT JOIN staff madrasa_mentor ON madrasa_mentor.id = COALESCE(snapshot.madrasa_mentor_id, s.madrasa_mentor_id)
       WHERE s.adm_no = $1
         AND LOWER(COALESCE(s.status, 'active')) = 'active'
       LIMIT 1`,
      [studentId, access.academicYear.academicYearId],
    );
    const student = result.rows[0];
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });
    const comprehensive = student.comprehensive_details || {};

    return res.json({
      success: true,
      profile: {
        id: student.id,
        name: student.name,
        photoUrl: student.photo_url || null,
        status: student.status || 'active',
        standard: student.standard || '',
        division: student.division || null,
        hifzStage: student.hifz_stage === 'HAFIZ_REVISION' ? 'HAFIZ_REVISION' : 'MEMORIZING',
        sections: [
          { key: 'personal', title: 'Student details', fields: fields([
            ['Admission number', student.id], ['Full name', student.name], ['Date of birth', student.dob],
            ['Gender', student.gender], ['Standard / grade', student.standard], ['Division', student.division],
            ['Batch year', student.batch_year], ['Nationality', student.nationality || student.country],
          ]) },
          { key: 'address', title: 'Address', fields: fields([
            ['Address line', student.address], ['Place', student.place], ['Local body', student.local_body],
            ['Post office', student.post], ['Pincode', student.pincode], ['District', student.district],
            ['State', student.state],
          ]) },
          { key: 'family', title: 'Family & contact', fields: [
            ...fields([
              ["Father's name", student.father_name], ['Parent phone', student.parent_phone],
              ['Parent email', student.parent_email],
            ]),
            ...safeNestedFields(comprehensive.family),
          ] },
          { key: 'mentors', title: 'Mentor assignments', fields: fields([
            ['Hifz mentor', student.hifz_mentor_name], ['School mentor', student.school_mentor_name],
            ['Madrasa mentor', student.madrasa_mentor_name],
          ]) },
          { key: 'admission', title: 'Admission', fields: [
            ...fields([['Admission date', student.admission_date]]),
            ...safeNestedFields(comprehensive.admission),
          ] },
          { key: 'religious', title: 'Religious education', fields: safeNestedFields(comprehensive.religious) },
          { key: 'academic', title: 'Academics', fields: safeNestedFields(comprehensive.academic || comprehensive.academics) },
          { key: 'languages', title: 'Languages', fields: safeNestedFields(comprehensive.languages) },
          { key: 'achievements', title: 'Achievements', fields: safeNestedFields(comprehensive.achievements) },
          { key: 'sulook', title: 'Sulook', fields: safeNestedFields(comprehensive.sulook) },
          { key: 'skills', title: 'Skills', fields: safeNestedFields(comprehensive.skills) },
          { key: 'contributions', title: 'Contributions', fields: safeNestedFields(comprehensive.contributions) },
          { key: 'profession', title: 'Profession', fields: safeNestedFields(comprehensive.profession) },
        ].filter(section => section.fields.length > 0),
      },
    });
  } catch (error) {
    console.error('[MOBILE STUDENT] Profile failed:', error);
    return res.status(500).json({ success: false, error: 'Student profile could not be loaded.' });
  }
}

export async function mobileStudentHifzMonth(req: Request, res: Response) {
  try {
    const studentId = String(req.params.studentId || '').trim();
    const month = String(req.query.month || '').trim();
    if (!studentId || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, error: 'Student and month (YYYY-MM) are required.' });
    }
    const access = await authorizeStudent(req, studentId);
    if ('error' in access) return res.status(access.status || 403).json({ success: false, error: access.error });
    const register = await getHifzStudentMonthRegister({
      db,
      studentId,
      month,
      academicYearId: access.academicYear.academicYearId,
    });
    return res.json({ success: true, ...register });
  } catch (error: any) {
    console.error('[MOBILE STUDENT] Hifz month failed:', error);
    return res.status(error?.statusCode || 500).json({ success: false, error: error?.message || 'Hifz month could not be loaded.' });
  }
}

export async function mobileHifzRegisterMutation(req: Request, res: Response) {
  try {
    const id = staffId(req);
    if (!id) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    const device = await requireActiveMobileDevice(req, id);
    if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });
    if (!req.body?.mutation_id) return res.status(400).json({ success: false, error: 'mutation_id is required.' });
    return batchSaveMonthlyHifzEntries(req, res);
  } catch (error) {
    console.error('[MOBILE STUDENT] Hifz mutation failed:', error);
    return res.status(500).json({ success: false, error: 'Hifz change could not be saved.' });
  }
}
