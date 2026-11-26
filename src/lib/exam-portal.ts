export type PortalExam = { id: string; title: string; portal_slug: string; portal_enabled: boolean; is_active: boolean }
export type PortalCenter = { id: string; code: string; name: string; examiner_name: string; locked: boolean; has_passcode: boolean }
export type PortalStudent = { student_id: string; student_name: string; standard: string; serial_no: number; center_id: string; mark_revision?: number }
export type PortalSubject = { id: string; name: string; standard: string; max_marks: number; min_marks: number; question_count: number | null; question_max: number | null }
export type Valuation = { student_id: string; subject_id: string; marks: (number | null)[]; juz: string; remarks: string; total: number | null; status: 'draft' | 'submitted'; examiner_name: string; submitted_at: string | null; version: number }
export type PortalSetupIssue = { type: 'students' | 'examiner_name' | 'passcode' | 'subjects'; message: string; center_id?: string; center_code?: string; standard?: string }
export type PortalReadiness = { ready: boolean; student_count: number; issues: PortalSetupIssue[] }
export type PortalData = { exam: PortalExam; centers: PortalCenter[]; students: PortalStudent[]; subjects: PortalSubject[]; valuations: Valuation[]; audit: { actor: string; action: string; created_at: string; details: unknown }[]; readiness?: PortalReadiness }
export function studentStatus(student: PortalStudent, subjects: PortalSubject[], valuations: Valuation[]) {
    const configured = subjects.filter(s => s.standard === student.standard && s.question_count)
    const saved = valuations.filter(v => v.student_id === student.student_id && configured.some(s => s.id === v.subject_id))
    return configured.length && configured.every(s => saved.some(v => v.subject_id === s.id && v.status === 'submitted')) ? 'submitted' : saved.length ? 'draft' : 'pending'
}
export function studentResult(student: PortalStudent, subjects: PortalSubject[], valuations: Valuation[]) {
    const configured = subjects.filter(s => s.standard === student.standard && s.question_count)
    const saved = valuations.filter(v => v.student_id === student.student_id && v.status === 'submitted' && configured.some(s => s.id === v.subject_id))
    const complete = !!configured.length && saved.length === configured.length
    const total = Number(saved.reduce((n, v) => n + (v.total ?? 0), 0).toFixed(10))
    const max = configured.reduce((n, s) => n + Number(s.max_marks), 0)
    return { complete, total, max, percentage: complete && max ? total / max * 100 : null, passed: complete && configured.every(s => saved.some(v => v.subject_id === s.id && Number(v.total) >= Number(s.min_marks))) }
}
export const errorMessage = (error: unknown) => {
    const e = error as { response?: { data?: { error?: string } }; message?: string }
    return e.response?.data?.error || e.message || 'Something went wrong. Please try again.'
}
