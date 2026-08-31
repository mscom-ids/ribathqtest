import { Request, Response } from 'express';
import { db } from '../../config/db';
import { requireActiveMobileDevice } from './mobile-sync.service';

function text(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export async function createMobileStudent(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const staffId = typeof user?.id === 'string' ? user.id : null;
    if (!staffId) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (!['admin', 'controller'].includes(String(user.role).toLowerCase())) {
      return res.status(403).json({ success: false, error: 'Only administrators can add students' });
    }
    const device = await requireActiveMobileDevice(req, staffId);
    if (!device) return res.status(403).json({ success: false, error: 'Unknown or revoked mobile device' });

    const admNo = text(req.body?.admissionNumber, 30);
    const name = text(req.body?.name, 200);
    const standard = text(req.body?.standard, 50);
    const dateOfBirth = text(req.body?.dateOfBirth, 10);
    const gender = text(req.body?.gender, 20);
    const parentPhone = text(req.body?.parentPhone, 30);
    if (!admNo || !/^[A-Za-z0-9/_-]+$/.test(admNo) || !name || !standard || !dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      return res.status(400).json({ success: false, error: 'Admission number, name, date of birth and class are required' });
    }

    const result = await db.query(
      `INSERT INTO students (adm_no, name, dob, standard, gender, phone, status, admission_date)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', CURRENT_DATE)
       RETURNING adm_no AS id, adm_no, name, standard, gender, phone, status`,
      [admNo, name, dateOfBirth, standard, gender, parentPhone]
    );
    return res.status(201).json({ success: true, student: result.rows[0] });
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ success: false, error: 'That admission number already exists' });
    }
    console.error('[MOBILE ADMIN] Create student failed:', error);
    return res.status(500).json({ success: false, error: 'Student could not be created' });
  }
}
