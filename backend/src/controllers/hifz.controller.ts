import { Request, Response } from 'express';
import { db } from '../config/db';
import { calculateHifzReportPoints } from '../utils/hifz-calculator';
import { countCompletedJuz } from '../utils/quran-juz';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export const getHifzStudents = async (req: Request, res: Response) => {
    try {
        // Replaced 2 correlated subqueries (re-running once per student row)
        // with LATERAL JOINs. PG can use the new (student_id, mode, entry_date)
        // index to fetch the latest matching log per student in one pass.
        const result = await db.query(
            `SELECT
                s.adm_no,
                s.name,
                s.standard,
                s.hifz_standard,
                nv.surah_name AS current_surah,
                jr.juz_number AS current_juz,
                st.name      AS usthad_name,
                st.phone     AS usthad_phone
             FROM students s
             LEFT JOIN staff st ON s.hifz_mentor_id = st.id
             LEFT JOIN LATERAL (
                 SELECT surah_name FROM hifz_logs
                 WHERE student_id = s.adm_no AND mode = 'New Verses'
                 ORDER BY entry_date DESC
                 LIMIT 1
             ) nv ON TRUE
             LEFT JOIN LATERAL (
                 SELECT juz_number FROM hifz_logs
                 WHERE student_id = s.adm_no AND mode = 'Juz Revision'
                 ORDER BY entry_date DESC
                 LIMIT 1
             ) jr ON TRUE
             WHERE s.status = $1
             ORDER BY s.name`,
            ['active']
        );
        res.json({ success: true, students: result.rows });
    } catch (err: any) {
        console.error('Error fetching hifz students:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getHifzLogsList = async (req: Request, res: Response) => {
    try {
        const { date, session_type, start_date, end_date, student_id, mode, limit } = req.query;

        let query = `
            SELECT hl.*, st.name as recorded_by_name 
            FROM hifz_logs hl
            LEFT JOIN staff st ON hl.usthad_id = st.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramCount = 1;

        if (date) {
            query += ` AND entry_date = $${paramCount}`;
            params.push(date);
            paramCount++;
        } else if (start_date && end_date) {
            query += ` AND entry_date >= $${paramCount} AND entry_date <= $${paramCount + 1}`;
            params.push(start_date, end_date);
            paramCount += 2;
        }

        if (session_type && session_type !== 'all') {
            query += ` AND session_type = $${paramCount}`;
            params.push(session_type);
            paramCount++;
        }
        
        if (student_id) {
            query += ` AND student_id = $${paramCount}`;
            params.push(student_id);
            paramCount++;
        }

        if (mode) {
            query += ` AND mode = $${paramCount}`;
            params.push(mode);
            paramCount++;
        }

        query += ' ORDER BY entry_date DESC';

        if (limit) {
            query += ` LIMIT $${paramCount}`;
            params.push(parseInt(limit as string));
        }

        const result = await db.query(query, params);
        res.json({ success: true, logs: result.rows });
    } catch (err) {
        console.error('Error fetching hifz logs:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM hifz_logs WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Log not found' });
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error fetching hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMaxJuzForStudent = async (req: Request, res: Response) => {
    try {
        const { student_id } = req.params;
        const result = await db.query('SELECT juz_number FROM hifz_logs WHERE student_id = $1 ORDER BY juz_number DESC LIMIT 1', [student_id]);
        res.json({ success: true, max_juz: result.rows.length > 0 ? result.rows[0].juz_number : 0 });
    } catch (err) {
        console.error('Error fetching max juz:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const createHifzLog = async (req: Request, res: Response) => {
    try {
        const { student_id, usthad_id, entry_date, session_type, mode,
                surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db.query(
            `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode,
             surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [student_id, usthad_id || null, entry_date, session_type, mode,
             surah_name || null, start_v || null, end_v || null, start_page || null,
             end_page || null, juz_number || null, juz_portion || null]
        );
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error creating hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed to create hifz log' });
    }
};

export const updateHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { student_id, usthad_id, entry_date, session_type, mode,
                surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db.query(
            `UPDATE hifz_logs SET student_id=$1, usthad_id=$2, entry_date=$3, session_type=$4, mode=$5,
             surah_name=$6, start_v=$7, end_v=$8, start_page=$9, end_page=$10,
             juz_number=$11, juz_portion=$12 WHERE id=$13 RETURNING *`,
            [student_id, usthad_id || null, entry_date, session_type, mode,
             surah_name || null, start_v || null, end_v || null, start_page || null,
             end_page || null, juz_number || null, juz_portion || null, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, log: result.rows[0] });
    } catch (err) {
        console.error('Error updating hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed to update hifz log' });
    }
};

export const bulkCreateHifzLogs = async (req: Request, res: Response) => {
    try {
        const { logs } = req.body;
        if (!Array.isArray(logs) || logs.length === 0) {
            return res.status(400).json({ success: false, error: 'logs array is required' });
        }

        // ── Step 1: bulk-fetch existing 'New Verses' rows that could collide
        // with any candidate, in a SINGLE query. Replaces the per-row SELECT
        // dedup that ran inside the original loop.
        const dedupCandidates = logs.filter(
            (l: any) => l.mode === 'New Verses' && l.surah_name && l.start_v && l.end_v
        );

        const dupKey = (l: any) =>
            `${l.student_id}|${String(l.entry_date).slice(0, 10)}|${l.session_type}|${l.surah_name}|${l.start_v}|${l.end_v}`;

        const existingKeys = new Set<string>();
        if (dedupCandidates.length > 0) {
            const studentIds = [...new Set(dedupCandidates.map((l: any) => l.student_id))];
            const dates      = [...new Set(dedupCandidates.map((l: any) => String(l.entry_date).slice(0, 10)))];

            const existing = await db.query(
                `SELECT student_id,
                        to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                        session_type, surah_name, start_v, end_v
                 FROM hifz_logs
                 WHERE mode = 'New Verses'
                   AND student_id = ANY($1::text[])
                   AND entry_date = ANY($2::date[])`,
                [studentIds, dates]
            );
            existing.rows.forEach((r: any) => existingKeys.add(dupKey(r)));
        }

        // Filter out duplicates (only applies to qualifying New Verses rows)
        const toInsert = logs.filter((l: any) => {
            if (l.mode === 'New Verses' && l.surah_name && l.start_v && l.end_v) {
                return !existingKeys.has(dupKey(l));
            }
            return true;
        });

        if (toInsert.length === 0) {
            return res.json({ success: true, logs: [] });
        }

        // ── Step 2: ONE multi-row INSERT for the survivors.
        const placeholders: string[] = [];
        const values: any[] = [];
        let i = 1;
        for (const log of toInsert) {
            placeholders.push(
                `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`
            );
            values.push(
                log.student_id, log.usthad_id || null, log.entry_date, log.session_type, log.mode,
                log.surah_name || null, log.start_v || null, log.end_v || null,
                log.start_page || null, log.end_page || null,
                log.juz_number || null, log.juz_portion || null
            );
        }

        const result = await db.query(
            `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode,
                                    surah_name, start_v, end_v, start_page, end_page,
                                    juz_number, juz_portion)
             VALUES ${placeholders.join(',')}
             RETURNING *`,
            values
        );

        res.json({ success: true, logs: result.rows });
    } catch (err) {
        console.error('Error bulk creating hifz logs:', err);
        res.status(500).json({ success: false, error: 'Failed to bulk create hifz logs' });
    }
};

export const deleteHifzLog = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM hifz_logs WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting hifz log:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMonthlyReports = async (req: Request, res: Response) => {
    try {
        const { report_month } = req.query;
        if (!report_month) return res.status(400).json({ success: false, error: 'report_month is required' });

        const result = await db.query('SELECT * FROM monthly_reports WHERE report_month = $1', [report_month]);
        res.json({ success: true, reports: result.rows });
    } catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const upsertMonthlyReport = async (req: Request, res: Response) => {
    try {
        const { student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance } = req.body;
        
        const query = `
            INSERT INTO monthly_reports (student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (student_id, report_month) 
            DO UPDATE SET 
                hifz_pages = EXCLUDED.hifz_pages,
                recent_pages = EXCLUDED.recent_pages,
                juz_revision = EXCLUDED.juz_revision,
                total_juz = EXCLUDED.total_juz,
                attendance = EXCLUDED.attendance,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        
        const params = [student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance];
        const result = await db.query(query, params);
        
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getProgressSummary = async (req: Request, res: Response) => {
    try {
        // Optional ?student_id= scope. Without it we still scan all logs
        // (kept for the admin dashboard); WITH it we only read that one
        // student — used by the daily-entry form so it doesn't pay for
        // the institution-wide scan on every open.
        const { student_id } = req.query;

        const params: any[] = [];
        let where = `WHERE mode = 'New Verses'
                       AND surah_name IS NOT NULL
                       AND start_v IS NOT NULL
                       AND end_v IS NOT NULL`;
        if (student_id) {
            params.push(student_id);
            where += ` AND student_id = $1`;
        }

        const result = await db.query(
            `SELECT student_id, surah_name, start_v, end_v
             FROM hifz_logs
             ${where}`,
            params
        );

        // Group logs by student_id
        const byStudent: Record<string, { surah_name: string | null; start_v: number | null; end_v: number | null }[]> = {};
        for (const row of result.rows) {
            if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
            byStudent[row.student_id].push(row);
        }

        // Compute completed juz count per student using proper boundary check
        const progressMap: Record<string, number> = {};
        for (const [studentId, logs] of Object.entries(byStudent)) {
            progressMap[studentId] = countCompletedJuz(logs);
        }

        res.json({ success: true, progressMap });
    } catch (err: any) {
        console.error('Error fetching progress summary:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
export const calculateMonthlyReportData = async (req: Request, res: Response) => {
    try {
        const { student_id, month } = req.query; // Expecting month in YYYY-MM
        if (!student_id || !month) {
            return res.status(400).json({ success: false, error: 'student_id and month are required' });
        }

        const date = new Date(month as string);
        const start = startOfMonth(date).toISOString();
        const end = endOfMonth(date).toISOString();

        // 1. Fetch attendance for totalClassDays
        const attendanceResult = await db.query(
            `SELECT date, status FROM attendance 
             WHERE student_id = $1 AND date >= $2 AND date <= $3 
             AND department = 'hifz'`,
            [student_id, start, end]
        );

        // 2. Fetch hifz logs for month
        const logsResult = await db.query(
            `SELECT mode, entry_date, surah_name, start_v, end_v, start_page, end_page, juz_portion 
             FROM hifz_logs 
             WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
            [student_id, start, end]
        );

        // 3. Run calculator
        const calculations = calculateHifzReportPoints(logsResult.rows, attendanceResult.rows);

        res.json({ success: true, ...calculations });
    } catch (err: any) {
        console.error('Error calculating monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const calculateBulkMonthlyReport = async (req: Request, res: Response) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }

        const date = new Date(month as string);
        const startDate = format(startOfMonth(date), 'yyyy-MM-dd');
        const endDate = format(endOfMonth(date), 'yyyy-MM-dd');

        // 1. Get all active students that belong to Hifz (have hifz_standard or standard indicator)
        const studentsResult = await db.query(
            `SELECT s.adm_no, s.name, 
             COALESCE(s.hifz_standard, s.standard, 'Common') as standard,
             st.name as usthad_name, st.phone as usthad_phone
             FROM students s
             LEFT JOIN staff st ON s.hifz_mentor_id = st.id
             WHERE s.status = 'active'
             ORDER BY s.adm_no`
        );

        // 2. Fetch ALL hifz logs for the month
        const logsResult = await db.query(
            `SELECT student_id, mode, entry_date, surah_name, start_v, end_v, 
             start_page, end_page, juz_number, juz_portion
             FROM hifz_logs 
             WHERE entry_date >= $1::date AND entry_date <= $2::date`,
            [startDate, endDate]
        );

        // 3. Fetch ALL attendance for the month (Hifz department)
        const attendanceResult = await db.query(
            `SELECT student_id, date, status FROM attendance 
             WHERE date >= $1::date AND date <= $2::date AND department = 'Hifz'`,
            [startDate, endDate]
        );

        // 4. Check for manual reports
        const reportMonthDate = format(date, 'yyyy-MM-01');
        const manualReportsResult = await db.query(
            `SELECT * FROM monthly_reports WHERE report_month = $1::date`,
            [reportMonthDate]
        );

        // Group data by student
        const logsByStudent: Record<string, any[]> = {};
        logsResult.rows.forEach((log: any) => {
            if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
            logsByStudent[log.student_id].push(log);
        });

        const attByStudent: Record<string, any[]> = {};
        attendanceResult.rows.forEach((att: any) => {
            if (!attByStudent[att.student_id]) attByStudent[att.student_id] = [];
            attByStudent[att.student_id].push(att);
        });

        const manualByStudent: Record<string, any> = {};
        manualReportsResult.rows.forEach((r: any) => {
            manualByStudent[r.student_id] = r;
        });

        // 5. Calculate for each student
        const results = studentsResult.rows.map((student: any) => {
            const manualRecord = manualByStudent[student.adm_no];
            
            if (manualRecord) {
                return {
                    adm_no: student.adm_no,
                    name: student.name,
                    standard: student.standard,
                    usthad_name: student.usthad_name || 'Unassigned',
                    usthad_phone: student.usthad_phone || '',
                    hifz_pages: Number(manualRecord.hifz_pages),
                    recent_days: Number(manualRecord.recent_pages),
                    juz_revision: Number(manualRecord.juz_revision),
                    total_juz: Number(manualRecord.total_juz) || '-',
                    attendance: manualRecord.attendance || '-',
                    is_manual: true,
                    // Points from manual - not auto-calculated
                    newVersePoints: 0,
                    recentRevisionPoints: 0,
                    juzPoints: 0,
                    totalPoints: 0,
                    percentage: 0,
                    grade: manualRecord.grade || '-',
                    totalClassDays: 0
                };
            }

            const studentLogs = logsByStudent[student.adm_no] || [];
            const studentAtt = attByStudent[student.adm_no] || [];

            // Run the calculator
            const calc = calculateHifzReportPoints(studentLogs, studentAtt);

            // Also compute raw metrics for display
            let hifzPages = 0;
            let maxJuz = 0;
            studentLogs.forEach((log: any) => {
                if (log.mode === 'New Verses') {
                    const pages = (log.end_page && log.start_page) ? (log.end_page - log.start_page + 1) : 0;
                    hifzPages += pages > 0 ? pages : 0;
                    if (log.juz_number > maxJuz) maxJuz = log.juz_number;
                }
            });

            const recentDates = new Set<string>();
            studentLogs.filter((l: any) => l.mode === 'Recent Revision').forEach((log: any) => {
                try {
                    const d = new Date(log.entry_date);
                    if (!isNaN(d.getTime())) {
                        recentDates.add(d.toISOString().split('T')[0]);
                    }
                } catch (e) {}
            });

            let juzRevTotal = 0;
            studentLogs.filter((l: any) => l.mode === 'Juz Revision').forEach((log: any) => {
                const portion = log.juz_portion;
                if (portion === 'Full') juzRevTotal += 1;
                else if (portion?.includes('Half')) juzRevTotal += 0.5;
                else if (portion?.startsWith('Q')) juzRevTotal += 0.25;
                else juzRevTotal += 1;
            });

            const presentDays = studentAtt.filter((a: any) => a.status.toLowerCase() === 'present').length;
            const totalAttDays = studentAtt.length;

            return {
                adm_no: student.adm_no,
                name: student.name,
                standard: student.standard,
                usthad_name: student.usthad_name || 'Unassigned',
                usthad_phone: student.usthad_phone || '',
                hifz_pages: parseFloat(hifzPages.toFixed(1)),
                recent_days: recentDates.size,
                juz_revision: parseFloat(juzRevTotal.toFixed(2)),
                total_juz: maxJuz > 0 ? maxJuz : '-',
                attendance: totalAttDays > 0 ? `${presentDays}/${totalAttDays}` : '-',
                is_manual: false,
                // Calculated points
                ...calc
            };
        });

        res.json({ success: true, reports: results });
    } catch (err: any) {
        console.error('Error calculating bulk monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
