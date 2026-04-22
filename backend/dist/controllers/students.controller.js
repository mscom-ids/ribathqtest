"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadStudentsExcel = exports.exportStudents = exports.updateStudent = exports.createStudent = exports.getStudentById = exports.getStudentCounts = exports.getAllStudents = void 0;
const XLSX = __importStar(require("xlsx"));
const db_1 = require("../config/db");
const logger_1 = require("../utils/logger");
// Columns required for the listing/grid views and the dashboard. Excludes the
// heavy `comprehensive_details` JSON blob and `address` text — callers that
// actually need those should fetch the single student via /students/:id.
const LIGHT_STUDENT_COLS = 'adm_no, name, dob, standard, batch_year, phone, email, father_name, photo_url, status, gender, admission_date, place, hifz_mentor_id, school_mentor_id, madrasa_mentor_id, phone_number';
const FULL_STUDENT_COLS = LIGHT_STUDENT_COLS + ', address, nationality, pincode, post, district, state, local_body, aadhar, id_mark, comprehensive_details';
const getAllStudents = async (req, res) => {
    try {
        const { search, class: className, status, light } = req.query;
        // ?light=true skips the heavy comprehensive_details JSON column —
        // the listing pages don't need it and dropping it cuts payload size
        // and serialization time significantly when there are many students.
        const cols = light === 'true' ? LIGHT_STUDENT_COLS : FULL_STUDENT_COLS;
        let query = `SELECT ${cols} FROM students WHERE 1=1`;
        const params = [];
        let paramCount = 1;
        if (search) {
            query += ` AND (name ILIKE $${paramCount} OR adm_no ILIKE $${paramCount})`;
            params.push(`%${search}%`);
            paramCount++;
        }
        if (className && className !== 'all') {
            query += ` AND standard = $${paramCount}`;
            params.push(className);
            paramCount++;
        }
        if (status) {
            if (status === 'alumni') {
                query += ` AND status IN ('completed', 'dropout', 'stopped', 'higher_education')`;
            }
            else if (status !== 'all') {
                query += ` AND status = $${paramCount}`;
                params.push(status);
                paramCount++;
            }
        }
        else {
            query += ` AND status = 'active'`;
        }
        query += ' ORDER BY name ASC';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};
exports.getAllStudents = getAllStudents;
// Lightweight counts for the admin dashboard. Single aggregation query
// instead of fetching every row and counting in JS.
const getStudentCounts = async (_req, _res) => {
    try {
        const [statusRes, outsideRes] = await Promise.all([
            db_1.db.query(`SELECT
            COUNT(*) FILTER (WHERE status = 'active' OR status IS NULL) AS active,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed,
            COUNT(*) FILTER (WHERE status IN ('dropout', 'stopped', 'higher_education')) AS dropout,
            COUNT(*) AS total
          FROM students`),
            db_1.db.query(`SELECT COUNT(DISTINCT student_id) AS out_campus
         FROM student_leaves
         WHERE status = 'outside'`),
        ]);
        const r = statusRes.rows[0];
        const active = parseInt(r.active, 10) || 0;
        const completed = parseInt(r.completed, 10) || 0;
        const dropout = parseInt(r.dropout, 10) || 0;
        const total = parseInt(r.total, 10) || 0;
        const outCampus = parseInt(outsideRes.rows[0].out_campus, 10) || 0;
        const onCampus = Math.max(0, active - outCampus);
        _res.json({
            success: true,
            counts: {
                total,
                active,
                completed,
                dropout,
                on_campus: onCampus,
                out_campus: outCampus,
                alumni: completed + dropout,
            },
        });
    }
    catch (err) {
        console.error('Error fetching student counts:', err);
        _res.status(500).json({ success: false, error: 'Failed to fetch student counts' });
    }
};
exports.getStudentCounts = getStudentCounts;
const getStudentById = async (req, res) => {
    try {
        const { id } = req.params;
        const { light } = req.query;
        // ?light=true skips the heavy comprehensive_details JSON for callers like
        // the daily-entry form that only need name + a couple of flags.
        const cols = light === 'true' ? LIGHT_STUDENT_COLS : '*';
        // Both queries are independent — fire in parallel (was sequential).
        const [result, leaveRes] = await Promise.all([
            db_1.db.query(`SELECT ${cols} FROM students WHERE adm_no = $1`, [id]),
            db_1.db.query(`SELECT id FROM student_leaves WHERE student_id = $1 AND status = 'outside' LIMIT 1`, [id]),
        ]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        const is_outside = leaveRes.rows.length > 0;
        res.json({ success: true, student: { ...result.rows[0], is_outside } });
    }
    catch (err) {
        console.error('Error fetching student:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch student' });
    }
};
exports.getStudentById = getStudentById;
const createStudent = async (req, res) => {
    try {
        const data = req.body;
        // Map the incoming frontend fields to the actual database columns.
        // Ensure we handle both legacy/frontend keys AND verbatim backend keys just in case.
        const mappedStudent = {
            adm_no: data.admission_number || data.adm_no,
            name: data.full_name || data.name,
            dob: data.date_of_birth || data.dob,
            address: data.address_line || data.address,
            father_name: data.parent_name || data.father_name,
            phone: data.parent_phone || data.phone,
            email: data.email,
            batch_year: data.batch_year,
            standard: data.class || data.standard,
            hifz_mentor_id: data.hifz_mentor_id === "unassigned" ? null : data.hifz_mentor_id,
            school_mentor_id: data.school_mentor_id === "unassigned" ? null : data.school_mentor_id,
            madrasa_mentor_id: data.madrasa_mentor_id === "unassigned" ? null : data.madrasa_mentor_id,
            photo_url: data.photo_url,
            status: data.status || 'active',
            comprehensive_details: data.comprehensive_details || {},
            gender: data.gender,
            admission_date: data.admission_date || data.date_of_join,
            nationality: data.nationality || 'Indian',
            pincode: data.pincode,
            post: data.post,
            district: data.district,
            state: data.state,
            place: data.place,
            local_body: data.local_body,
            aadhar: data.aadhar,
            id_mark: data.id_mark,
            country: data.country,
        };
        // We explicitly list the columns to avoid SQL injection
        const validColumns = [
            'adm_no', 'name', 'dob', 'address', 'father_name', 'phone',
            'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
            'photo_url', 'status', 'comprehensive_details',
            'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
            'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
        ];
        const values = [];
        const placeholders = [];
        const insertCols = [];
        let paramCount = 1;
        for (const col of validColumns) {
            // Use standard Object mapping, allowing nulls but excluding undefined mapping
            if (mappedStudent[col] !== undefined) {
                insertCols.push(col);
                values.push(mappedStudent[col]);
                placeholders.push(`$${paramCount}`);
                paramCount++;
            }
        }
        const query = `
      INSERT INTO students (${insertCols.join(', ')}) 
      VALUES (${placeholders.join(', ')}) 
      RETURNING *
    `;
        const result = await db_1.db.query(query, values);
        res.status(201).json({ success: true, student: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating student:', err);
        res.status(500).json({ success: false, error: 'Failed to create student' });
    }
};
exports.createStudent = createStudent;
const updateStudent = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Student ID is required' });
        }
        const updateData = req.body;
        (0, logger_1.devLog)('[updateStudent] id:', id, 'keys:', Object.keys(updateData));
        // Safety check - don't allow updating ID
        delete updateData.id;
        // Map legacy/frontend fields to db fields if they exist
        if ('assigned_usthad_id' in updateData) {
            updateData.hifz_mentor_id = updateData.assigned_usthad_id;
            delete updateData.assigned_usthad_id;
        }
        const validColumns = [
            'name', 'dob', 'address', 'father_name', 'phone',
            'email', 'batch_year', 'standard', 'hifz_mentor_id', 'school_mentor_id', 'madrasa_mentor_id',
            'photo_url', 'status', 'comprehensive_details',
            'gender', 'admission_date', 'nationality', 'pincode', 'post', 'district', 'state',
            'place', 'local_body', 'aadhar', 'id_mark', 'country', 'phone_number'
        ];
        const keysToUpdate = Object.keys(updateData).filter(key => validColumns.includes(key));
        if (keysToUpdate.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid data provided for update' });
        }
        const setClauses = [];
        const values = [];
        let paramCount = 1;
        for (const key of keysToUpdate) {
            if (key === 'comprehensive_details') {
                // Deep merge the new JSON inside Postgres so we don't accidentally overwrite other saved tabs
                setClauses.push(`${key} = COALESCE(students.${key}, '{}'::jsonb) || $${paramCount}::jsonb`);
            }
            else {
                setClauses.push(`${key} = $${paramCount}`);
            }
            values.push(updateData[key]);
            paramCount++;
        }
        // Add exactly one more parameter for the ID
        values.push(id);
        const query = `
      UPDATE students 
      SET ${setClauses.join(', ')} 
      WHERE adm_no = $${paramCount} 
      RETURNING *
    `;
        const result = await db_1.db.query(query, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
        res.json({ success: true, student: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating student:', err);
        // Surface the PostgreSQL error detail so it's easier to diagnose (e.g. missing column)
        const detail = err.detail || err.hint || '';
        res.status(500).json({ success: false, error: `${err.message || 'Failed to update student'}${detail ? ` — ${detail}` : ''}` });
    }
};
exports.updateStudent = updateStudent;
// ── Export students as JSON ────────────────────────────────────
const exportStudents = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT adm_no, name, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`);
        const data = result.rows.map((s) => ({
            rollNo: s.adm_no,
            name: s.name,
            phoneNumber: s.phone_number || ''
        }));
        res.json({ success: true, students: data });
    }
    catch (err) {
        console.error('Error exporting students:', err);
        res.status(500).json({ success: false, error: 'Failed to export students' });
    }
};
exports.exportStudents = exportStudents;
// ── Download students as Excel (.xlsx) ────────────────────────
const downloadStudentsExcel = async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT adm_no, name, phone_number FROM students WHERE status = 'active' ORDER BY name ASC`);
        const rows = result.rows.map((s, i) => ({
            'S.No': i + 1,
            'Roll No': s.adm_no,
            'Student Name': s.name,
            'Phone Number': s.phone_number || ''
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        // Column widths
        ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    }
    catch (err) {
        console.error('Error generating Excel:', err);
        res.status(500).json({ success: false, error: 'Failed to generate Excel file' });
    }
};
exports.downloadStudentsExcel = downloadStudentsExcel;
