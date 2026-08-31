import crypto from 'node:crypto';

export type AttendanceRosterStateStudent = {
  adm_no?: string;
  id?: string;
  standard?: string | null;
  is_locked_outside?: boolean;
  leave_type?: string | null;
};

export function attendanceRosterStateHash(students: AttendanceRosterStateStudent[]) {
  const canonical = students
    .map(student => [
      String(student.adm_no || student.id || ''),
      String(student.standard || ''),
      student.is_locked_outside ? 'locked' : 'available',
      String(student.leave_type || ''),
    ].join('|'))
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
