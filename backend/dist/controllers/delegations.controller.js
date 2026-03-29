"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revokeDelegation = exports.updateDelegationStatus = exports.getAdminAllRequests = exports.getAssignedToMe = exports.getOutgoingRequests = exports.createDelegationRequest = void 0;
const db_1 = require("../config/db");
const staff_utils_1 = require("../utils/staff.utils");
// 1. Mentor requests student assignment
const createDelegationRequest = async (req, res) => {
    try {
        const { to_staff_id, reason, student_id } = req.body;
        const fromStaffId = await (0, staff_utils_1.getStaffId)(req);
        if (!fromStaffId)
            return res.status(404).json({ success: false, error: "Staff profile not found." });
        if (fromStaffId === to_staff_id)
            return res.status(400).json({ success: false, error: "Cannot assign to yourself." });
        const checkRes = await db_1.db.query(`
            SELECT id FROM mentor_delegations 
            WHERE from_staff_id = $1 AND to_staff_id = $2 
              AND status IN ('pending', 'approved')
              AND (student_id = $3 OR (student_id IS NULL AND $3 IS NULL))
        `, [fromStaffId, to_staff_id, student_id || null]);
        if (checkRes.rows.length > 0) {
            return res.status(400).json({ success: false, error: "An active or pending assignment already exists for this mentor/student." });
        }
        const result = await db_1.db.query(`
            INSERT INTO mentor_delegations (from_staff_id, to_staff_id, student_id, reason, status)
            VALUES ($1, $2, $3, $4, 'pending')
            RETURNING *
        `, [fromStaffId, to_staff_id, student_id || null, reason]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.createDelegationRequest = createDelegationRequest;
// 2. Mentor views their outgoing assignment requests
const getOutgoingRequests = async (req, res) => {
    try {
        const staffId = await (0, staff_utils_1.getStaffId)(req);
        if (!staffId)
            return res.status(404).json({ success: false, error: "Not found" });
        const result = await db_1.db.query(`
            SELECT d.*, s.name as target_mentor_name, s.photo_url as target_mentor_photo,
                   stu.name as student_name
            FROM mentor_delegations d
            JOIN staff s ON d.to_staff_id = s.id
            LEFT JOIN students stu ON d.student_id = stu.adm_no
            WHERE d.from_staff_id = $1
            ORDER BY d.created_at DESC
        `, [staffId]);
        res.json({ success: true, requests: result.rows });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.getOutgoingRequests = getOutgoingRequests;
// 3. Mentor views who has assigned students to them (approved only)
const getAssignedToMe = async (req, res) => {
    try {
        const staffId = await (0, staff_utils_1.getStaffId)(req);
        if (!staffId)
            return res.status(404).json({ success: false, error: "Not found" });
        const result = await db_1.db.query(`
            SELECT d.*, s.name as original_mentor_name, s.photo_url as original_mentor_photo,
                   stu.name as student_name,
                   CASE 
                     WHEN d.student_id IS NOT NULL THEN 1
                     ELSE (SELECT COUNT(*) FROM students 
                           WHERE (hifz_mentor_id = s.id OR school_mentor_id = s.id OR madrasa_mentor_id = s.id) 
                             AND status = 'active') 
                   END as student_count
            FROM mentor_delegations d
            JOIN staff s ON d.from_staff_id = s.id
            LEFT JOIN students stu ON d.student_id = stu.adm_no
            WHERE d.to_staff_id = $1 AND d.status = 'approved'
            ORDER BY d.created_at DESC
        `, [staffId]);
        res.json({ success: true, assignments: result.rows });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.getAssignedToMe = getAssignedToMe;
// 4. Admin views all requests (pending, approved, rejected)
const getAdminAllRequests = async (req, res) => {
    try {
        const result = await db_1.db.query(`
            SELECT d.*, 
                   f.name as from_mentor_name, f.photo_url as from_mentor_photo,
                   t.name as to_mentor_name, t.photo_url as to_mentor_photo,
                   stu.name as student_name
            FROM mentor_delegations d
            JOIN staff f ON d.from_staff_id = f.id
            JOIN staff t ON d.to_staff_id = t.id
            LEFT JOIN students stu ON d.student_id = stu.adm_no
            ORDER BY d.status = 'pending' DESC, d.status = 'approved' DESC, d.created_at DESC
        `);
        res.json({ success: true, requests: result.rows });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.getAdminAllRequests = getAdminAllRequests;
// 5. Admin updates status
const updateDelegationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'approved' or 'rejected'
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: "Invalid status" });
        }
        const timestampCol = status === 'approved' ? ', approved_at = NOW()' : '';
        const result = await db_1.db.query(`
            UPDATE mentor_delegations
            SET status = $1, updated_at = NOW() ${timestampCol}
            WHERE id = $2 RETURNING *
        `, [status, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Not found" });
        }
        // If approved, we can also reject any other pending requests from that mentor? Optional.
        // Or if approved, we let it be. A mentor can have students assigned to multiple? No, the system checks
        // usually if you are A, you assign to B.
        res.json({ success: true, data: result.rows[0] });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.updateDelegationStatus = updateDelegationStatus;
const revokeDelegation = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        const staffId = await (0, staff_utils_1.getStaffId)(req);
        // Fetch current delegation
        const delRes = await db_1.db.query('SELECT from_staff_id, status FROM mentor_delegations WHERE id = $1', [id]);
        if (delRes.rows.length === 0)
            return res.status(404).json({ success: false, error: "Not found" });
        const delegation = delRes.rows[0];
        const isAdmin = ['admin', 'principal', 'vice_principal'].includes(user?.role);
        // Log for debugging 403 issues
        console.log(`Revoke attempt by ${user.role} (staffId: ${staffId}) for delegation from ${delegation.from_staff_id}`);
        // Allow ONLY if owner OR admin
        if (!isAdmin && delegation.from_staff_id !== staffId) {
            return res.status(403).json({ success: false, error: `Forbidden. You are logged as ${user.role}.` });
        }
        // Update status to terminated instead of deleting
        await db_1.db.query(`
            UPDATE mentor_delegations 
            SET status = 'terminated', terminated_at = NOW(), updated_at = NOW()
            WHERE id = $1
        `, [id]);
        res.json({ success: true, message: "Assignment terminated successfully" });
    }
    catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
};
exports.revokeDelegation = revokeDelegation;
