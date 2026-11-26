import * as XLSX from 'xlsx';
import type { PoolClient } from 'pg';

export class PortalError extends Error {
    constructor(message: string, public status = 400, public details?: unknown) { super(message); }
}
type SetupCenter = { id: string; code: string; examiner_name: string; has_passcode: boolean };
type SetupStudent = { center_id: string; standard: string };
type SetupSubject = { standard: string | null; question_count: number | null; question_max: number | null; max_marks: number | string };
export type PortalSetupIssue = {
    type: 'students' | 'examiner_name' | 'passcode' | 'subjects';
    message: string;
    center_id?: string;
    center_code?: string;
    standard?: string;
};
export type PortalReadiness = { ready: boolean; student_count: number; issues: PortalSetupIssue[] };

/** Informational setup status. Portal access can be opened independently. */
export function getPortalReadiness(centers: SetupCenter[], students: SetupStudent[], subjects: SetupSubject[]): PortalReadiness {
    const issues: PortalSetupIssue[] = [];
    if (!students.length) issues.push({ type: 'students', message: 'Import the student allocation.' });
    const occupied = new Set(students.map(student => student.center_id));
    for (const center of [...centers].sort((a, b) => a.code.localeCompare(b.code))) {
        if (!occupied.has(center.id)) continue;
        if (!center.examiner_name.trim()) issues.push({ type: 'examiner_name', center_id: center.id, center_code: center.code, message: `Center ${center.code}: save an examiner name.` });
        if (!center.has_passcode) issues.push({ type: 'passcode', center_id: center.id, center_code: center.code, message: `Center ${center.code}: generate a passcode.` });
    }
    const configuredStandards = new Set(subjects.filter(subject =>
        Number.isInteger(subject.question_count) && Number(subject.question_count) >= 1 && Number(subject.question_count) <= 50 &&
        Number.isInteger(subject.question_max) && Number(subject.question_max) >= 1 && Number(subject.question_max) <= 100 &&
        Number(subject.max_marks) === Number(subject.question_count) * Number(subject.question_max)
    ).map(subject => subject.standard));
    for (const standard of [...new Set(students.map(student => student.standard))].sort()) {
        if (!configuredStandards.has(standard)) issues.push({ type: 'subjects', standard, message: `${standard}: configure a subject with questions and marks.` });
    }
    return { ready: issues.length === 0, student_count: students.length, issues };
}

export type Allocation = { code: string; serial_no: number; admission_no: string; name: string; standard: string };
export const portalSlug = (title: string, suffix: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 62) || 'exam'}-${suffix.slice(0, 8)}`;

export function validateAllocation(rows: Allocation[]) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 3000) throw new PortalError('Provide 1–3000 allocated students.');
    const ids = new Set<string>(); const serials = new Set<string>();
    for (const row of rows) {
        if (!/^[A-Z0-9-]{1,12}$/.test(row.code) || !/^R\d+$/i.test(row.admission_no) || !row.name || !row.standard || !Number.isInteger(row.serial_no) || row.serial_no < 1) throw new PortalError('Every row needs a center, serial number, admission number, name and standard.');
        if (ids.has(row.admission_no.toUpperCase())) throw new PortalError(`Duplicate admission number: ${row.admission_no}`);
        if (serials.has(`${row.code}:${row.serial_no}`)) throw new PortalError(`Duplicate serial number in center ${row.code}`);
        ids.add(row.admission_no.toUpperCase()); serials.add(`${row.code}:${row.serial_no}`);
    }
    for (const code of new Set(rows.map(r => r.code))) {
        const serial = rows.filter(r => r.code === code).map(r => r.serial_no).sort((a, b) => a - b);
        if (serial.some((n, i) => n !== i + 1)) throw new PortalError(`Serial numbers in center ${code} must restart at 1 without gaps.`);
    }
    return rows;
}

export function parseAllocationWorkbook(buffer: Buffer): Allocation[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows: Allocation[] = [];
    for (const sheetName of workbook.SheetNames) {
        const match = /^Exam Center ([A-Z0-9-]{1,12})$/i.exec(sheetName.trim());
        if (!match) continue;
        const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
        for (const value of values) {
            const admission_no = String(value[1] || '').trim().toUpperCase();
            if (!/^R\d+$/.test(admission_no)) {
                if (typeof value[0] === 'number' && value[0] > 0) throw new PortalError(`Missing or invalid admission number at serial ${value[0]} in ${sheetName}.`);
                continue;
            }
            rows.push({ code: match[1].toUpperCase(), serial_no: Number(value[0]), admission_no, name: String(value[2] || '').trim(), standard: String(value[3] || '').trim() });
        }
    }
    return validateAllocation(rows);
}

export function validateMarks(marks: unknown, count: number, max: number, submit: boolean) {
    if (!Array.isArray(marks) || marks.length !== count) throw new PortalError(`Enter exactly ${count} question marks.`);
    const values = marks.map(value => {
        if (value === null || value === '') return null;
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new PortalError(`Each mark must be a whole number from 0 to ${max}.`);
        return value;
    });
    if (submit && values.some(v => v === null)) throw new PortalError('Enter every question mark before final submission.');
    return { marks: values, total: values.every(v => v === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0) };
}

export async function verifyAllocationStudents(client: Pick<PoolClient, 'query'>, rows: Allocation[]) {
    validateAllocation(rows);
    const result = await client.query('SELECT adm_no,name,status FROM students WHERE adm_no=ANY($1::text[])', [rows.map(r => r.admission_no)]);
    const missing = rows.filter(r => !result.rows.some(s => s.adm_no === r.admission_no));
    if (missing.length) throw new PortalError(`Admission numbers not found: ${missing.map(r => r.admission_no).join(', ')}`);
    return { total: rows.length, unique: result.rows.length, centers: [...new Set(rows.map(r => r.code))].map(code => ({ code, count: rows.filter(r => r.code === code).length })), name_differences: rows.filter(r => result.rows.find(s => s.adm_no === r.admission_no)?.name.trim().toLowerCase() !== r.name.toLowerCase()).map(r => r.admission_no) };
}

export async function importAllocation(client: PoolClient, examId: string, rows: Allocation[], actor: string) {
    const summary = await verifyAllocationStudents(client, rows);
    const existing = await client.query('SELECT 1 FROM exam_portal_allocations WHERE exam_id=$1 LIMIT 1', [examId]);
    if (existing.rows.length) throw new PortalError('This exam already has a roster. Move students individually to preserve marks.', 409);
    for (const code of new Set(rows.map(r => r.code))) {
        const center = await client.query('INSERT INTO exam_portal_centers(exam_id,code,name) VALUES($1,$2,$3) RETURNING id', [examId, code, `Exam Center ${code}`]);
        for (const row of rows.filter(r => r.code === code)) await client.query('INSERT INTO exam_portal_allocations(exam_id,student_id,center_id,serial_no,student_name,standard) VALUES($1,$2,$3,$4,$5,$6)', [examId, row.admission_no, center.rows[0].id, row.serial_no, row.name, row.standard]);
    }
    for (const standard of new Set(rows.map(r => r.standard))) {
        const exists = await client.query('SELECT 1 FROM exam_subjects WHERE exam_id=$1 AND standard=$2', [examId, standard]);
        if (!exists.rows.length) await client.query("INSERT INTO exam_subjects(exam_id,name,standard,max_marks,min_marks,question_count,question_max) VALUES($1,'Hifz Valuation',$2,100,40,10,10)", [examId, standard]);
    }
    await client.query("INSERT INTO exam_portal_audit(exam_id,actor,action,details) VALUES($1,$2,'import',$3)", [examId, actor, JSON.stringify(summary)]);
    return summary;
}
