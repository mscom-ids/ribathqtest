import { Request, Response } from 'express';
import { db } from '../config/db';
import { calculateHifzReportPoints } from '../utils/hifz-calculator';
import { countCompletedJuz } from '../utils/quran-juz';
import { cachedResult, invalidateCacheByPrefix, makeCacheKey } from '../utils/server-cache';
import { calculateCoveredPagesFromLogs } from '../utils/quran-data';
import { getStudentAttendanceSummaries } from '../utils/attendance-report';

const HIFZ_SUMMARY_TTL_MS = 5 * 60_000;
const HIFZ_MONTHLY_TTL_MS = 10 * 60_000;
const HIFZ_MONTHLY_POINT_DAY_VERSION = 2;

const normalizeClassDayCount = (value: any) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const resolvePointClassDays = (
    automaticPointClassDays: number,
    effectiveAttendanceClasses: number,
    plannedAttendanceClasses: number,
    fallbackClassDays: number,
    overrideClassDays: any
) => {
    const automatic = normalizeClassDayCount(automaticPointClassDays);
    if (automatic > 0) return automatic;

    const attendanceClasses = normalizeClassDayCount(effectiveAttendanceClasses);
    if (attendanceClasses > 0) return attendanceClasses;

    // If the timetable applied to this student but every slot was cancelled,
    // the correct denominator is zero, not a global/manual fallback.
    if (normalizeClassDayCount(plannedAttendanceClasses) > 0) return 0;

    const manualFallback = overrideClassDays === null ? 0 : normalizeClassDayCount(overrideClassDays);
    if (manualFallback > 0) return manualFallback;

    return normalizeClassDayCount(fallbackClassDays);
};

const getDetectedClassDays = async (startDate: string, endDate: string) => {
    const result = await db.query(
        `SELECT COUNT(DISTINCT date) AS class_days
         FROM attendance
         WHERE date >= $1::date
           AND date <= $2::date
           AND department = 'Hifz'
           AND COALESCE(LOWER(status), '') NOT IN ('cancelled', 'leave')`,
        [startDate, endDate]
    );

    return Number(result.rows[0]?.class_days || 0);
};

const getDetectedLogDays = async (startDate: string, endDate: string) => {
    const result = await db.query(
        `SELECT COUNT(DISTINCT entry_date::date) AS log_days
         FROM hifz_logs
         WHERE entry_date >= $1::date
           AND entry_date <= $2::date`,
        [startDate, endDate]
    );

    return Number(result.rows[0]?.log_days || 0);
};

const getMonthlyClassDaysSetting = async (reportMonth: string) => {
    const result = await db.query(
        `SELECT expected_class_days
         FROM hifz_monthly_report_settings
         WHERE report_month = $1::date
         LIMIT 1`,
        [reportMonth]
    );

    return result.rows[0]?.expected_class_days ?? null;
};

function formatIndiaDate(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function getMonthlyReportPeriod(month: string) {
    const match = String(month).match(/^(\d{4})-(\d{2})$/);
    if (!match) {
        throw new Error('month must be in YYYY-MM format');
    }

    const year = Number(match[1]);
    const monthNumber = Number(match[2]);
    if (!Number.isInteger(year) || monthNumber < 1 || monthNumber > 12) {
        throw new Error('month must be in YYYY-MM format');
    }

    const monthKey = `${year}-${String(monthNumber).padStart(2, '0')}`;
    const startDate = `${monthKey}-01`;
    const fullMonthEndDate = `${monthKey}-${String(new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()).padStart(2, '0')}`;
    const reportMonth = `${monthKey}-01`;
    const todayDate = formatIndiaDate(new Date());
    const todayMonthKey = todayDate.slice(0, 7);

    let endDate = fullMonthEndDate;
    if (monthKey === todayMonthKey) {
        endDate = todayDate < fullMonthEndDate ? todayDate : fullMonthEndDate;
    } else if (monthKey > todayMonthKey) {
        endDate = formatIndiaDate(new Date(Date.UTC(year, monthNumber - 1, 0)));
    }

    return {
        startDate,
        endDate,
        fullMonthEndDate,
        reportMonth,
        isCurrentMonth: monthKey === todayMonthKey,
        isFutureMonth: monthKey > todayMonthKey,
    };
}

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
        invalidateCacheByPrefix('hifz:');
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
        invalidateCacheByPrefix('hifz:');
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

        // ── Step 1: bulk-fetch existing verse-range rows that could collide
        // with any candidate, in a SINGLE query. Replaces the per-row SELECT
        // dedup that ran inside the original loop.
        const dedupCandidates = logs.filter(
            (l: any) => ['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v
        );

        const dupKey = (l: any) =>
            `${l.student_id}|${String(l.entry_date).slice(0, 10)}|${l.session_type}|${l.mode}|${l.surah_name}|${l.start_v}|${l.end_v}`;

        const existingKeys = new Set<string>();
        if (dedupCandidates.length > 0) {
            const studentIds = [...new Set(dedupCandidates.map((l: any) => l.student_id))];
            const dates      = [...new Set(dedupCandidates.map((l: any) => String(l.entry_date).slice(0, 10)))];

            const existing = await db.query(
                `SELECT student_id,
                        to_char(entry_date, 'YYYY-MM-DD') AS entry_date,
                        session_type, mode, surah_name, start_v, end_v
                 FROM hifz_logs
                 WHERE mode = ANY($3::text[])
                   AND student_id = ANY($1::text[])
                   AND entry_date = ANY($2::date[])`,
                [studentIds, dates, ['New Verses', 'Recent Revision']]
            );
            existing.rows.forEach((r: any) => existingKeys.add(dupKey(r)));
        }

        // Filter out duplicates (only applies to qualifying verse-range rows)
        const toInsert = logs.filter((l: any) => {
            if (['New Verses', 'Recent Revision'].includes(l.mode) && l.surah_name && l.start_v && l.end_v) {
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

        invalidateCacheByPrefix('hifz:');
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
        invalidateCacheByPrefix('hifz:');
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

        const reports = await cachedResult(
            makeCacheKey('hifz:monthly-reports', { report_month }),
            HIFZ_MONTHLY_TTL_MS,
            async () => {
                const result = await db.query('SELECT * FROM monthly_reports WHERE report_month = $1', [report_month]);
                return result.rows;
            }
        );
        res.json({ success: true, reports });
    } catch (err) {
        console.error('Error fetching monthly reports:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const upsertMonthlyReport = async (req: Request, res: Response) => {
    try {
        const { student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade } = req.body;
        
        const query = `
            INSERT INTO monthly_reports (student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (student_id, report_month) 
            DO UPDATE SET 
                hifz_pages = EXCLUDED.hifz_pages,
                recent_pages = EXCLUDED.recent_pages,
                juz_revision = EXCLUDED.juz_revision,
                total_juz = EXCLUDED.total_juz,
                attendance = EXCLUDED.attendance,
                grade = EXCLUDED.grade,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        
        const params = [student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, attendance, grade || null];
        const result = await db.query(query, params);
        
        invalidateCacheByPrefix('hifz:monthly');
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMonthlyReportSettings = async (req: Request, res: Response) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, error: 'month is required (YYYY-MM)' });
        }

        const { startDate, endDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month as string);

        const [detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
            getDetectedClassDays(startDate, endDate),
            getDetectedLogDays(startDate, endDate),
            getMonthlyClassDaysSetting(reportMonth),
        ]);

        const effectiveClassDays = overrideClassDays ?? (detectedClassDays > 0 ? detectedClassDays : detectedLogDays);

        res.json({
            success: true,
            class_days: effectiveClassDays,
            detected_class_days: detectedClassDays,
            detected_log_days: detectedLogDays,
            override_class_days: overrideClassDays,
            using_fallback_log_days: overrideClassDays === null && detectedClassDays === 0 && detectedLogDays > 0,
            report_month: reportMonth,
            report_start_date: startDate,
            report_end_date: endDate,
            is_current_month: isCurrentMonth,
        });
    } catch (err: any) {
        console.error('Error fetching monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const upsertMonthlyReportSettings = async (req: Request, res: Response) => {
    try {
        const { report_month, expected_class_days } = req.body;
        if (!report_month) {
            return res.status(400).json({ success: false, error: 'report_month is required' });
        }

        const normalizedExpectedClassDays =
            expected_class_days === null || expected_class_days === undefined || expected_class_days === ''
                ? null
                : Number(expected_class_days);

        if (normalizedExpectedClassDays !== null && (!Number.isFinite(normalizedExpectedClassDays) || normalizedExpectedClassDays < 0)) {
            return res.status(400).json({ success: false, error: 'expected_class_days must be 0 or more' });
        }

        const result = await db.query(
            `INSERT INTO hifz_monthly_report_settings (report_month, expected_class_days, updated_at)
             VALUES ($1::date, $2, NOW())
             ON CONFLICT (report_month)
             DO UPDATE SET
                expected_class_days = EXCLUDED.expected_class_days,
                updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [report_month, normalizedExpectedClassDays]
        );

        invalidateCacheByPrefix('hifz:monthly');
        res.json({ success: true, settings: result.rows[0] });
    } catch (err: any) {
        console.error('Error upserting monthly report settings:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getProgressSummary = async (req: Request, res: Response) => {
    try {
        // Optional ?student_id= scope. Without it we still scan all logs
        // (kept for the admin dashboard); WITH it we only read that one
        // student — used by the daily-entry form so it doesn't pay for
        // the institution-wide scan on every open.
        const { student_id } = req.query;

        const progressMap = await cachedResult(
            makeCacheKey('hifz:progress-summary', { student_id: student_id || 'all' }),
            HIFZ_SUMMARY_TTL_MS,
            async () => {
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

                const byStudent: Record<string, { surah_name: string | null; start_v: number | null; end_v: number | null }[]> = {};
                for (const row of result.rows) {
                    if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
                    byStudent[row.student_id].push(row);
                }

                const nextProgressMap: Record<string, number> = {};
                for (const [studentId, logs] of Object.entries(byStudent)) {
                    nextProgressMap[studentId] = countCompletedJuz(logs);
                }

                return nextProgressMap;
            }
        );

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

        const { startDate, endDate, reportMonth, isCurrentMonth } = getMonthlyReportPeriod(month as string);

        const [studentResult, logsResult] = await Promise.all([
            db.query(
                `SELECT adm_no, standard AS attendance_standard, COALESCE(hifz_standard, standard, 'Common') AS standard
                 FROM students
                 WHERE adm_no = $1`,
                [student_id]
            ),
            db.query(
                `SELECT mode, entry_date, surah_name, start_v, end_v, start_page, end_page, juz_portion 
                 FROM hifz_logs 
                 WHERE student_id = $1 AND entry_date >= $2 AND entry_date <= $3`,
                [student_id, startDate, endDate]
            ),
        ]);

        if (studentResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }

        const [attendanceSummaries, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
            getStudentAttendanceSummaries(db, studentResult.rows, startDate, endDate, 'hifz'),
            getDetectedClassDays(startDate, endDate),
            getDetectedLogDays(startDate, endDate),
            getMonthlyClassDaysSetting(reportMonth),
        ]);

        const attendanceSummary = attendanceSummaries.get(student_id as string);
        const scheduledClassDays = attendanceSummary?.plannedClasses || 0;
        const cancelledClassDays = attendanceSummary?.cancelledClasses || 0;
        const countedClassDays = attendanceSummary?.effectiveClasses || 0;
        const automaticPointClassDays = attendanceSummary?.pointClassDays || 0;
        const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
        const effectiveClassDays = resolvePointClassDays(
            automaticPointClassDays,
            countedClassDays,
            scheduledClassDays,
            fallbackClassDays,
            overrideClassDays
        );

        const calculations = calculateHifzReportPoints(logsResult.rows, [], {
            expectedClassDaysOverride: effectiveClassDays,
        });

        res.json({
            success: true,
            class_days: effectiveClassDays,
            scheduled_class_days: scheduledClassDays,
            cancelled_class_days: cancelledClassDays,
            point_class_days: automaticPointClassDays,
            attended_classes: attendanceSummary?.attendedClasses || 0,
            not_attended_classes: attendanceSummary?.notAttendedClasses || 0,
            attendance_summary: attendanceSummary?.attendanceLabel || '-',
            detected_class_days: detectedClassDays,
            detected_log_days: detectedLogDays,
            override_class_days: overrideClassDays,
            using_fallback_log_days: automaticPointClassDays === 0 && countedClassDays === 0 && detectedClassDays === 0 && detectedLogDays > 0,
            report_start_date: startDate,
            report_end_date: endDate,
            is_current_month: isCurrentMonth,
            ...calculations
        });
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

        const period = getMonthlyReportPeriod(month as string);

        const results = await cachedResult(
            makeCacheKey('hifz:monthly-calculate', { month, report_end_date: period.endDate, point_day_version: HIFZ_MONTHLY_POINT_DAY_VERSION }),
            HIFZ_MONTHLY_TTL_MS,
            async () => {
                const { startDate, endDate, reportMonth, isCurrentMonth } = period;

                const [studentsResult, logsResult, manualReportsResult, detectedClassDays, detectedLogDays, overrideClassDays] = await Promise.all([
                    db.query(
                        `SELECT s.adm_no, s.name, s.standard AS attendance_standard,
                         COALESCE(s.hifz_standard, s.standard, 'Common') as standard,
                         st.name as usthad_name, st.phone as usthad_phone
                         FROM students s
                         LEFT JOIN staff st ON s.hifz_mentor_id = st.id
                         WHERE s.status = 'active'
                         ORDER BY s.adm_no`
                    ),
                    db.query(
                        `SELECT student_id, mode, entry_date, surah_name, start_v, end_v,
                         start_page, end_page, juz_number, juz_portion
                         FROM hifz_logs
                         WHERE entry_date >= $1::date AND entry_date <= $2::date`,
                        [startDate, endDate]
                    ),
                    db.query(
                        `SELECT * FROM monthly_reports WHERE report_month = $1::date`,
                        [reportMonth]
                    ),
                    getDetectedClassDays(startDate, endDate),
                    getDetectedLogDays(startDate, endDate),
                    getMonthlyClassDaysSetting(reportMonth),
                ]);

                const attendanceSummaries = await getStudentAttendanceSummaries(
                    db,
                    studentsResult.rows,
                    startDate,
                    endDate,
                    'hifz'
                );

                const logsByStudent: Record<string, any[]> = {};
                logsResult.rows.forEach((log: any) => {
                    if (!logsByStudent[log.student_id]) logsByStudent[log.student_id] = [];
                    logsByStudent[log.student_id].push(log);
                });

                const manualByStudent: Record<string, any> = {};
                manualReportsResult.rows.forEach((r: any) => {
                    manualByStudent[r.student_id] = r;
                });

                const fallbackClassDays = detectedClassDays > 0 ? detectedClassDays : detectedLogDays;
                const scheduledClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = attendanceSummaries.get(student.adm_no);
                    return Math.max(max, summary?.plannedClasses || 0);
                }, 0);
                const fallbackAllowedForStudent = (plannedClasses: number) => (
                    plannedClasses === 0 && scheduledClassDays === 0
                );
                const reportClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = attendanceSummaries.get(student.adm_no);
                    const plannedClasses = summary?.plannedClasses || 0;
                    const value = resolvePointClassDays(
                        summary?.pointClassDays || 0,
                        summary?.effectiveClasses || 0,
                        plannedClasses,
                        fallbackAllowedForStudent(plannedClasses) ? fallbackClassDays : 0,
                        fallbackAllowedForStudent(plannedClasses) ? overrideClassDays : null
                    );
                    return Math.max(max, value);
                }, 0);
                const cancelledClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = attendanceSummaries.get(student.adm_no);
                    return Math.max(max, summary?.cancelledClasses || 0);
                }, 0);
                const automaticPointClassDays = studentsResult.rows.reduce((max: number, student: any) => {
                    const summary = attendanceSummaries.get(student.adm_no);
                    return Math.max(max, summary?.pointClassDays || 0);
                }, 0);

                const reports = studentsResult.rows.map((student: any) => {
                    const manualRecord = manualByStudent[student.adm_no];
                    const attendanceSummary = attendanceSummaries.get(student.adm_no);
                    const automaticPointClassDays = attendanceSummary?.pointClassDays || 0;
                    const plannedClasses = attendanceSummary?.plannedClasses || 0;
                    const allowFallback = fallbackAllowedForStudent(plannedClasses);
                    const effectiveClassDays = resolvePointClassDays(
                        automaticPointClassDays,
                        attendanceSummary?.effectiveClasses || 0,
                        plannedClasses,
                        allowFallback ? fallbackClassDays : 0,
                        allowFallback ? overrideClassDays : null
                    );

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
                            newVersePoints: 0,
                            recentRevisionPoints: 0,
                            juzPoints: 0,
                            totalPoints: 0,
                            percentage: 0,
                            grade: manualRecord.grade || '-',
                            totalClassDays: effectiveClassDays,
                            detectedClassDays,
                            scheduledClassDays: attendanceSummary?.plannedClasses || scheduledClassDays,
                            pointClassDays: automaticPointClassDays,
                            cancelledClasses: attendanceSummary?.cancelledClasses || 0,
                            attendedClasses: attendanceSummary?.attendedClasses || 0,
                            notAttendedClasses: attendanceSummary?.notAttendedClasses || 0,
                        };
                    }

                    const studentLogs = logsByStudent[student.adm_no] || [];

                    const calc = calculateHifzReportPoints(studentLogs, [], {
                        expectedClassDaysOverride: effectiveClassDays,
                    });

                    const hifzPages = calculateCoveredPagesFromLogs(
                        studentLogs.filter((log: any) => log.mode === 'New Verses')
                    );
                    let maxJuz = 0;
                    studentLogs.forEach((log: any) => {
                        if (log.mode === 'New Verses') {
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
                    studentLogs.filter((l: any) => l.mode?.startsWith('Juz Revision')).forEach((log: any) => {
                        const portion = log.juz_portion;
                        if (portion === 'Full') juzRevTotal += 1;
                        else if (portion?.includes('Half')) juzRevTotal += 0.5;
                        else if (portion?.startsWith('Q')) juzRevTotal += 0.25;
                        else juzRevTotal += 1;
                    });

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
                        attendance: attendanceSummary?.attendanceLabel || '-',
                        scheduledClassDays: attendanceSummary?.plannedClasses || 0,
                        pointClassDays: automaticPointClassDays,
                        cancelledClasses: attendanceSummary?.cancelledClasses || 0,
                        attendedClasses: attendanceSummary?.attendedClasses || 0,
                        notAttendedClasses: attendanceSummary?.notAttendedClasses || 0,
                        is_manual: false,
                        ...calc
                    };
                });

                return {
                    reports,
                    class_days: reportClassDays,
                    scheduled_class_days: scheduledClassDays,
                    cancelled_class_days: cancelledClassDays,
                    automatic_point_class_days: automaticPointClassDays,
                    detected_class_days: detectedClassDays,
                    detected_log_days: detectedLogDays,
                    override_class_days: overrideClassDays,
                    using_fallback_log_days: automaticPointClassDays === 0 && scheduledClassDays === 0 && detectedClassDays === 0 && detectedLogDays > 0,
                    report_start_date: startDate,
                    report_end_date: endDate,
                    is_current_month: isCurrentMonth,
                };
            }
        );

        res.json({ success: true, ...results });
    } catch (err: any) {
        console.error('Error calculating bulk monthly report:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
