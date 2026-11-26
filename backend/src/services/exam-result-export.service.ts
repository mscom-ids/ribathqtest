import { evaluateStudentResult, type ResultSubject, type ResultValuation } from './exam-result.service';

type ExportRow = ResultValuation & {
    center: string;
    serial_no: number;
    student_name: string;
    standard: string;
    subject: string | null;
    max_marks: number | string;
    min_marks: number | string;
    question_count: number | null;
    result_group?: string | null;
    result_group_min_marks?: number | string | null;
    result_component_min_marks?: number | string | null;
    marks?: (number | null)[];
    juz?: string;
    remarks?: string;
    examiner_name?: string;
    submitted_at?: string | Date | null;
};

/** Keep original question rows and add the actual grouped and overall decisions. */
export function createResultExportRows(rows: ExportRow[]) {
    const results = new Map<string, ReturnType<typeof evaluateStudentResult>>();
    for (const row of rows) {
        if (results.has(row.student_id)) continue;
        const studentRows = rows.filter(value => value.student_id === row.student_id);
        const subjects: ResultSubject[] = studentRows.filter(value => value.subject_id).map(value => ({
            id: value.subject_id, name: value.subject || '', standard: value.standard,
            max_marks: value.max_marks, min_marks: value.min_marks, question_count: value.question_count,
            result_group: value.result_group, result_group_min_marks: value.result_group_min_marks,
            result_component_min_marks: value.result_component_min_marks,
        }));
        results.set(row.student_id, evaluateStudentResult(row, subjects, studentRows));
    }
    return rows.map(row => {
        const overall = results.get(row.student_id)!;
        const group = overall.groups.find(value => value.subject_ids.includes(row.subject_id));
        return {
            Center: row.center, 'SL NO': row.serial_no, 'AD. NO': row.student_id,
            Name: row.student_name, Standard: row.standard, Subject: row.subject || '', Juz: row.juz || '',
            ...Object.fromEntries(Array.from({ length: row.question_count || 0 }, (_, index) => [`Q${index + 1}`, row.marks?.[index] ?? ''])),
            Total: row.total == null ? '' : Number(row.total), Maximum: row.max_marks ?? '', Status: row.status,
            Result: group?.complete ? (group.passed ? 'Pass' : 'Fail') : 'Pending',
            'Result Group': group?.label || '',
            'Group Total': group?.complete ? group.total : '', 'Group Maximum': group?.max ?? '',
            'Group Pass Mark': group?.min ?? '',
            'Component Minimum': row.result_component_min_marks ?? '',
            'Group Grade': group?.grade ?? '',
            'Overall Total': overall.complete ? overall.total : '', 'Overall Maximum': overall.max,
            'Overall Minimum': overall.minTotal, 'Overall Result': overall.complete ? (overall.passed ? 'Pass' : 'Fail') : 'Pending',
            'Overall Grade': overall.grade ?? '',
            Remarks: row.remarks || '', Examiner: row.examiner_name || '',
            Submitted: row.submitted_at ? new Date(row.submitted_at).toISOString() : '',
        };
    });
}
