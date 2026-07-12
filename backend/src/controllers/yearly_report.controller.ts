import { Request, Response } from 'express';
import { db } from '../config/db';
import { getAcademicYearContext } from '../utils/academic-year';
import { getAcademicYearBounds, resolveStudentReportWindow, studentExitDate } from '../utils/report-window';
import { calculateCoveredPagesFromLogs } from '../utils/quran-data';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const INDIA_TZ = 'Asia/Kolkata';

function toDateKey(value: any): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: INDIA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function clampDate(date: string, min: string | null | undefined, max: string | null | undefined): string {
  let result = date;
  if (min && result < min) result = min;
  if (max && result > max) result = max;
  return result;
}

function parseJsonArray(value: any): string[] {
  if (Array.isArray(value)) return value.map(String);
  try { const p = JSON.parse(value || '[]'); return Array.isArray(p) ? p.map(String) : []; }
  catch { return []; }
}

function normalizeStd(label: string): string {
  const l = (label || '').trim();
  if (l === 'Hifz Only') return 'Hifz';
  if (l === '+1 (Plus One)') return 'Plus One';
  if (l === '+2 (Plus Two)') return 'Plus Two';
  if (l.endsWith(' Standard')) return l.replace(' Standard', '');
  return l;
}

function dateRange(start: string, end: string): string[] {
  const days: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) { days.push(toDateKey(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
}

// Determine the overlap of a schedule's validity window with the report window.
// Returns null if no overlap.
function scheduleWindow(
  scheduleEffectiveFrom: string | null,
  scheduleEffectiveUntil: string | null,
  reportStart: string,
  reportEnd: string
): { start: string; end: string } | null {
  const from = scheduleEffectiveFrom || reportStart;
  const until = scheduleEffectiveUntil || reportEnd;
  const start = from > reportStart ? from : reportStart;
  const end = until < reportEnd ? until : reportEnd;
  if (start > end) return null;
  return { start, end };
}

function dayOfWeekMatch(dateStr: string, dayOfWeek: number): boolean {
  return new Date(`${dateStr}T00:00:00`).getDay() === dayOfWeek;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core: fetch all data for one student in one period
// ──────────────────────────────────────────────────────────────────────────────

async function fetchStudentYearlyData(
  studentId: string,
  reportStart: string,
  reportEnd: string
) {
  const [
    schedulesRes,
    cancellationsRes,
    attendanceMarksRes,
    studentMarksRes,
    hifzLogsRes,
    leavesRes,
    examsRes,
    mentorHistoryRes,
    institutionalLeavesRes,
  ] = await Promise.all([
    // All attendance schedules that overlap the report window
    db.query(
      `SELECT id, class_type, name, standards, day_of_week, start_time, end_time,
              effective_from, effective_until
       FROM attendance_schedules
       WHERE (effective_until IS NULL OR effective_until >= $1::date)
         AND effective_from <= $2::date
       ORDER BY class_type, day_of_week, start_time`,
      [reportStart, reportEnd]
    ),
    // Cancellations in window
    db.query(
      `SELECT schedule_id, date, cancelled_standards
       FROM attendance_cancellations
       WHERE date >= $1 AND date <= $2`,
      [reportStart, reportEnd]
    ),
    // Mentor-level attendance marks (to infer un-marked classes)
    db.query(
      `SELECT schedule_id, date, marked_by
       FROM attendance_marks
       WHERE date >= $1 AND date <= $2`,
      [reportStart, reportEnd]
    ),
    // Per-student attendance marks
    db.query(
      `SELECT schedule_id, date, status, marked_by
       FROM student_attendance_marks
       WHERE student_id = $1 AND date >= $2 AND date <= $3`,
      [studentId, reportStart, reportEnd]
    ),
    // Hifz logs
    db.query(
      `SELECT id, mode, entry_date, surah_name, start_v, end_v, start_page, end_page,
              juz_number, juz_portion, created_at
       FROM hifz_logs
       WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3
       ORDER BY entry_date ASC, created_at ASC`,
      [studentId, reportStart, reportEnd]
    ),
    // Leaves in window
    db.query(
      `SELECT id, leave_type, reason, status,
              start_datetime, end_datetime,
              actual_return_datetime, return_status,
              created_at
       FROM student_leaves
       WHERE student_id = $1
         AND status NOT IN ('cancelled', 'rejected')
         AND start_datetime <= $3::timestamptz
         AND (end_datetime >= $2::timestamptz OR end_datetime IS NULL)
       ORDER BY start_datetime ASC`,
      [studentId, reportStart, reportEnd]
    ),
    // Exam results for this student (linked to academic year via exam)
    db.query(
      `SELECT er.id, er.marks_obtained, er.max_marks, er.grade, er.remarks,
              es.subject_name, e.name AS exam_name, e.department,
              e.start_date AS exam_date, e.academic_year_id
       FROM exam_results er
       JOIN exam_subjects es ON es.id = er.subject_id
       JOIN exams e ON e.id = er.exam_id
       WHERE er.student_id = $1
         AND e.start_date >= $2 AND e.start_date <= $3
       ORDER BY e.start_date ASC, es.subject_name ASC`,
      [studentId, reportStart, reportEnd]
    ),
    // Hifz mentor history during period
    db.query(
      `SELECT hmh.id, hmh.assigned_from, hmh.assigned_until, hmh.notes,
              st.name AS mentor_name, st.id AS mentor_id
       FROM hifz_mentor_history hmh
       LEFT JOIN staff st ON st.id = hmh.mentor_id
       WHERE hmh.student_id = $1
         AND hmh.assigned_from <= $3::date
         AND (hmh.assigned_until IS NULL OR hmh.assigned_until >= $2::date)
       ORDER BY hmh.assigned_from ASC`,
      [studentId, reportStart, reportEnd]
    ).catch(() => ({ rows: [] as any[] })), // graceful if table doesn't exist yet
    // Institutional leaves (for computing cancelled classes)
    db.query(
      `SELECT id, start_datetime, end_datetime, target_classes, is_entire_institution
       FROM institutional_leaves
       WHERE start_datetime <= $2::timestamptz
         AND end_datetime >= $1::timestamptz`,
      [reportStart, reportEnd]
    ).catch(() => ({ rows: [] as any[] })),
  ]);

  return {
    schedules: schedulesRes.rows,
    cancellations: cancellationsRes.rows,
    attendanceMarks: attendanceMarksRes.rows,
    studentMarks: studentMarksRes.rows,
    hifzLogs: hifzLogsRes.rows,
    leaves: leavesRes.rows,
    exams: examsRes.rows,
    mentorHistory: mentorHistoryRes.rows,
    institutionalLeaves: institutionalLeavesRes.rows,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Attendance computation
// ──────────────────────────────────────────────────────────────────────────────

type AttendanceBreakdown = {
  schedule_id: string;
  schedule_name: string;
  class_type: string;
  effective_from: string | null;
  effective_until: string | null;
  total_scheduled: number;   // days the schedule applied in the window
  cancelled: number;
  effective_classes: number; // scheduled - cancelled
  present: number;
  absent: number;
  late: number;
  on_leave: number;
  unmarked: number;          // class happened but student mark not recorded
  attendance_pct: number;
};

function computeAttendanceBreakdowns(
  student: any,
  reportStart: string,
  reportEnd: string,
  data: Awaited<ReturnType<typeof fetchStudentYearlyData>>
): AttendanceBreakdown[] {
  const studentStd = normalizeStd(student.standard || student.school_standard || '');
  const madrasaStd = normalizeStd(student.madrasa_standard || '');

  // Build lookup maps
  const cancellationMap = new Map<string, any>();
  data.cancellations.forEach(c => {
    cancellationMap.set(`${c.schedule_id}|${toDateKey(c.date)}`, c);
  });

  const markedSet = new Set<string>(); // schedule|date that were marked by mentor
  data.attendanceMarks.forEach(m => markedSet.add(`${m.schedule_id}|${toDateKey(m.date)}`));

  const studentMarkMap = new Map<string, { status: string }>();
  data.studentMarks.forEach(m => {
    studentMarkMap.set(`${m.schedule_id}|${toDateKey(m.date)}`, { status: m.status });
  });

  // Determine which standards this student belongs to for each schedule type
  function studentInSchedule(schedule: any): boolean {
    const standards = parseJsonArray(schedule.standards).map(normalizeStd);
    if (standards.length === 0) return true; // applies to all
    const type = String(schedule.class_type || '').toLowerCase();
    if (type === 'hifz') return true; // Hifz attendance is per-session, student is included if hifz student
    if (type === 'school' || type === 'madrassa' || type === 'madrasa') {
      const compareTo = (type === 'school') ? studentStd : madrasaStd;
      return standards.includes(compareTo);
    }
    return standards.includes(studentStd);
  }

  // Check if an institutional leave cancels a schedule on a date for this student
  function isInstLeaveCancellation(schedule: any, dateStr: string): boolean {
    const schedStart = new Date(`${dateStr}T${String(schedule.start_time || '00:00:00').slice(0, 8)}+05:30`);
    const schedEnd = new Date(`${dateStr}T${String(schedule.end_time || '23:59:59').slice(0, 8)}+05:30`);
    for (const leave of data.institutionalLeaves) {
      const lStart = new Date(leave.start_datetime);
      const lEnd = new Date(leave.end_datetime);
      if (!(schedStart < lEnd && schedEnd > lStart)) continue;
      if (leave.is_entire_institution) return true;
      const targets = parseJsonArray(leave.target_classes).map(normalizeStd);
      const type = String(schedule.class_type || '').toLowerCase();
      const compareTo = (type === 'school') ? studentStd : (type === 'madrasa' || type === 'madrassa') ? madrasaStd : studentStd;
      if (targets.includes(compareTo)) return true;
    }
    return false;
  }

  const breakdowns: AttendanceBreakdown[] = [];

  for (const schedule of data.schedules) {
    if (!studentInSchedule(schedule)) continue;

    const win = scheduleWindow(
      toDateKey(schedule.effective_from),
      schedule.effective_until ? toDateKey(schedule.effective_until) : null,
      reportStart,
      reportEnd
    );
    if (!win) continue;

    const days = dateRange(win.start, win.end);
    let totalScheduled = 0, cancelled = 0, present = 0, absent = 0, late = 0, onLeave = 0, unmarked = 0;

    for (const day of days) {
      if (!dayOfWeekMatch(day, Number(schedule.day_of_week))) continue;
      totalScheduled++;

      const cancelKey = `${schedule.id}|${day}`;
      const persistedCancellation = cancellationMap.get(cancelKey);
      const isCancelled = (() => {
        if (!persistedCancellation && !isInstLeaveCancellation(schedule, day)) return false;
        if (persistedCancellation) {
          const cs = parseJsonArray(persistedCancellation.cancelled_standards).map(normalizeStd);
          if (cs.length === 0) return true; // full cancellation
          const type = String(schedule.class_type || '').toLowerCase();
          const compareTo = (type === 'school') ? studentStd : (type === 'madrasa' || type === 'madrassa') ? madrasaStd : studentStd;
          return cs.includes(compareTo);
        }
        return false;
      })();

      if (isCancelled) { cancelled++; continue; }

      const markKey = `${schedule.id}|${day}`;
      const studentMark = studentMarkMap.get(markKey);
      const classWasMarked = markedSet.has(markKey);

      if (studentMark) {
        const st = String(studentMark.status || '').toLowerCase();
        if (st === 'present') present++;
        else if (st === 'late') { present++; late++; }
        else if (st === 'on_leave' || st === 'leave') onLeave++;
        else absent++;
      } else if (classWasMarked) {
        // Class was marked by mentor but student has no entry → absent (unmarked by student)
        absent++;
        unmarked++;
      }
      // If class was never marked at all, we don't count it either way (schedule happened but no data)
    }

    const effective = totalScheduled - cancelled;
    const pct = effective > 0 ? Math.round((present / effective) * 1000) / 10 : 0;
    const classType = String(schedule.class_type || '').toLowerCase();
    const normalizedType = classType === 'madrassa' ? 'madrasa' : classType;

    breakdowns.push({
      schedule_id: String(schedule.id),
      schedule_name: schedule.name || `${schedule.class_type} (${schedule.start_time})`,
      class_type: normalizedType,
      effective_from: toDateKey(schedule.effective_from) || null,
      effective_until: schedule.effective_until ? toDateKey(schedule.effective_until) : null,
      total_scheduled: totalScheduled,
      cancelled,
      effective_classes: effective,
      present,
      absent,
      late,
      on_leave: onLeave,
      unmarked,
      attendance_pct: pct,
    });
  }

  return breakdowns;
}

// ──────────────────────────────────────────────────────────────────────────────
// Hifz progress computation
// ──────────────────────────────────────────────────────────────────────────────

function computeHifzProgress(logs: any[]) {
  const byMode = new Map<string, { count: number; pages: number; verses: number; juz: Set<number> }>();

  for (const log of logs) {
    const mode = log.mode || 'Unknown';
    const entry = byMode.get(mode) || { count: 0, pages: 0, verses: 0, juz: new Set<number>() };
    entry.count++;
    if (mode === 'New Verses') {
      if (log.start_page && log.end_page) entry.pages += Math.max(0, Number(log.end_page) - Number(log.start_page) + 1);
      if (log.start_v && log.end_v) entry.verses += Math.max(0, Number(log.end_v) - Number(log.start_v) + 1);
    }
    if (log.juz_number) entry.juz.add(Number(log.juz_number));
    byMode.set(mode, entry);
  }

  const modes = Array.from(byMode.entries()).map(([mode, data]) => ({
    mode,
    sessions: data.count,
    pages_covered: data.pages,
    verses_covered: data.verses,
    unique_juz: Array.from(data.juz).sort((a, b) => a - b),
  }));

  const newVerses = byMode.get('New Verses');
  const exactNewPages = calculateCoveredPagesFromLogs(
    logs.filter(log => log.mode === 'New Verses')
  );
  const revisionDays = new Set(
    logs.filter(l => l.mode === 'Recent Revision').map(l => toDateKey(l.entry_date))
  ).size;

  return {
    total_sessions: logs.length,
    new_verses_sessions: newVerses?.count || 0,
    new_pages_memorized: exactNewPages,
    new_verses_memorized: newVerses?.verses || 0,
    revision_days: revisionDays,
    breakdown_by_mode: modes,
    recent_logs: logs.slice(-10).reverse(), // last 10 entries
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/yearly-report/student/:studentId
// ──────────────────────────────────────────────────────────────────────────────

export const getStudentYearlyReport = async (req: Request, res: Response) => {
  try {
    const studentId: string = String(req.params.studentId);
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);

    // Fetch student
    const studentRes = await db.query(
      `SELECT s.adm_no, s.name, s.batch_year, s.standard, s.status, s.photo_url,
              s.admission_date, s.exit_date, s.comprehensive_details,
              s.hifz_mentor_id, s.school_mentor_id, s.madrasa_mentor_id,
              sys.school_standard, sys.school_section,
              sys.madrasa_standard, sys.madrasa_section,
              sys.hifz_mentor_id AS snapshot_hifz_mentor_id,
              sys.status AS snapshot_status,
              hm.name AS hifz_mentor_name,
              sm.name AS school_mentor_name,
              mm.name AS madrasa_mentor_name,
              ms.madrasa_standard AS madrasa_std_field,
              s.hifz_standard
       FROM students s
       LEFT JOIN student_year_snapshots sys
              ON sys.student_id = s.adm_no
             AND sys.academic_year_id = $2
       LEFT JOIN staff hm ON COALESCE(sys.hifz_mentor_id, s.hifz_mentor_id) = hm.id
       LEFT JOIN staff sm ON s.school_mentor_id = sm.id
       LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
       LEFT JOIN student_madrasa_enrollments ms
              ON ms.student_id = s.adm_no AND ms.academic_year_id = $2
       WHERE s.adm_no = $1`,
      [studentId, academicContext.academicYearId]
    );

    if (studentRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const raw = studentRes.rows[0];
    const student = {
      ...raw,
      standard: raw.school_standard || raw.standard,
      madrasa_standard: raw.madrasa_standard || raw.madrasa_std_field || raw.madrassa_standard || null,
    };

    // Determine report window
    const academicBounds = await getAcademicYearBounds(db, academicContext.academicYearId);
    const requestedStart: string = String(Array.isArray(req.query.start_date) ? req.query.start_date[0] : req.query.start_date || academicBounds.start_date || '');
    const requestedEnd: string = String(Array.isArray(req.query.end_date) ? req.query.end_date[0] : req.query.end_date || academicBounds.end_date || '');

    if (!requestedStart || !requestedEnd) {
      return res.status(400).json({
        success: false,
        error: 'Please select an academic year or provide start_date and end_date.',
      });
    }

    // Augment student with exit_date from comprehensive_details as fallback
    if (!student.exit_date) {
      student.exit_date = studentExitDate(student);
    }

    const reportWindow = resolveStudentReportWindow(student, requestedStart, requestedEnd, academicBounds);
    if (!reportWindow.has_overlap) {
      return res.status(422).json({
        success: false,
        error: 'No report available for this period. The student was not enrolled during this time.',
        report_window: reportWindow,
      });
    }

    const rStart: string = String(reportWindow.effective_start_date);
    const rEnd: string = String(reportWindow.effective_end_date);

    // Determine if this is a Hifz student
    const isHifzStudent = !!(
      student.hifz_mentor_id ||
      student.snapshot_hifz_mentor_id ||
      (student.hifz_standard && student.hifz_standard.trim() !== '')
    );

    // Fetch all data
    const data = await fetchStudentYearlyData(studentId, rStart, rEnd);

    // Compute attendance breakdowns
    const attendanceBreakdowns = computeAttendanceBreakdowns(student, rStart, rEnd, data);

    // Group by class type
    const groupedAttendance = {
      hifz: attendanceBreakdowns.filter(b => b.class_type === 'hifz'),
      school: attendanceBreakdowns.filter(b => b.class_type === 'school'),
      madrasa: attendanceBreakdowns.filter(b => b.class_type === 'madrasa'),
    };

    function sumBreakdown(items: AttendanceBreakdown[]) {
      return items.reduce(
        (acc, item) => ({
          total_scheduled: acc.total_scheduled + item.total_scheduled,
          cancelled: acc.cancelled + item.cancelled,
          effective_classes: acc.effective_classes + item.effective_classes,
          present: acc.present + item.present,
          absent: acc.absent + item.absent,
          late: acc.late + item.late,
          on_leave: acc.on_leave + item.on_leave,
          unmarked: acc.unmarked + item.unmarked,
          attendance_pct: 0,
        }),
        { total_scheduled: 0, cancelled: 0, effective_classes: 0, present: 0, absent: 0, late: 0, on_leave: 0, unmarked: 0, attendance_pct: 0 }
      );
    }

    const hifzSummary = sumBreakdown(groupedAttendance.hifz);
    const schoolSummary = sumBreakdown(groupedAttendance.school);
    const madrasaSummary = sumBreakdown(groupedAttendance.madrasa);
    [hifzSummary, schoolSummary, madrasaSummary].forEach(s => {
      s.attendance_pct = s.effective_classes > 0 ? Math.round((s.present / s.effective_classes) * 1000) / 10 : 0;
    });

    const overallSummary = sumBreakdown(attendanceBreakdowns);
    overallSummary.attendance_pct = overallSummary.effective_classes > 0
      ? Math.round((overallSummary.present / overallSummary.effective_classes) * 1000) / 10
      : 0;

    // Hifz progress
    const hifzProgress = isHifzStudent
      ? computeHifzProgress(data.hifzLogs)
      : null;

    // Exam results grouped by exam
    const examsByExam = new Map<string, any>();
    for (const result of data.exams) {
      const key = result.exam_name;
      if (!examsByExam.has(key)) {
        examsByExam.set(key, {
          exam_name: result.exam_name,
          department: result.department,
          exam_date: result.exam_date,
          subjects: [],
          total_obtained: 0,
          total_max: 0,
        });
      }
      const exam = examsByExam.get(key);
      exam.subjects.push({
        subject_name: result.subject_name,
        marks_obtained: result.marks_obtained,
        max_marks: result.max_marks,
        grade: result.grade,
        remarks: result.remarks,
      });
      exam.total_obtained += Number(result.marks_obtained || 0);
      exam.total_max += Number(result.max_marks || 0);
    }

    // Mentor history entries (clamped to window)
    const mentorHistory = data.mentorHistory.map((h: any) => ({
      mentor_name: h.mentor_name || 'Unassigned',
      mentor_id: h.mentor_id,
      from_date: toDateKey(h.assigned_from),
      until_date: h.assigned_until ? toDateKey(h.assigned_until) : null,
      notes: h.notes || null,
    }));

    res.json({
      success: true,
      report_window: reportWindow,
      academic_year: {
        id: academicContext.academicYearId,
        mode: academicContext.mode,
        start_date: academicBounds.start_date,
        end_date: academicBounds.end_date,
      },
      student: {
        adm_no: student.adm_no,
        name: student.name,
        photo_url: student.photo_url,
        status: student.status,
        admission_date: toDateKey(student.admission_date),
        exit_date: student.exit_date ? toDateKey(student.exit_date) : null,
        school_standard: student.standard || null,
        school_section: student.school_section || null,
        madrasa_standard: student.madrasa_standard || null,
        madrasa_section: student.madrasa_section || null,
        is_hifz_student: isHifzStudent,
        hifz_mentor_name: student.hifz_mentor_name || null,
        school_mentor_name: student.school_mentor_name || null,
        madrasa_mentor_name: student.madrasa_mentor_name || null,
        batch_year: student.batch_year,
      },
      attendance: {
        overall: overallSummary,
        hifz: {
          summary: hifzSummary,
          sessions: groupedAttendance.hifz,
        },
        school: {
          summary: schoolSummary,
          subjects: groupedAttendance.school,
        },
        madrasa: {
          summary: madrasaSummary,
          subjects: groupedAttendance.madrasa,
        },
      },
      hifz_progress: isHifzStudent
        ? hifzProgress
        : { enrolled: false, message: 'Not enrolled in Hifz classes' },
      hifz_mentor_history: isHifzStudent ? mentorHistory : [],
      leaves: data.leaves.map((l: any) => ({
        id: l.id,
        leave_type: l.leave_type,
        reason: l.reason,
        status: l.status,
        start_date: toDateKey(l.start_datetime),
        end_date: toDateKey(l.end_datetime),
        actual_return_date: l.actual_return_datetime ? toDateKey(l.actual_return_datetime) : null,
        return_status: l.return_status,
      })),
      exam_results: Array.from(examsByExam.values()),
    });
  } catch (error: any) {
    console.error('[yearly_report] getStudentYearlyReport error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate yearly report' });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/yearly-report/class/:classType
// Returns a summary row per student in a class for the year
// ──────────────────────────────────────────────────────────────────────────────

export const getClassYearlyReport = async (req: Request, res: Response) => {
  try {
    const { classType } = req.params;
    const type = String(classType || '').toLowerCase();
    if (!['school', 'madrasa', 'hifz'].includes(type)) {
      return res.status(400).json({ success: false, error: 'classType must be school, madrasa, or hifz' });
    }

    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);
    const academicBounds = await getAcademicYearBounds(db, academicContext.academicYearId);
    const requestedStart: string = String(Array.isArray(req.query.start_date) ? req.query.start_date[0] : req.query.start_date || academicBounds.start_date || '');
    const requestedEnd: string = String(Array.isArray(req.query.end_date) ? req.query.end_date[0] : req.query.end_date || academicBounds.end_date || '');

    if (!requestedStart || !requestedEnd) {
      return res.status(400).json({ success: false, error: 'Select an academic year or provide start_date and end_date.' });
    }

    const standard = req.query.standard ? String(req.query.standard) : null;
    const section = req.query.section ? String(req.query.section) : null;

    // Fetch students in this class for this year
    let studentsRes;
    if (type === 'hifz') {
      studentsRes = await db.query(
        `SELECT s.adm_no, s.name, s.photo_url, s.admission_date, s.exit_date,
                s.status, s.hifz_standard, s.hifz_mentor_id,
                hp.mentor_id AS hifz_profile_mentor_id,
                st.name AS hifz_mentor_name,
                sys.school_standard, sys.school_section
         FROM students s
         LEFT JOIN student_hifz_profiles hp ON hp.student_id = s.adm_no
         LEFT JOIN staff st ON COALESCE(hp.mentor_id, s.hifz_mentor_id) = st.id
         LEFT JOIN student_year_snapshots sys
                ON sys.student_id = s.adm_no AND sys.academic_year_id = $1
         WHERE s.status = 'active'
           AND (hp.active = true OR s.hifz_mentor_id IS NOT NULL)
         ORDER BY st.name NULLS LAST, s.name ASC`,
        [academicContext.academicYearId]
      );
    } else if (type === 'school') {
      const params: any[] = [academicContext.academicYearId];
      let where = `se.academic_year_id = $1 AND se.status = 'active'`;
      if (standard) { params.push(standard); where += ` AND se.school_standard = $${params.length}`; }
      if (section) { params.push(section); where += ` AND se.school_section = $${params.length}`; }
      studentsRes = await db.query(
        `SELECT s.adm_no, s.name, s.photo_url, s.admission_date, s.exit_date,
                s.status, se.school_standard AS standard, se.school_section AS section,
                sm.name AS school_mentor_name
         FROM student_school_enrollments se
         JOIN students s ON s.adm_no = se.student_id
         LEFT JOIN staff sm ON s.school_mentor_id = sm.id
         WHERE ${where}
         ORDER BY se.school_standard, se.school_section, s.name ASC`,
        params
      );
    } else {
      const params: any[] = [academicContext.academicYearId];
      let where = `me.academic_year_id = $1 AND me.status = 'active'`;
      if (standard) { params.push(standard); where += ` AND me.madrasa_standard = $${params.length}`; }
      if (section) { params.push(section); where += ` AND me.madrasa_section = $${params.length}`; }
      studentsRes = await db.query(
        `SELECT s.adm_no, s.name, s.photo_url, s.admission_date, s.exit_date,
                s.status, me.madrasa_standard AS standard, me.madrasa_section AS section,
                mm.name AS madrasa_mentor_name
         FROM student_madrasa_enrollments me
         JOIN students s ON s.adm_no = me.student_id
         LEFT JOIN staff mm ON s.madrasa_mentor_id = mm.id
         WHERE ${where}
         ORDER BY me.madrasa_standard, me.madrasa_section, s.name ASC`,
        params
      );
    }

    // For each student, compute a quick attendance summary for the year
    const summaries = await Promise.all(
      studentsRes.rows.map(async (student: any) => {
        const exitDate = student.exit_date ? toDateKey(student.exit_date) : studentExitDate(student);
        const admDate = student.admission_date ? toDateKey(student.admission_date) : null;
        const effStart = clampDate(requestedStart, admDate, null);
        const effEnd = clampDate(requestedEnd, null, exitDate);
        if (effStart > effEnd) {
          return { ...student, attendance_pct: null, present: null, effective_classes: null, hifz_sessions: null };
        }

        // Quick attendance: just count student marks
        const marksRes = await db.query(
          `SELECT sam.status, sch.class_type
           FROM student_attendance_marks sam
           JOIN attendance_schedules sch ON sch.id = sam.schedule_id
           WHERE sam.student_id = $1 AND sam.date >= $2 AND sam.date <= $3`,
          [student.adm_no, effStart, effEnd]
        );

        const hifzLogs = type === 'hifz'
          ? await db.query(
              `SELECT COUNT(*)::integer AS cnt FROM hifz_logs WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
              [student.adm_no, effStart, effEnd]
            )
          : null;

        const typeFilter = type === 'madrasa' ? ['madrasa', 'madrassa'] : [type];
        const relevant = marksRes.rows.filter((m: any) => typeFilter.includes(String(m.class_type || '').toLowerCase()));
        const present = relevant.filter((m: any) => ['present', 'late'].includes(String(m.status || '').toLowerCase())).length;
        const total = relevant.length;
        const pct = total > 0 ? Math.round((present / total) * 1000) / 10 : null;

        return {
          adm_no: student.adm_no,
          name: student.name,
          photo_url: student.photo_url,
          standard: student.standard,
          section: student.section,
          mentor_name: student.hifz_mentor_name || student.school_mentor_name || student.madrasa_mentor_name || null,
          admission_date: admDate,
          effective_start: effStart,
          effective_end: effEnd,
          present,
          effective_classes: total,
          attendance_pct: pct,
          hifz_sessions: hifzLogs ? Number(hifzLogs.rows[0]?.cnt || 0) : null,
        };
      })
    );

    res.json({
      success: true,
      class_type: type,
      academic_year: {
        id: academicContext.academicYearId,
        mode: academicContext.mode,
        start_date: academicBounds.start_date,
        end_date: academicBounds.end_date,
      },
      period: { start_date: requestedStart, end_date: requestedEnd },
      standard: standard || null,
      section: section || null,
      total_students: summaries.length,
      data: summaries,
    });
  } catch (error: any) {
    console.error('[yearly_report] getClassYearlyReport error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate class yearly report' });
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/yearly-report/classes
// Returns available classes (standards) for a given academic year and type
// ──────────────────────────────────────────────────────────────────────────────

export const getAvailableClasses = async (req: Request, res: Response) => {
  try {
    const academicContext = await getAcademicYearContext(db, req.query.academic_year_id);

    const [schoolRes, madrasaRes, hifzMentorsRes] = await Promise.all([
      db.query(
        `SELECT DISTINCT school_standard AS standard, school_section AS section
         FROM student_school_enrollments
         WHERE academic_year_id = $1 AND status = 'active'
           AND school_standard IS NOT NULL
         ORDER BY school_standard, school_section`,
        [academicContext.academicYearId]
      ),
      db.query(
        `SELECT DISTINCT madrasa_standard AS standard, madrasa_section AS section
         FROM student_madrasa_enrollments
         WHERE academic_year_id = $1 AND status = 'active'
           AND madrasa_standard IS NOT NULL
         ORDER BY madrasa_standard, madrasa_section`,
        [academicContext.academicYearId]
      ),
      db.query(
        `SELECT DISTINCT st.id AS mentor_id, st.name AS mentor_name,
                COUNT(DISTINCT hp.student_id)::integer AS student_count
         FROM student_hifz_profiles hp
         JOIN staff st ON st.id = hp.mentor_id
         JOIN students s ON s.adm_no = hp.student_id
         WHERE hp.active = true AND s.status = 'active'
         GROUP BY st.id, st.name
         ORDER BY st.name ASC`
      ),
    ]);

    res.json({
      success: true,
      academic_year_id: academicContext.academicYearId,
      school: schoolRes.rows,
      madrasa: madrasaRes.rows,
      hifz_mentors: hifzMentorsRes.rows,
    });
  } catch (error: any) {
    console.error('[yearly_report] getAvailableClasses error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch class list' });
  }
};
