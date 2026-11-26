/** Pure result calculation shared by reports and exports. Never changes saved marks. */
export type ResultSubject = {
    id: string;
    name: string;
    standard: string | null;
    max_marks: number | string;
    min_marks: number | string;
    question_count: number | null;
    result_group?: string | null;
    result_group_min_marks?: number | string | null;
    result_component_min_marks?: number | string | null;
};
export type ResultValuation = {
    student_id: string;
    subject_id: string;
    total: number | string | null;
    status: string;
};

function numeric(value: unknown): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}
const sum = (values: number[]) => Number(values.reduce((total, value) => total + value, 0).toFixed(10));

export function hifzGrade(percentage: number | null) {
    if (percentage === null || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) return null;
    if (percentage >= 95) return 'A++';
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B+';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C+';
    if (percentage >= 40) return 'C';
    if (percentage >= 35) return 'D+';
    return 'F';
}

export function evaluateStudentResult(
    student: { student_id: string; standard: string },
    subjects: ResultSubject[],
    valuations: ResultValuation[],
) {
    const configured = subjects.filter(subject => subject.standard === student.standard && subject.question_count);
    const members = new Map<string, ResultSubject[]>();
    for (const subject of configured) {
        const group = subject.result_group?.trim();
        const key = group ? `group:${group}` : `subject:${subject.id}`;
        members.set(key, [...(members.get(key) || []), subject]);
    }
    const groups = [...members].map(([key, groupSubjects]) => {
        const grouped = key.startsWith('group:');
        const minima = groupSubjects.map(subject => numeric(grouped ? subject.result_group_min_marks : subject.min_marks));
        const maxima = groupSubjects.map(subject => numeric(subject.max_marks));
        const max = sum(maxima.map(value => value ?? 0));
        const min = minima[0] ?? 0;
        const validPolicy = minima.every(value => value !== null && value === min && value >= 0)
            && maxima.every(value => value !== null && value > 0) && min <= max;
        const values = groupSubjects.map(subject => {
            const saved = valuations.filter(value => value.student_id === student.student_id && value.subject_id === subject.id);
            if (saved.length !== 1 || saved[0].status !== 'submitted') return null;
            const total = numeric(saved[0].total);
            return total !== null && total >= 0 && total <= Number(subject.max_marks) ? total : null;
        });
        const complete = validPolicy && values.every(value => value !== null);
        const total = sum(values.map(value => value ?? 0));
        const components = groupSubjects.map((subject, index) => ({
            subject_id: subject.id, label: subject.name, total: values[index], max: Number(subject.max_marks),
            min: grouped && subject.result_component_min_marks != null ? numeric(subject.result_component_min_marks) : null,
        }));
        const componentPolicyValid = groupSubjects.every(subject => subject.result_component_min_marks == null
            || (numeric(subject.result_component_min_marks) !== null && Number(subject.result_component_min_marks) >= 0 && Number(subject.result_component_min_marks) <= Number(subject.max_marks)));
        const groupComplete = complete && componentPolicyValid;
        const passed = groupComplete && total >= min && components.every(component => component.min === null || (component.total !== null && component.total >= component.min));
        return {
            key,
            label: grouped ? groupSubjects[0].result_group!.trim() : groupSubjects[0].name,
            subject_ids: groupSubjects.map(subject => subject.id),
            complete: groupComplete,
            total,
            max,
            min,
            components,
            passed,
            grade: grouped && groupComplete ? (passed ? hifzGrade(total / max * 100) : 'F') : null,
        };
    });
    const complete = !!configured.length && groups.every(group => group.complete);
    const total = sum(groups.map(group => group.total));
    const max = sum(groups.map(group => group.max));
    const minTotal = sum(groups.map(group => group.min));
    const passed = complete && total >= minTotal && groups.every(group => group.passed);
    const percentage = complete && max ? total / max * 100 : null;
    return {
        complete,
        total,
        max,
        minTotal,
        percentage,
        passed,
        grade: complete && configured.some(subject => subject.result_group) ? (passed ? hifzGrade(percentage) : 'F') : null,
        groups,
    };
}
