import { Request, Response } from 'express';
import { db } from '../config/db';

export const getStudentReports = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    
    const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    // Calculate date range for this month
    const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Fetch all active students
    const studentsRes = await db.query(
      `SELECT s.adm_no, s.name, s.batch_year, s.standard, s.status, s.photo_url,
              (SELECT name FROM staff WHERE id = s.hifz_mentor_id) as hifz_mentor,
              (SELECT name FROM staff WHERE id = s.school_mentor_id) as school_mentor,
              (SELECT name FROM staff WHERE id = s.madrasa_mentor_id) as madrasa_mentor
       FROM students s
       WHERE s.status = 'active'
       ORDER BY s.name ASC`
    );
    const students = studentsRes.rows;

    // 2. Fetch attendance stats from student_attendance_marks (date-effective system)
    const attendanceRes = await db.query(
      `SELECT 
         student_id,
         COUNT(*) as total_classes,
         SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present,
         SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent,
         SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late,
         SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) as leave
       FROM student_attendance_marks
       WHERE date >= $1 AND date <= $2
       GROUP BY student_id`,
      [monthStart, monthEnd]
    );

    // 3. Fetch latest hifz progress
    const hifzRes = await db.query(
      `SELECT DISTINCT ON (student_id) student_id, juz_number as juz, current_page as page
       FROM hifz_progress 
       ORDER BY student_id, updated_at DESC`
    );

    // 4. Map together
    const mapped = students.map((s: any) => {
       const att = attendanceRes.rows.find((a: any) => a.student_id === s.adm_no) || { total_classes: 0, present: 0, absent: 0, late: 0, leave: 0 };
       const hifz = hifzRes.rows.find((h: any) => h.student_id === s.adm_no);

       return {
         ...s,
         attendance: att,
         hifz_progress: hifz ? `Juz ${hifz.juz}, Pg ${hifz.page}` : 'N/A',
         latest_exam_score: 'N/A'
       };
    });

    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error("Error generating student report:", error);
    res.status(500).json({ success: false, error: "Failed to generate student report" });
  }
};

export const getMentorReports = async (req: Request, res: Response) => {
  try {
     const { month, year } = req.query;
    
     const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
     const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

     const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
     const lastDay = new Date(targetYear, targetMonth, 0).getDate();
     const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

     const mentorsRes = await db.query(
       `SELECT id, name, role, phone, is_active as active
        FROM staff 
        WHERE is_active = true
        ORDER BY name ASC`
     );
     const mentors = mentorsRes.rows;

     // Mentor attendance from staff_attendance
     const attRes = await db.query(
       `SELECT 
          staff_id,
          COUNT(*) as total_marked,
          SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
          SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
          SUM(CASE WHEN status = 'leave' THEN 1 ELSE 0 END) as leave
        FROM staff_attendance 
        WHERE date >= $1 AND date <= $2
        GROUP BY staff_id`,
       [monthStart, monthEnd]
     );

     const mapped = mentors.map((m: any) => {
        const att = attRes.rows.find((a: any) => a.staff_id === m.id) || { total_marked: 0, present: 0, absent: 0, leave: 0 };
        return {
          ...m,
          attendance: att
        };
     });

     res.json({ success: true, data: mapped });
  } catch (error) {
     console.error("Error generating mentor report:", error);
     res.status(500).json({ success: false, error: "Failed to generate mentor report" });
  }
};
