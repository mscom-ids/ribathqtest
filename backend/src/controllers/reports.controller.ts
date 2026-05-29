import { Request, Response } from 'express';
import { db } from '../config/db';
import { getStudentAttendanceSummaries } from '../utils/attendance-report';
import { cachedResult, makeCacheKey } from '../utils/server-cache';

const INDIA_TIMEZONE = 'Asia/Kolkata';

type MentorColumn = 'hifz_mentor_id' | 'school_mentor_id' | 'madrasa_mentor_id';

const MENTOR_COL_MAP: Record<string, MentorColumn> = {
  hifz: 'hifz_mentor_id',
  school: 'school_mentor_id',
  madrasa: 'madrasa_mentor_id',
  madrassa: 'madrasa_mentor_id',
};

function toDateKey(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dateRange(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    days.push(toDateKey(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function normalizeScheduleStandard(label: string): string {
  const l = label.trim();
  if (l === 'Hifz Only') return 'Hifz';
  if (l === '+1 (Plus One)') return 'Plus One';
  if (l === '+2 (Plus Two)') return 'Plus Two';
  if (l.endsWith(' Standard')) return l.replace(' Standard', '');
  return l;
}

function parseStandardList(value: any): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeStandardList(values: any[] = []) {
  return values
    .map(value => normalizeScheduleStandard(String(value || '').trim()))
    .filter(Boolean);
}

function cancellationStandards(row: any): string[] {
  return normalizeStandardList(parseStandardList(row?.cancelled_standards));
}

function isFullCancellation(row: any) {
  return !!row && cancellationStandards(row).length === 0;
}

function scheduleAppliesToDate(schedule: any, dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number(schedule.day_of_week) !== date.getDay()) return false;

  const effectiveFrom = toDateKey(schedule.effective_from);
  const effectiveUntil = toDateKey(schedule.effective_until);

  if (effectiveFrom && effectiveFrom > dateStr) return false;
  if (effectiveUntil && effectiveUntil < dateStr) return false;

  return true;
}

function monthBounds(month: number, year: number) {
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { monthStart, monthEnd };
}

function resolveReportRange(req: Request) {
  const { start_date, end_date, month, year } = req.query;
  if (start_date && end_date) {
    return {
      startDate: String(start_date),
      endDate: String(end_date),
    };
  }

  const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
  const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
  const { monthStart, monthEnd } = monthBounds(targetMonth, targetYear);
  return { startDate: monthStart, endDate: monthEnd };
}

export const getStudentReports = async (req: Request, res: Response) => {
  try {
    const { month, year } = req.query;
    
    const targetMonth = month ? parseInt(month as string) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    const monthStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const monthEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // All 3 queries are independent — fire in parallel.
    const mapped = await cachedResult(
      makeCacheKey('reports:students', { month: targetMonth, year: targetYear }),
      60_000,
      async () => {
    const [studentsRes, hifzRes] = await Promise.all([
      db.query(
        `SELECT s.adm_no, s.name, s.batch_year, s.standard, s.status, s.photo_url,
                hm.name as hifz_mentor,
                sm.name as school_mentor,
                mm.name as madrasa_mentor
         FROM students s
         LEFT JOIN staff hm ON s.hifz_mentor_id = hm.id
         LEFT JOIN staff sm ON s.school_mentor_id = sm.id
         LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
         WHERE s.status = 'active'
         ORDER BY s.name ASC`
      ),
      db.query(
        `SELECT DISTINCT ON (student_id) student_id, juz_number as juz, COALESCE(end_page, start_page) as page
         FROM hifz_logs
         WHERE juz_number IS NOT NULL OR end_page IS NOT NULL OR start_page IS NOT NULL
         ORDER BY student_id, entry_date DESC, created_at DESC`
      ),
    ]);
    const students = studentsRes.rows;
    const attendanceSummaries = await getStudentAttendanceSummaries(db, students, monthStart, monthEnd);

    // Build O(1) lookup maps; the previous .find()-per-row was O(N×M).
    const hifzMap = new Map<string, any>();
    hifzRes.rows.forEach((h: any) => hifzMap.set(h.student_id, h));

    return students.map((s: any) => {
       const summary = attendanceSummaries.get(s.adm_no);
       const unmarkedClasses = summary
         ? Math.max(0, summary.notAttendedClasses - summary.absentClasses - summary.leaveClasses)
         : 0;
       const att = summary ? {
         total_classes: summary.effectiveClasses,
         planned_classes: summary.plannedClasses,
         cancelled: summary.cancelledClasses,
         attended: summary.attendedClasses,
         not_attended: summary.notAttendedClasses,
         present: summary.presentClasses,
         absent: summary.absentClasses + unmarkedClasses,
         marked_absent: summary.absentClasses,
         unmarked: unmarkedClasses,
         late: summary.lateClasses,
         leave: summary.leaveClasses,
         label: summary.attendanceLabel,
       } : { total_classes: 0, planned_classes: 0, cancelled: 0, attended: 0, not_attended: 0, present: 0, absent: 0, marked_absent: 0, unmarked: 0, late: 0, leave: 0, label: '-' };
       const hifz = hifzMap.get(s.adm_no);

       return {
         ...s,
         attendance: att,
         hifz_progress: hifz 
           ? (hifz.juz && hifz.page ? `Juz ${hifz.juz}, Pg ${hifz.page}` : hifz.juz ? `Juz ${hifz.juz}` : `Pg ${hifz.page}`) 
           : 'N/A',
         latest_exam_score: 'N/A'
       };
    });
      }
    );

    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error("Error generating student report:", error);
    res.status(500).json({ success: false, error: "Failed to generate student report" });
  }
};

export const getMentorReports = async (req: Request, res: Response) => {
  try {
     const { startDate, endDate } = resolveReportRange(req);
     if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
       return res.status(400).json({ success: false, error: 'start_date and end_date must be YYYY-MM-DD' });
     }

     const payload = await cachedResult(
       makeCacheKey('reports:mentors', { startDate, endDate }),
       30_000,
       async () => {
     const [mentorsRes, schedulesRes, studentsRes, cancellationsRes, marksRes] = await Promise.all([
       db.query(
         `SELECT id, name, role, phone, is_active as active
          FROM staff
          WHERE is_active = true
          ORDER BY name ASC`
       ),
       db.query(
         `SELECT id, class_type, name, standards, day_of_week, effective_from, effective_until
          FROM attendance_schedules
          WHERE effective_from <= $2::date
            AND (effective_until IS NULL OR effective_until >= $1::date)
          ORDER BY day_of_week, start_time`,
         [startDate, endDate]
       ),
       db.query(
         `SELECT adm_no, standard, hifz_mentor_id, school_mentor_id, madrasa_mentor_id
          FROM students
          WHERE status = 'active'
            AND standard IS NOT NULL`
       ),
       db.query(
         `SELECT schedule_id, date, cancelled_standards
          FROM attendance_cancellations
          WHERE date >= $1 AND date <= $2`,
         [startDate, endDate]
       ),
       db.query(
         `SELECT schedule_id, date, marked_by
          FROM attendance_marks
          WHERE date >= $1 AND date <= $2`,
         [startDate, endDate]
       ),
     ]);

     const mentorStats = new Map<string, any>();
     for (const mentor of mentorsRes.rows) {
       mentorStats.set(String(mentor.id), {
         ...mentor,
         planned_classes: 0,
         cancelled_classes: 0,
         required_classes: 0,
         marked_classes: 0,
         not_marked_classes: 0,
         marking_percentage: 0,
         missing_percentage: 0,
         class_breakdown: {
           hifz: { required: 0, marked: 0, not_marked: 0, cancelled: 0 },
           school: { required: 0, marked: 0, not_marked: 0, cancelled: 0 },
           madrasa: { required: 0, marked: 0, not_marked: 0, cancelled: 0 },
         },
       });
     }

     const cancellationMap = new Map<string, any>();
     cancellationsRes.rows.forEach((row: any) => {
       cancellationMap.set(`${row.schedule_id}|${toDateKey(row.date)}`, row);
     });

     const markedSet = new Set<string>();
     marksRes.rows.forEach((row: any) => {
       markedSet.add(`${row.schedule_id}|${toDateKey(row.date)}|${row.marked_by}`);
     });

     const mentorStandardsBySchedule = new Map<string, Map<string, Set<string>>>();
     for (const schedule of schedulesRes.rows) {
       const classType = String(schedule.class_type || '').toLowerCase();
       const normalizedClassType = classType === 'madrassa' ? 'madrasa' : classType;
       const mentorCol = MENTOR_COL_MAP[normalizedClassType];
       if (!mentorCol) continue;

       const scheduleStandards = normalizeStandardList(parseStandardList(schedule.standards));
       const mentorStandards = new Map<string, Set<string>>();

       for (const student of studentsRes.rows) {
         const studentStandard = normalizeScheduleStandard(String(student.standard || '').trim());
         if (scheduleStandards.length > 0 && !scheduleStandards.includes(studentStandard)) continue;

         const mentorId = student[mentorCol];
         if (!mentorId) continue;

         const key = String(mentorId);
         if (!mentorStandards.has(key)) mentorStandards.set(key, new Set<string>());
         mentorStandards.get(key)!.add(studentStandard);
       }

       mentorStandardsBySchedule.set(String(schedule.id), mentorStandards);
     }

     const dates = dateRange(startDate, endDate);
     for (const date of dates) {
       for (const schedule of schedulesRes.rows) {
         if (!scheduleAppliesToDate(schedule, date)) continue;

         const scheduleId = String(schedule.id);
         const mentorStandards = mentorStandardsBySchedule.get(scheduleId);
         if (!mentorStandards || mentorStandards.size === 0) continue;

         const classType = String(schedule.class_type || '').toLowerCase() === 'madrassa'
           ? 'madrasa'
           : String(schedule.class_type || '').toLowerCase();
         const cancellation = cancellationMap.get(`${scheduleId}|${date}`);
         const cancelledStandards = cancellationStandards(cancellation);

         for (const [mentorId, standards] of mentorStandards.entries()) {
           const stat = mentorStats.get(mentorId);
           if (!stat) continue;

           stat.planned_classes += 1;

           const fullyCancelledForMentor = isFullCancellation(cancellation)
             || (!!cancellation && Array.from(standards).every(std => cancelledStandards.includes(normalizeScheduleStandard(std))));

           if (fullyCancelledForMentor) {
             stat.cancelled_classes += 1;
             if (stat.class_breakdown[classType]) stat.class_breakdown[classType].cancelled += 1;
             continue;
           }

           stat.required_classes += 1;
           if (stat.class_breakdown[classType]) stat.class_breakdown[classType].required += 1;

           if (markedSet.has(`${scheduleId}|${date}|${mentorId}`)) {
             stat.marked_classes += 1;
             if (stat.class_breakdown[classType]) stat.class_breakdown[classType].marked += 1;
           } else {
             stat.not_marked_classes += 1;
             if (stat.class_breakdown[classType]) stat.class_breakdown[classType].not_marked += 1;
           }
         }
       }
     }

     const mapped = Array.from(mentorStats.values()).map((mentor: any) => {
       const required = Number(mentor.required_classes || 0);
       const marked = Number(mentor.marked_classes || 0);
       const notMarked = Number(mentor.not_marked_classes || 0);
       const markingPercentage = required > 0 ? Math.round((marked / required) * 1000) / 10 : 0;
       const missingPercentage = required > 0 ? Math.round((notMarked / required) * 1000) / 10 : 0;

       return {
         ...mentor,
         marking_percentage: markingPercentage,
         missing_percentage: missingPercentage,
         attendance: {
           planned_classes: mentor.planned_classes,
           cancelled_classes: mentor.cancelled_classes,
           required_classes: required,
           marked_classes: marked,
           not_marked_classes: notMarked,
           marking_percentage: markingPercentage,
           missing_percentage: missingPercentage,
         },
       };
     });

     const totals = mapped.reduce((acc: any, mentor: any) => {
       acc.planned_classes += mentor.planned_classes;
       acc.cancelled_classes += mentor.cancelled_classes;
       acc.required_classes += mentor.required_classes;
       acc.marked_classes += mentor.marked_classes;
       acc.not_marked_classes += mentor.not_marked_classes;
       return acc;
     }, { planned_classes: 0, cancelled_classes: 0, required_classes: 0, marked_classes: 0, not_marked_classes: 0 });

     return {
       success: true,
       period: { start_date: startDate, end_date: endDate },
       totals,
       data: mapped,
     };
       }
     );

     res.json(payload);
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
        const [studentRes, logsRes, lifetimeLogsRes] = await Promise.all([
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
                `SELECT id, student_id, mode, entry_date, surah_name,
                        start_v, end_v, start_page, end_page, juz_number, juz_portion
                 FROM hifz_logs
                 WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3
                 ORDER BY entry_date DESC, created_at DESC`,
                 [student_id, start_date, end_date]
            ),
            db.query(
                `SELECT id, student_id, mode, entry_date, surah_name,
                        start_v, end_v, start_page, end_page, juz_number
                 FROM hifz_logs
                 WHERE student_id = $1 AND mode = 'New Verses'
                 ORDER BY entry_date DESC, created_at DESC`,
                 [student_id]
            ),
        ]);

        if (studentRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Student not found" });
        }

        const attendanceSummaries = await getStudentAttendanceSummaries(
            db,
            studentRes.rows,
            start_date as string,
            end_date as string
        );
        const attendanceSummary = attendanceSummaries.get(student_id as string);

        // Compute aggregations in memory for UI compatibility
        const hifzAggByMode = new Map<string, any>();
        logsRes.rows.forEach((log: any) => {
            const mode = log.mode || 'Unknown';
            const metric = hifzAggByMode.get(mode) || { mode, entry_count: 0, verses_recited: 0, pages_recited: 0 };
            metric.entry_count++;
            if (log.mode === 'New Verses') {
                if (log.start_page && log.end_page) metric.pages_recited += (Number(log.end_page) - Number(log.start_page) + 1);
                if (log.start_v && log.end_v) metric.verses_recited += Math.max(0, Number(log.end_v) - Number(log.start_v) + 1);
            }
            hifzAggByMode.set(mode, metric);
        });
        const hifz_logs_agg = Array.from(hifzAggByMode.values());

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
                attendance: attendanceSummary?.sessions || [],
                attendance_totals: attendanceSummary || null,
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
