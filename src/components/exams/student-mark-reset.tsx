import { useState } from 'react'
import type { PortalData } from '@/lib/exam-portal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
export default function StudentMarkReset({ data, busy, onReset }: { data: PortalData; busy: boolean; onReset: (studentId: string) => void }) {
    const [search, setSearch] = useState('')
    const [studentId, setStudentId] = useState('')
    const student = data.students.find(s => s.student_id === studentId)
    return <section className="rounded-xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="font-bold">Reset a student’s exam marks</h2>
        <p className="mt-2 text-sm text-slate-600">Delete all saved drafts and submitted results for one student in this exam. The student stays in the assigned center.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Search student to reset" placeholder="Search name or admission number" value={search} onChange={event => { setSearch(event.target.value); setStudentId('') }} /><select aria-label="Student whose exam marks to reset" className="h-10 min-w-0 rounded-md border px-3 text-sm" value={studentId} onChange={event => setStudentId(event.target.value)}><option value="">Choose student</option>{data.students.filter(s => `${s.student_id} ${s.student_name}`.toLowerCase().includes(search.toLowerCase())).map(s => <option key={s.student_id} value={s.student_id}>{s.student_id} · {s.student_name}</option>)}</select><Button variant="outline" className="text-red-700" disabled={busy || !student} onClick={() => { if (student && confirm(`Reset all exam marks for ${student.student_name} (${student.student_id})? This permanently deletes all drafts and submitted results for this exam. The examiner will start with blank marks.`)) onReset(student.student_id) }}>Reset student marks</Button></div>
    </section>
}
