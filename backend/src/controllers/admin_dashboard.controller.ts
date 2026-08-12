import { Request, Response } from 'express';
import { db } from '../config/db';
import { cachedResult } from '../utils/server-cache';
import { countCompletedJuz } from '../utils/quran-juz';

export const getAdminSummary = async (req: Request, res: Response) => {
  try {
    const summary = await cachedResult('admin_dashboard:summary', 60_000, async () => {
      const staffPromise = db.query(`SELECT 
          COUNT(*) FILTER (WHERE is_active = true OR is_active IS NULL) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive,
          COUNT(*) as total
        FROM staff`);
      
      const eventsPromise = db.query(`SELECT * FROM events WHERE start_date >= CURRENT_DATE - INTERVAL '30 days' ORDER BY start_date ASC LIMIT 50`);

      const delegationsPromise = db.query(`SELECT COUNT(*)::integer as count FROM mentor_delegations WHERE status = 'pending'`);

      const hifzProgressPromise = db.query(
        `SELECT s.adm_no AS student_id, h.surah_name, h.start_v, h.end_v
         FROM students s
         LEFT JOIN hifz_logs h
           ON h.student_id = s.adm_no
          AND h.mode = 'New Verses'
          AND h.deleted_at IS NULL
         WHERE (s.status = 'active' OR s.status IS NULL)
           AND (
             s.hifz_mentor_id IS NOT NULL
             OR NULLIF(TRIM(COALESCE(s.hifz_standard, '')), '') IS NOT NULL
           )`
      );

      const studentsPromise = db.query(
          `SELECT
              COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL) AS active,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status IN ('dropout', 'stopped', 'higher_education')) AS dropout,
              COUNT(*) AS total
            FROM students`
      );

      const hasPresenceResult = await db.query(`SELECT to_regclass('public.student_current_presence') AS table_name`);
      const hasPresenceTable = Boolean(hasPresenceResult.rows[0]?.table_name);
      
      const presencePromise = hasPresenceTable 
        ? db.query(`SELECT COUNT(*) FILTER (WHERE scp.status = 'outside') AS out_campus FROM student_current_presence scp JOIN students s ON scp.student_id = s.adm_no WHERE s.status = 'active'`)
        : db.query(`SELECT COUNT(DISTINCT student_id) AS out_campus FROM student_leaves sl JOIN students s ON sl.student_id = s.adm_no WHERE sl.status = 'outside' AND s.status = 'active'`);

      const [staffRes, eventsRes, delRes, studentsRes, presenceRes, hifzProgressRes] = await Promise.all([
        staffPromise, eventsPromise, delegationsPromise, studentsPromise, presencePromise, hifzProgressPromise
      ]);

      const hifzStudentIds = new Set<string>();
      const hifzLogsByStudent = new Map<string, Array<{ surah_name: string | null; start_v: number | null; end_v: number | null }>>();
      for (const row of hifzProgressRes.rows) {
        const studentId = String(row.student_id);
        hifzStudentIds.add(studentId);
        if (!row.surah_name || row.start_v == null || row.end_v == null) continue;
        const logs = hifzLogsByStudent.get(studentId) || [];
        logs.push(row);
        hifzLogsByStudent.set(studentId, logs);
      }
      const hifzMilestones = [0, 5, 10, 15, 20, 25, 30].map(milestone => ({ milestone, count: 0 }));
      for (const studentId of hifzStudentIds) {
        const completedJuz = countCompletedJuz(hifzLogsByStudent.get(studentId) || []);
        const milestoneIndex = completedJuz >= 30 ? 6 : Math.floor(completedJuz / 5);
        hifzMilestones[milestoneIndex].count += 1;
      }

      const c = studentsRes.rows[0];
      const active = parseInt(c.active, 10) || 0;
      const completed = parseInt(c.completed, 10) || 0;
      const dropout = parseInt(c.dropout, 10) || 0;
      const out_campus = parseInt(presenceRes.rows[0].out_campus, 10) || 0;

      return {
        students: {
          active,
          on_campus: Math.max(0, active - out_campus),
          out_campus,
          alumni: completed + dropout,
          completed,
          dropout,
          total: parseInt(c.total, 10) || 0
        },
        staff: {
          total: parseInt(staffRes.rows[0].total, 10) || 0,
          active: parseInt(staffRes.rows[0].active, 10) || 0,
          inactive: parseInt(staffRes.rows[0].inactive, 10) || 0,
        },
        events: eventsRes.rows,
        pending_delegations: delRes.rows[0].count,
        hifz_milestones: hifzMilestones,
      };
    });

    res.json({ success: true, summary });
  } catch (err) {
    console.error('Error fetching admin summary:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch admin summary' });
  }
};
