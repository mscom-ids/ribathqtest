"use client"

import { useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage, type PortalData, type PortalStudent, type PortalSubject, type Valuation } from '@/lib/exam-portal'

type MarkCorrection = {
    student_id: string
    subject_id: string
    marks: (number | null)[]
    juz: string
    remarks: string
    version: number
    mark_revision: number
    confirmed: true
}
type EditorState = {
    student: PortalStudent
    subject: PortalSubject
    valuation: Valuation
    marks: string[]
    juz: string
    remarks: string
}

export default function AdministratorMarkEditor({ data, busy, saveError, onSave }: {
    data: PortalData
    busy: boolean
    saveError?: string
    onSave: (body: MarkCorrection) => Promise<boolean>
}) {
    const [studentId, setStudentId] = useState('')
    const [subjectId, setSubjectId] = useState('')
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [dirty, setDirty] = useState(false)
    const [error, setError] = useState('')
    const [saveFailed, setSaveFailed] = useState(false)
    const students = data.students.filter(student => data.valuations.some(value => value.student_id === student.student_id))
        .sort((a, b) => a.student_name.localeCompare(b.student_name))
    const subjects = data.subjects.filter(subject => subject.question_count && data.valuations.some(value => value.student_id === studentId && value.subject_id === subject.id))
    const canEdit = students.some(student => student.student_id === studentId) && subjects.some(subject => subject.id === subjectId)

    function openEditor() {
        const student = data.students.find(item => item.student_id === studentId)
        const subject = subjects.find(item => item.id === subjectId)
        const valuation = data.valuations.find(value => value.student_id === studentId && value.subject_id === subjectId)
        if (!student || !subject || !valuation) return
        setEditor({ student, subject, valuation, marks: Array.from({ length: subject.question_count || 0 }, (_, index) => valuation.marks[index] == null ? '' : String(valuation.marks[index])), juz: valuation.juz || '', remarks: valuation.remarks || '' })
        setDirty(false); setError(''); setSaveFailed(false)
    }
    function closeEditor() {
        if (busy || (dirty && !confirm('Discard unsaved mark corrections?'))) return
        setEditor(null)
    }
    async function save() {
        if (!editor) return
        setError(''); setSaveFailed(false)
        const maximum = editor.subject.question_max || 10
        const marks = editor.marks.map(value => value.trim() === '' ? null : Number(value))
        if (marks.some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > maximum))) {
            setError(`Each mark must be a number from 0 to ${maximum}. Decimal marks are allowed.`); return
        }
        if (editor.valuation.status === 'submitted' && marks.some(value => value === null)) {
            setError('Complete every question before saving corrections to a submitted valuation.'); return
        }
        if (!confirm(`Save corrected marks for ${editor.student.student_name} (${editor.student.student_id})?${editor.valuation.status === 'submitted' ? ' The published exam result will update immediately.' : ' This valuation will remain a draft.'}`)) return
        try {
            const saved = await onSave({ student_id: editor.student.student_id, subject_id: editor.subject.id, marks, juz: editor.juz.trim(), remarks: editor.remarks.trim(), version: editor.valuation.version, mark_revision: editor.student.mark_revision || 0, confirmed: true })
            if (saved) { setEditor(null); setDirty(false) }
            else setSaveFailed(true)
        } catch (e) { setError(errorMessage(e)) }
    }
    const entered = editor?.marks.filter(value => value.trim() !== '').length || 0
    const total = editor ? Number(editor.marks.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0).toFixed(10)) : 0

    return <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Edit student marks</h2>
        <p className="mt-2 text-sm text-slate-600">Correct question marks in a saved draft or submitted valuation. Submitted corrections update the published result; drafts remain drafts.</p>
        {students.length ? <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <select aria-label="Student marks to edit" className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" disabled={busy} value={studentId} onChange={event => { setStudentId(event.target.value); setSubjectId('') }}><option value="">Choose student with saved marks</option>{students.map(student => <option key={student.student_id} value={student.student_id}>{student.student_id} · {student.student_name}</option>)}</select>
            <select aria-label="Valuation subject" className="h-10 min-w-0 rounded-md border bg-white px-3 text-sm" disabled={busy || !studentId} value={subjectId} onChange={event => setSubjectId(event.target.value)}><option value="">Choose subject</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name} · {data.valuations.find(value => value.student_id === studentId && value.subject_id === subject.id)?.status}</option>)}</select>
            <Button variant="outline" disabled={busy || !canEdit} onClick={openEditor}><Pencil className="mr-2 h-4 w-4" />Edit marks</Button>
        </div> : <p className="mt-4 text-sm text-slate-500">No saved valuations to edit yet.</p>}
        <Dialog open={!!editor} onOpenChange={open => { if (!open) closeEditor() }}><DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b px-5 py-4"><DialogTitle>Correct student marks</DialogTitle><DialogDescription>{editor?.student.student_name} · {editor?.student.student_id} · {editor?.subject.name}</DialogDescription></DialogHeader>
            {editor && <div className="space-y-5 overflow-y-auto px-5 py-4">
                <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold">{editor.valuation.status === 'submitted' ? 'Submitted valuation' : 'Saved draft'}</p><p className="mt-1 text-slate-600">{editor.student.standard} · Examiner: {editor.valuation.examiner_name || data.centers.find(center => center.id === editor.student.center_id)?.examiner_name || 'Not assigned'}</p></div>
                {(error || saveFailed) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || saveError || 'Corrections could not be saved. Refresh the administration page and try again.'}</p>}
                <div className="space-y-2"><Label htmlFor="edit-valuation-juz">Juz / portion (optional)</Label><Input id="edit-valuation-juz" aria-label="Edit Juz / portion (optional)" value={editor.juz} maxLength={120} disabled={busy} onChange={event => { setEditor({ ...editor, juz: event.target.value }); setDirty(true) }} /></div>
                <div><p className="mb-3 text-sm text-slate-600">Marks from 0 to {editor.subject.question_max}; decimals such as 9.5 and 9.4 are allowed.</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{editor.marks.map((mark, index) => <div key={index} className="rounded-xl border bg-slate-50 p-3"><Label className="mb-2 block text-xs" htmlFor={`edit-question-${index}`}>Question {index + 1}</Label><Input id={`edit-question-${index}`} aria-label={`Edit Question ${index + 1}`} type="number" inputMode="decimal" step="any" min={0} max={editor.subject.question_max || 10} value={mark} disabled={busy} className="h-11 bg-white text-center text-lg font-bold" onChange={event => { setEditor({ ...editor, marks: editor.marks.map((value, item) => item === index ? event.target.value : value) }); setDirty(true) }} /></div>)}</div></div>
                <div className="flex items-center justify-between rounded-xl bg-emerald-900 p-4 text-white"><div><p className="font-semibold">{entered === editor.marks.length ? 'Total marks' : 'Partial total'}</p><p className="text-xs text-emerald-100">{entered} of {editor.marks.length} questions entered</p></div><p className="text-2xl font-bold">{entered ? total : '—'}<span className="ml-1 text-sm font-normal">/ {editor.subject.max_marks}</span></p></div>
                <div className="space-y-2"><Label htmlFor="edit-valuation-remarks">Remarks (optional)</Label><Textarea id="edit-valuation-remarks" aria-label="Edit remarks" value={editor.remarks} maxLength={2000} disabled={busy} onChange={event => { setEditor({ ...editor, remarks: event.target.value }); setDirty(true) }} /></div>
            </div>}
            <DialogFooter className="border-t px-5 py-4"><Button variant="outline" disabled={busy} onClick={closeEditor}>Cancel</Button><Button disabled={busy || !dirty} className="bg-emerald-800 hover:bg-emerald-900" onClick={() => void save()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save corrected marks</Button></DialogFooter>
        </DialogContent></Dialog>
    </section>
}
