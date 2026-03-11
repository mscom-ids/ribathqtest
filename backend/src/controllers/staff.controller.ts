import { Request, Response } from 'express';
import { db } from '../config/db';

export const getMyStaffProfile = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        if (!user) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // We assume user.email matches staff.email or user.id matches staff.profile_id
        const result = await db.query('SELECT * FROM staff WHERE email = $1 OR profile_id = $2 LIMIT 1', [user.email, user.id]);
        
        if (result.rows.length === 0) {
            return res.json({ success: true, staff: null });
        }
        
        res.json({ success: true, staff: result.rows[0] });
    } catch (err) {
        console.error('Error fetching staff profile:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMyAssignedStudents = async (req: Request, res: Response) => {
    try {
        const { staff_id } = req.query;
        if (!staff_id) return res.status(400).json({ success: false, error: 'staff_id required' });

        const result = await db.query(
            'SELECT adm_no, name, photo_url, standard FROM students WHERE assigned_usthad_id = $1 AND status = $2 ORDER BY name',
            [staff_id, 'active']
        );
        
        res.json({ success: true, students: result.rows });
    } catch (err) {
        console.error('Error fetching assigned students:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const cancelSession = async (req: Request, res: Response) => {
    try {
        const { date, session_id } = req.body;
        
        const existingResult = await db.query('SELECT cancelled_sessions FROM academic_calendar WHERE date = $1', [date]);
        
        if (existingResult.rows.length === 0) {
            const cancelled_sessions = { [session_id]: true };
            await db.query(
                'INSERT INTO academic_calendar (date, is_holiday, cancelled_sessions) VALUES ($1, false, $2)',
                [date, cancelled_sessions]
            );
        } else {
            const currentCancelled = existingResult.rows[0].cancelled_sessions || {};
            currentCancelled[session_id] = true;
            await db.query(
                'UPDATE academic_calendar SET cancelled_sessions = $1 WHERE date = $2',
                [currentCancelled, date]
            );
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Error cancelling session:', err);
        res.status(500).json({ success: false, error: 'Failed to cancel session' });
    }
};

export const createStaffLogin = async (req: Request, res: Response) => {
    try {
        const { id } = req.params; // Staff ID
        const { password } = req.body;
        
        const bcrypt = require('bcrypt'); // Lazy load
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            
            // 1. Get staff info
            const staffRes = await client.query('SELECT name, email, role, phone FROM staff WHERE id = $1', [id]);
            if (staffRes.rows.length === 0) throw new Error("Staff not found");
            const staff = staffRes.rows[0];

            // 2. Insert into users / profiles (assuming users table for JWT auth)
            // If users table is not ready, we will store auth data directly in profiles. 
            // In a real migration, we'd have a users table.
            let userId;
            try {
                const userInsert = await client.query(
                    'INSERT INTO users (email, password_hash, full_name, role, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [staff.email, hashedPassword, staff.name, staff.role, staff.phone]
                );
                userId = userInsert.rows[0].id;
            } catch (err: any) {
                // Ignore if users table doesn't exist yet, we will fallback to updating 'profiles' if needed.
                // But let's assume 'users' exists because auth.controller.ts uses it!
                if (err.code === '42P01') { 
                    // users table does not exist, use profiles
                    const profileInsert = await client.query(
                        'INSERT INTO profiles (id, full_name, role, password_hash) VALUES (uuid_generate_v4(), $1, $2, $3) RETURNING id',
                        [staff.name, staff.role, hashedPassword]
                    );
                    userId = profileInsert.rows[0].id;
                } else {
                    throw err;
                }
            }

            // 3. Link staff to user
            await client.query('UPDATE staff SET profile_id = $1 WHERE id = $2', [userId, id]);

            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error('Create Login Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const archiveStaff = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            // Unassign students
            await client.query('UPDATE students SET assigned_usthad_id = NULL WHERE assigned_usthad_id = $1', [id]);
            // Archive staff
            await client.query('UPDATE staff SET is_active = false, profile_id = NULL WHERE id = $1', [id]);
            // We should ideally delete the user from `users` but we can leave it or set status=inactive.
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const restoreStaff = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.query('UPDATE staff SET is_active = true WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getAllStaff = async (req: Request, res: Response) => {
    try {
        const result = await db.query('SELECT * FROM staff ORDER BY name ASC');
        res.json({ success: true, staff: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch staff' });
    }
};

export const updateStaffProfile = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, role, phone } = req.body;
        const result = await db.query(
            'UPDATE staff SET name = $1, role = $2, phone = $3 WHERE id = $4 RETURNING *',
            [name, role, phone, id]
        );
        res.json({ success: true, staff: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update' });
    }
};

export const createStaff = async (req: Request, res: Response) => {
    const client = await db.getClient();
    try {
        const { name, email, role, phone, password } = req.body;
        await client.query('BEGIN');
        
        // 1. Create Staff record
        const staffInsert = await client.query(
            'INSERT INTO staff (name, email, role, phone) VALUES ($1, $2, $3, $4) RETURNING id',
            [name, email, role, phone]
        );
        const staffId = staffInsert.rows[0].id;
        
        // 2. Create Login logic (similar to createStaffLogin)
        if (password) {
            const bcrypt = require('bcrypt');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            let userId;
            try {
                const userInsert = await client.query(
                    'INSERT INTO users (email, password_hash, full_name, role, phone_number) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                    [email, hashedPassword, name, role, phone]
                );
                userId = userInsert.rows[0].id;
            } catch (err: any) {
                if (err.code === '42P01') {
                    const profileInsert = await client.query(
                        'INSERT INTO profiles (id, full_name, role, password_hash) VALUES (uuid_generate_v4(), $1, $2, $3) RETURNING id',
                        [name, role, hashedPassword]
                    );
                    userId = profileInsert.rows[0].id;
                } else {
                    throw err;
                }
            }
            
            // 3. Link profile id back to staff
            await client.query('UPDATE staff SET profile_id = $1 WHERE id = $2', [userId, staffId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, staffId });
    } catch (err: any) {
        await client.query('ROLLBACK');
        console.error("Failed to create staff:", err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        client.release();
    }
};

export const getMyStudentsWithStats = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        // Get my staff record
        const staffResult = await db.query(
            'SELECT id FROM staff WHERE email = $1 OR profile_id = $2 LIMIT 1',
            [user.email, user.id]
        );
        if (staffResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        const staffId = staffResult.rows[0].id;

        // Fetch assigned students
        const studentsResult = await db.query(
            `SELECT adm_no, name, photo_url, batch_year, standard, dob,
             (SELECT name FROM staff WHERE id = assigned_usthad_id) as usthad_name
             FROM students WHERE assigned_usthad_id = $1 AND status = 'active' ORDER BY name`,
            [staffId]
        );
        const students = studentsResult.rows;

        if (students.length === 0) {
            return res.json({ success: true, students: [] });
        }

        const { date } = req.query;
        const todayDate = date || new Date().toISOString().split('T')[0];
        const studentIds = students.map((s: any) => s.adm_no);

        // Fetch today's hifz logs
        const logsResult = await db.query(
            `SELECT student_id, mode, start_page, end_page, juz_portion, entry_date
             FROM hifz_logs WHERE student_id = ANY($1) AND entry_date = $2`,
            [studentIds, todayDate]
        );
        const logs = logsResult.rows;

        // Fetch today's attendance
        const attResult = await db.query(
            `SELECT student_id, status FROM attendance WHERE student_id = ANY($1) AND date = $2`,
            [studentIds, todayDate]
        );
        const attendance = attResult.rows;

        // Enrich students with today's stats
        const enriched = students.map((student: any) => {
            const sLogs = logs.filter((l: any) => l.student_id === student.adm_no);
            const sAtt = attendance.find((a: any) => a.student_id === student.adm_no);

            let hifzPages = 0, revPages = 0, juzCount = 0;
            sLogs.forEach((log: any) => {
                if (log.mode === 'New Verses') hifzPages += 0.5;
                else if (log.mode === 'Recent Revision') {
                    if (log.start_page && log.end_page) revPages += (log.end_page - log.start_page + 1);
                } else if (log.mode === 'Juz Revision') {
                    if (log.juz_portion === 'Full') juzCount += 1;
                    else if (log.juz_portion === '1st Half' || log.juz_portion === '2nd Half') juzCount += 0.5;
                    else if (log.juz_portion?.startsWith('Q')) juzCount += 0.25;
                    else juzCount += 1;
                }
            });

            return {
                ...student,
                assigned_usthad: student.usthad_name ? { name: student.usthad_name } : null,
                today_stats: sLogs.length > 0 || sAtt ? {
                    hifz: parseFloat(hifzPages.toFixed(1)),
                    revision: revPages,
                    juz: parseFloat(juzCount.toFixed(1)),
                    attendance: sAtt?.status || 'Pending'
                } : undefined
            };
        });

        res.json({ success: true, students: enriched });
    } catch (err) {
        console.error('Error fetching my students with stats:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};

export const getMyLeaves = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const staffResult = await db.query(
            'SELECT id FROM staff WHERE email = $1 OR profile_id = $2 LIMIT 1',
            [user.email, user.id]
        );
        if (staffResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Staff profile not found' });
        }
        const staffId = staffResult.rows[0].id;

        const result = await db.query(
            `SELECT sl.*, s.name as student_name, s.standard, s.adm_no
             FROM student_leaves sl
             JOIN students s ON sl.student_id = s.adm_no
             WHERE s.assigned_usthad_id = $1
             ORDER BY sl.created_at DESC`,
            [staffId]
        );

        const leaves = result.rows.map((row: any) => ({
            ...row,
            student: { name: row.student_name, standard: row.standard, adm_no: row.adm_no }
        }));

        res.json({ success: true, leaves });
    } catch (err) {
        console.error('Error fetching my leaves:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
