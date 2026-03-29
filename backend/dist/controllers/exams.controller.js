"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentsForExamMarks = exports.upsertExamMarks = exports.getExamMarks = exports.deleteSubject = exports.addSubject = exports.updateExamStatus = exports.getExamDetails = exports.createExam = exports.getExams = void 0;
const db_1 = require("../config/db");
// --- Global Exams ---
const getExams = async (req, res) => {
    try {
        const { department } = req.query;
        let query = 'SELECT * FROM exams';
        const params = [];
        if (department) {
            query += ' WHERE department = $1';
            params.push(department);
        }
        query += ' ORDER BY start_date DESC';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, exams: result.rows });
    }
    catch (err) {
        console.error('Error fetching exams:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch exams' });
    }
};
exports.getExams = getExams;
const createExam = async (req, res) => {
    try {
        const { title, department, type, start_date, end_date, is_active } = req.body;
        const result = await db_1.db.query(`INSERT INTO exams (title, department, type, start_date, end_date, is_active)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [title, department, type || department, start_date, end_date || null, is_active ?? true]);
        res.status(201).json({ success: true, exam: result.rows[0] });
    }
    catch (err) {
        console.error('Error creating exam:', err);
        res.status(500).json({ success: false, error: 'Failed to create exam' });
    }
};
exports.createExam = createExam;
// --- Single Exam Details ---
const getExamDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const examResult = await db_1.db.query('SELECT * FROM exams WHERE id = $1', [id]);
        if (examResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Exam not found' });
        }
        const subjectsResult = await db_1.db.query('SELECT * FROM exam_subjects WHERE exam_id = $1 ORDER BY created_at', [id]);
        res.json({
            success: true,
            exam: examResult.rows[0],
            subjects: subjectsResult.rows
        });
    }
    catch (err) {
        console.error('Error fetching exam details:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch exam details' });
    }
};
exports.getExamDetails = getExamDetails;
const updateExamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        const result = await db_1.db.query('UPDATE exams SET is_active = $1 WHERE id = $2 RETURNING *', [is_active, id]);
        res.json({ success: true, exam: result.rows[0] });
    }
    catch (err) {
        console.error('Error updating exam status:', err);
        res.status(500).json({ success: false, error: 'Failed to update exam status' });
    }
};
exports.updateExamStatus = updateExamStatus;
// --- Subjects ---
const addSubject = async (req, res) => {
    try {
        const { id } = req.params; // exam_id
        const { name, max_marks, min_marks, standard } = req.body;
        const result = await db_1.db.query(`INSERT INTO exam_subjects (exam_id, name, max_marks, min_marks, standard)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`, [id, name, max_marks, min_marks, standard || null]);
        res.status(201).json({ success: true, subject: result.rows[0] });
    }
    catch (err) {
        console.error('Error adding subject:', err);
        res.status(500).json({ success: false, error: 'Failed to add subject' });
    }
};
exports.addSubject = addSubject;
const deleteSubject = async (req, res) => {
    try {
        const { subject_id } = req.params;
        await db_1.db.query('DELETE FROM exam_subjects WHERE id = $1', [subject_id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting subject:', err);
        res.status(500).json({ success: false, error: 'Failed to delete subject' });
    }
};
exports.deleteSubject = deleteSubject;
// --- Marks / Results ---
const getExamMarks = async (req, res) => {
    try {
        const { id } = req.params; // exam_id
        const { subject_id } = req.query;
        let query = 'SELECT student_id, marks_obtained, remarks FROM exam_results WHERE exam_id = $1';
        const params = [id];
        if (subject_id) {
            query += ' AND subject_id = $2';
            params.push(subject_id);
        }
        const result = await db_1.db.query(query, params);
        res.json({ success: true, marks: result.rows });
    }
    catch (err) {
        console.error('Error fetching exam marks:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch exam marks' });
    }
};
exports.getExamMarks = getExamMarks;
const upsertExamMarks = async (req, res) => {
    try {
        const { id } = req.params; // exam_id
        const { updates } = req.body; // Array of marks
        // Use a transaction for batch upsert
        const client = await db_1.db.getClient();
        try {
            await client.query('BEGIN');
            for (const update of updates) {
                await client.query(`INSERT INTO exam_results (exam_id, subject_id, student_id, marks_obtained, remarks, grader_id)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (student_id, subject_id) 
                     DO UPDATE SET 
                        marks_obtained = EXCLUDED.marks_obtained,
                        remarks = EXCLUDED.remarks,
                        grader_id = EXCLUDED.grader_id`, [id, update.subject_id, update.student_id, update.marks_obtained, update.remarks || null, update.grader_id || null]);
            }
            await client.query('COMMIT');
            res.json({ success: true });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('Error upserting exam marks:', err);
        res.status(500).json({ success: false, error: 'Failed to save marks' });
    }
};
exports.upsertExamMarks = upsertExamMarks;
const getStudentsForExamMarks = async (req, res) => {
    try {
        const { department, standard } = req.query;
        let stdColumn = 'standard';
        if (department === 'school')
            stdColumn = 'school_standard';
        else if (department === 'hifz')
            stdColumn = 'hifz_standard';
        else if (department === 'madrassa')
            stdColumn = 'madrassa_standard';
        // This simulates the frontend query: supabase.from("students").select(`adm_no, name, ${stdColumn}`).order("name")
        let query = `SELECT adm_no, name, ${stdColumn} FROM students WHERE status = 'active'`;
        const params = [];
        let paramCount = 1;
        if (standard && standard !== 'all') {
            query += ` AND ${stdColumn} = $${paramCount}`;
            params.push(standard);
            paramCount++;
        }
        query += ' ORDER BY name';
        const result = await db_1.db.query(query, params);
        res.json({ success: true, students: result.rows });
    }
    catch (err) {
        console.error('Error fetching students for exams:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch students' });
    }
};
exports.getStudentsForExamMarks = getStudentsForExamMarks;
