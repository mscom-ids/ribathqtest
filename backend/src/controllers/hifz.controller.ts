import { Request, Response } from 'express';
import { db } from '../config/db';

export const getHifzStudents = async (req: Request, res: Response) => {
    try {
        const result = await db.query(
            `SELECT 
                s.adm_no, 
                s.name, 
                s.standard,
                s.hifz_standard, 
                (SELECT surah_name FROM hifz_logs WHERE student_id = s.adm_no AND mode = 'New Verses' ORDER BY entry_date DESC LIMIT 1) as current_surah, 
                (SELECT juz_number FROM hifz_logs WHERE student_id = s.adm_no AND mode = 'Juz Revision' ORDER BY entry_date DESC LIMIT 1) as current_juz,
                st.name as usthad_name,
                st.phone as usthad_phone
             FROM students s
             LEFT JOIN staff st ON s.assigned_usthad_id = st.id
             WHERE s.status = $1 AND s.hifz_standard IS NOT NULL 
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

        let query = 'SELECT * FROM hifz_logs WHERE 1=1';
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
        const { student_id, usthad_id, entry_date, session_type, mode, rating,
                surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db.query(
            `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode, rating,
             surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [student_id, usthad_id || null, entry_date, session_type, mode, rating || null,
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
        const { student_id, usthad_id, entry_date, session_type, mode, rating,
                surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion } = req.body;
        const result = await db.query(
            `UPDATE hifz_logs SET student_id=$1, usthad_id=$2, entry_date=$3, session_type=$4, mode=$5,
             rating=$6, surah_name=$7, start_v=$8, end_v=$9, start_page=$10, end_page=$11,
             juz_number=$12, juz_portion=$13 WHERE id=$14 RETURNING *`,
            [student_id, usthad_id || null, entry_date, session_type, mode, rating || null,
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
        const inserted = [];
        for (const log of logs) {
            const result = await db.query(
                `INSERT INTO hifz_logs (student_id, usthad_id, entry_date, session_type, mode, rating,
                 surah_name, start_v, end_v, start_page, end_page, juz_number, juz_portion)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
                [log.student_id, log.usthad_id || null, log.entry_date, log.session_type, log.mode, log.rating || null,
                 log.surah_name || null, log.start_v || null, log.end_v || null, log.start_page || null,
                 log.end_page || null, log.juz_number || null, log.juz_portion || null]
            );
            inserted.push(result.rows[0]);
        }
        res.json({ success: true, logs: inserted });
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
        const { student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, grade, attendance } = req.body;
        
        const query = `
            INSERT INTO monthly_reports (student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, grade, attendance, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (student_id, report_month) 
            DO UPDATE SET 
                hifz_pages = EXCLUDED.hifz_pages,
                recent_pages = EXCLUDED.recent_pages,
                juz_revision = EXCLUDED.juz_revision,
                total_juz = EXCLUDED.total_juz,
                grade = EXCLUDED.grade,
                attendance = EXCLUDED.attendance,
                updated_at = EXCLUDED.updated_at
            RETURNING *
        `;
        
        const params = [student_id, report_month, hifz_pages, recent_pages, juz_revision, total_juz, grade, attendance];
        const result = await db.query(query, params);
        
        res.json({ success: true, report: result.rows[0] });
    } catch (err) {
        console.error('Error upserting monthly report:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getProgressSummary = async (req: Request, res: Response) => {
    try {
        const result = await db.query(`
            SELECT student_id, COUNT(DISTINCT split_part(juz_part, ' ', 2)) as progress 
            FROM hifz_logs 
            WHERE mode = 'Juz Revision' AND juz_part LIKE 'Juz %'
            GROUP BY student_id
        `);
        
        const progressMap: Record<string, number> = {};
        result.rows.forEach(row => {
            progressMap[row.student_id] = parseInt(row.progress, 10);
        });
        
        res.json({ success: true, progressMap });
    } catch (err) {
        console.error('Error fetching progress summary:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
