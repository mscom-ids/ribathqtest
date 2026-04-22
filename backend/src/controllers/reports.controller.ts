import { Request, Response } from 'express';
import { db } from '../config/db';

export const getStudentReports = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    
    const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // All 3 queries are independent — fire in parallel.
    const [studentsRes, attendanceRes, hifzRes] = await Promise.all([
      db.query(
        `SELECT s.adm_no, s.name, s.batch_year, s.standard, s.status, s.photo_url,
                (SELECT name FROM staff WHERE id = s.hifz_mentor_id) as hifz_mentor,
                (SELECT name FROM staff WHERE id = s.school_mentor_id) as school_mentor,
                (SELECT name FROM staff WHERE id = s.madrasa_mentor_id) as madrasa_mentor
         FROM students s
         WHERE s.status = 'active'
         ORDER BY s.name ASC`
      ),
      db.query(
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
      ),
      db.query(
        `SELECT DISTINCT ON (student_id) student_id, juz_number as juz, current_page as page
         FROM hifz_progress
         ORDER BY student_id, updated_at DESC`
      ),
    ]);
    const students = studentsRes.rows;

    // Build O(1) lookup maps; the previous .find()-per-row was O(N×M).
    const attMap = new Map<string, any>();
    attendanceRes.rows.forEach((a: any) => attMap.set(a.student_id, a));
    const hifzMap = new Map<string, any>();
    hifzRes.rows.forEach((h: any) => hifzMap.set(h.student_id, h));

    const mapped = students.map((s: any) => {
       const att = attMap.get(s.adm_no) || { total_classes: 0, present: 0, absent: 0, late: 0, leave: 0 };
       const hifz = hifzMap.get(s.adm_no);

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

     // Both queries are independent → parallel.
     const [mentorsRes, attRes] = await Promise.all([
       db.query(
         `SELECT id, name, role, phone, is_active as active
          FROM staff
          WHERE is_active = true
          ORDER BY name ASC`
       ),
       db.query(
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
       ),
     ]);
     const mentors = mentorsRes.rows;

     const attMap = new Map<string, any>();
     attRes.rows.forEach((a: any) => attMap.set(a.staff_id, a));

     const mapped = mentors.map((m: any) => {
        const att = attMap.get(m.id) || { total_marked: 0, present: 0, absent: 0, leave: 0 };
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

export const getUnifiedStudentProgressReport = async (req: Request, res: Response) => {
    try {
        const { student_id, type, start_date, end_date } = req.query;
        if (!student_id || !type || !start_date || !end_date) {
            return res.status(400).json({ success: false, error: "Missing required parameters" });
        }

        if (type === 'Monthly') {
            const endD = new Date(end_date as string);
            const validationDate = new Date(endD);
            validationDate.setDate(validationDate.getDate() + 2); // 2 days after month end
            
            // To ignore time components
            const now = new Date();
            now.setHours(0,0,0,0);
            validationDate.setHours(0,0,0,0);

            if (now < validationDate) {
                return res.status(403).json({ success: false, error: "Monthly report is only available 2 days after the month ends." });
            }
        }

        // All 4 queries are independent — fire in parallel.
        const [studentRes, attendanceRes, logsRes, lifetimeLogsRes] = await Promise.all([
            db.query(
                `SELECT s.adm_no, s.name, s.batch_year, s.standard, s.status, s.photo_url,
                      (SELECT name FROM staff WHERE id = s.hifz_mentor_id) as hifz_mentor,
                      (SELECT name FROM staff WHERE id = s.school_mentor_id) as school_mentor,
                      (SELECT name FROM staff WHERE id = s.madrasa_mentor_id) as madrasa_mentor
               FROM students s
               WHERE s.adm_no = $1`,
                [student_id]
            ),
            db.query(
                `SELECT
                    sch.id as schedule_id,
                    COALESCE(sch.name, 'Session') as session,
                    SUM(CASE WHEN m.status = 'Present' THEN 1 ELSE 0 END) as present,
                    SUM(CASE WHEN m.status = 'Absent' THEN 1 ELSE 0 END) as absent,
                    SUM(CASE WHEN m.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled,
                    COUNT(*) as total
                 FROM student_attendance_marks m
                 LEFT JOIN attendance_schedules sch ON m.schedule_id = sch.id
                 WHERE m.student_id = $1 AND m.date >= $2 AND m.date <= $3
                 GROUP BY sch.id, sch.name`,
                 [student_id, start_date, end_date]
            ),
            db.query(
                `SELECT *
                 FROM hifz_logs
                 WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
                 [student_id, start_date, end_date]
            ),
            db.query(
                `SELECT *
                 FROM hifz_logs
                 WHERE student_id = $1 AND mode = 'New Verses'`,
                 [student_id]
            ),
        ]);

        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Student not found" });
        }

        // Compute aggregations in memory for UI compatibility
        const hifz_logs_agg = logsRes.rows.reduce((acc: any[], log: any) => {
            let metric = acc.find(m => m.mode === log.mode);
            if (!metric) {
                metric = { mode: log.mode, entry_count: 0, verses_recited: 0, pages_recited: 0 };
                acc.push(metric);
            }
            metric.entry_count++;
            if (log.mode === 'New Verses') {
                if (log.start_page && log.end_page) metric.pages_recited += (Number(log.end_page) - Number(log.start_page) + 1);
                // Basic verse approximation if true columns are unavailable
                if (log.verses) metric.verses_recited += Number(log.verses)
            }
            return acc;
        }, []);

        const revision_days = new Set(
            logsRes.rows.filter(l => l.mode === 'Recent Revision').map(l => {
                // Ensure date format string consistency for Set uniqueness
                return l.entry_date instanceof Date ? l.entry_date.toISOString().split('T')[0] : l.entry_date;
            })
        ).size;

        res.json({
            success: true,
            data: {
                student: studentRes.rows[0],
                attendance: attendanceRes.rows,
                period_logs: logsRes.rows,
                lifetime_new_logs: lifetimeLogsRes.rows,
                hifz_logs_agg,
                revision_days
            }
        });
    } catch (error) {
        console.error("Error generating unified progress report:", error);
        res.status(500).json({ success: false, error: "Failed to generate report" });
    }
};
