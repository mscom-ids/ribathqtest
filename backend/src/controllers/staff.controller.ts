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

            // Update the staff record with the new password
            await client.query('UPDATE staff SET password_hash = $1 WHERE id = $2', [hashedPassword, id]);

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
        const updateData = req.body;
        delete updateData.id; // Safety

        const allowedFields = ['name', 'role', 'phone', 'email', 'photo_url', 'address', 'place', 'phone_contacts', 'staff_id'];
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        for (const key of Object.keys(updateData)) {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${paramCount}`);
                
                let val = updateData[key];
                // pg driver needs JSON arrays to be stringified for JSONB columns
                if (key === 'phone_contacts' && Array.isArray(val)) {
                    val = JSON.stringify(val);
                }
                
                values.push(val);
                paramCount++;
            }
        }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        values.push(id);
        const result = await db.query(
            `UPDATE staff SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            values
        );
        res.json({ success: true, staff: result.rows[0] });
    } catch (err: any) {
        console.error('Update Staff Error:', err);
        res.status(500).json({ success: false, error: err.message || 'Failed to update' });
    }
};

export const createStaff = async (req: Request, res: Response) => {
    try {
        const { name, email, role, phone, password, photo_url, address, place, phone_contacts, join_year, join_month, staff_id } = req.body;
        
        if (!name || name.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        let hashedPassword = null;
        if (password) {
            const bcrypt = require('bcrypt');
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        const selectedRole = role || 'usthad';
        let finalStaffId = staff_id || null;

        if (selectedRole === 'usthad' || selectedRole === 'vice_principal') {
            const currentYear = new Date().getFullYear().toString();
            const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
            const yearStr = join_year || currentYear;
            const monthStr = String(join_month || currentMonth).padStart(2, '0');
            
            // Count total mentors/VPs to get sequence number
            const countRes = await db.query("SELECT COUNT(*) FROM staff WHERE role IN ('usthad', 'vice_principal')");
            const seq = String(parseInt(countRes.rows[0].count) + 1).padStart(2, '0');
            finalStaffId = `SR${seq}-${yearStr}-${monthStr}`;
        }

        const columns = ['name', 'role', 'staff_id'];
        const values: any[] = [name.trim(), selectedRole, finalStaffId];
        let paramCount = 4;

        const optionalFields: Record<string, any> = {
            email: email || `dummy-${Date.now()}@example.com`,
            phone: phone || null,
            password_hash: hashedPassword,
            photo_url: photo_url || null,
            address: address || null,
            place: place || null,
            phone_contacts: phone_contacts || [],
        };

        for (const [col, val] of Object.entries(optionalFields)) {
            if (val !== null && val !== undefined) {
                columns.push(col);
                
                let insertVal = val;
                // Stringify JSON array for pg driver
                if (col === 'phone_contacts' && Array.isArray(insertVal)) {
                    insertVal = JSON.stringify(insertVal);
                }
                
                values.push(insertVal);
                paramCount++;
            }
        }

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const staffInsert = await db.query(
            `INSERT INTO staff (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
            values
        );
        
        res.json({ success: true, staffId: staffInsert.rows[0].id, staff: staffInsert.rows[0] });
    } catch (err: any) {
        console.error("Failed to create staff:", err);
        res.status(500).json({ success: false, error: err.message });
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
