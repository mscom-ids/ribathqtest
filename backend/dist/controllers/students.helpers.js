"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStaff = exports.getNextStudentId = void 0;
const db_1 = require("../config/db");
const getNextStudentId = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT adm_no FROM students ORDER BY created_at DESC LIMIT 1`);
        let nextId = "R001";
        if (result.rows.length > 0 && result.rows[0].adm_no?.startsWith("R")) {
            const num = parseInt(result.rows[0].adm_no.substring(1));
            if (!isNaN(num)) {
                nextId = `R${String(num + 1).padStart(3, '0')}`;
            }
        }
        res.json({ success: true, nextId });
    }
    catch (err) {
        console.error('Error fetching next student id:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getNextStudentId = getNextStudentId;
const getStaff = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT id, name FROM staff WHERE role IN ('staff', 'usthad', 'vice_principal', 'teacher') AND is_active = true ORDER BY name`);
        res.json({ success: true, staff: result.rows });
    }
    catch (err) {
        console.error('Error fetching staff:', err);
        res.status(500).json({ success: false, error: 'Failed' });
    }
};
exports.getStaff = getStaff;
