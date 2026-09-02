"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, Check, ChevronRight, GraduationCap, Loader2, Search } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Exam = { id: string; title: string }
type Subject = { id: string; name: string; max_marks: number; min_marks: number; standard: string }
type Student = { adm_no: string; name: string; standard: string }
type Result = { subject_id: string; student_id: string; marks_obtained: number; remarks?: string | null }
type Draft = Record<string, { marks: string; remarks: string }>
const order = ["5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"]

export default function MarksPage({ params, searchParams }: { params: Promise<{ id: string; department: string }>; searchParams: Promise<{ standard?: string }> }) {
    const { id, department } = use(params)
    const query = use(searchParams)
    const router = useRouter()
    const requestedStandard = query.standard || null
    const [exam, setExam] = useState<Exam | null>(null)
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [results, setResults] = useState<Result[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [standard, setStandard] = useState("")
    const [student, setStudent] = useState<Student | null>(null)
    const [draft, setDraft] = useState<Draft>({})
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [saving, setSaving] = useState(false)

    const standards = useMemo(() => [...new Set(subjects.map(item => item.standard).filter(Boolean))].sort((a, b) => order.indexOf(a) - order.indexOf(b)), [subjects])
    const selectedSubjects = useMemo(() => subjects.filter(item => item.standard === standard), [subjects, standard])
    const visibleStudents = useMemo(() => students.filter(item => `${item.name} ${item.adm_no}`.toLowerCase().includes(search.toLowerCase())), [students, search])

    useEffect(() => {
        Promise.all([api.get(`/exams/${id}`), api.get(`/exams/${id}/marks`)]).then(([examResponse, marksResponse]) => {
            const loaded = examResponse.data.subjects || []
            setExam(examResponse.data.exam); setSubjects(loaded); setResults(marksResponse.data.marks || [])
            setStandard(requestedStandard && loaded.some((item: Subject) => item.standard === requestedStandard) ? requestedStandard : order.find(value => loaded.some((item: Subject) => item.standard === value)) || loaded[0]?.standard || "")
        }).catch(error => alert(error.response?.data?.error || "Failed to load exam")).finally(() => setLoading(false))
    }, [id, requestedStandard])

    useEffect(() => {
        if (!standard) return setStudents([])
        setLoadingStudents(true)
        api.get("/exams/students", { params: { department, standard } })
            .then(response => setStudents(response.data.students || []))
            .catch(error => alert(error.response?.data?.error || "Failed to load students"))
            .finally(() => setLoadingStudents(false))
    }, [department, standard])

    function editStudent(selected: Student) {
        const values: Draft = {}
        selectedSubjects.forEach(subject => {
            const result = results.find(item => item.student_id === selected.adm_no && item.subject_id === subject.id)
            values[subject.id] = { marks: result ? String(result.marks_obtained) : "", remarks: result?.remarks || "" }
        })
        setDraft(values); setStudent(selected)
    }

    async function save() {
        if (!student) return
        for (const subject of selectedSubjects) {
            const value = draft[subject.id]?.marks.trim()
            if (value && (Number(value) < 0 || Number(value) > subject.max_marks)) return alert(`${subject.name}: marks must be between 0 and ${subject.max_marks}`)
        }
        const updates = selectedSubjects.filter(subject => draft[subject.id]?.marks.trim()).map(subject => ({ subject_id: subject.id, student_id: student.adm_no, marks_obtained: Number(draft[subject.id].marks), remarks: draft[subject.id].remarks || null }))
        if (!updates.length) return alert("Enter at least one mark")
        setSaving(true)
        try {
            await api.post(`/exams/${id}/marks`, { updates })
            const response = await api.get(`/exams/${id}/marks`)
            setResults(response.data.marks || []); setStudent(null)
        } catch (error: any) { alert(error.response?.data?.error || "Failed to save marks") }
        finally { setSaving(false) }
    }

    if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
    if (!exam) return <div className="p-8">Exam not found</div>

    return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-5 py-4 text-white shadow-sm sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
            <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border-[10px] border-white/15" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><button onClick={() => router.push(standard ? `/admin/${department}/exams/${id}/standard/${standard}` : `/admin/${department}/exams/${id}`)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20" aria-label="Back to standard setup"><ArrowLeft className="h-4 w-4" /></button><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15"><GraduationCap className="h-5 w-5" /></div><div className="min-w-0"><h1 className="text-xl font-bold sm:text-2xl">Enter marks</h1><p className="truncate text-[13px] font-medium text-blue-100">{exam.title}</p></div></div>{standard && <div className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white">{standard} Standard</div>}</div>
        </header>

        {!standards.length ? <Card><CardContent className="py-16 text-center"><p className="font-semibold">Set up subjects first</p><p className="mt-1 text-sm text-muted-foreground">Marks entry becomes available after subjects are added.</p><Button className="mt-5" onClick={() => router.push(`/admin/${department}/exams/${id}`)}>Go to subject setup</Button></CardContent></Card> : <>
            <Card className="overflow-hidden rounded-xl border-slate-200/70 shadow-sm"><div className="flex items-center gap-3 border-b bg-slate-50/80 px-4 py-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><BookOpen className="h-4 w-4" /></div><div><p className="text-[15px] font-extrabold">Subjects</p><p className="text-xs text-muted-foreground">{selectedSubjects.length} configured for {standard}</p></div></div><CardContent className="grid gap-px bg-slate-100 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{selectedSubjects.map((subject, index) => { const accents = ["bg-blue-50 text-blue-600", "bg-violet-50 text-violet-600", "bg-emerald-50 text-emerald-600", "bg-orange-50 text-orange-600"]; return <div key={subject.id} className="flex items-center gap-3 bg-white p-3.5"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${accents[index % accents.length]}`}>{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{subject.name}</p><p className="mt-0.5 text-[11px] font-medium text-slate-500">Maximum {subject.max_marks} · Pass {subject.min_marks}</p></div></div> })}</CardContent></Card>
            <Card className="overflow-hidden rounded-xl border-slate-200/70 shadow-sm">
                <div className="border-b bg-slate-50/70 p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by student name or admission number" className="bg-white pl-9" /></div></div>
                <CardContent className="p-0">{loadingStudents ? <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : visibleStudents.length === 0 ? <div className="py-16 text-center text-sm text-muted-foreground">No students found in {standard}.</div> : visibleStudents.map(item => {
                    const entered = selectedSubjects.filter(subject => results.some(result => result.student_id === item.adm_no && result.subject_id === subject.id)).length
                    const complete = entered === selectedSubjects.length && entered > 0
                    return <button key={item.adm_no} onClick={() => editStudent(item)} className="group flex w-full items-center gap-3 border-b px-4 py-4 text-left last:border-b-0 hover:bg-blue-50/50 sm:px-5"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-sm font-bold text-indigo-700">{item.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="text-sm text-muted-foreground">{item.adm_no}</p></div><div className="text-right"><p className={complete ? "text-sm font-bold text-emerald-600" : "text-sm font-bold text-slate-700"}>{entered}/{selectedSubjects.length}</p><p className="text-xs text-muted-foreground">marks entered</p></div><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 transition group-hover:bg-blue-100 group-hover:text-blue-700"><ChevronRight className="h-4 w-4" /></div></button>
                })}</CardContent>
            </Card>
        </>}

        <Dialog open={!!student} onOpenChange={open => !open && setStudent(null)}><DialogContent className="flex max-h-[90vh] max-w-xl flex-col overflow-hidden p-0"><DialogHeader className="border-b p-5"><DialogTitle>{student?.name}</DialogTitle><DialogDescription>{student?.adm_no} · {standard} Standard</DialogDescription></DialogHeader>
            <div className="overflow-y-auto px-5">{selectedSubjects.map(subject => { const value = draft[subject.id] || { marks: "", remarks: "" }; const marks = Number(value.marks); return <div key={subject.id} className="border-b py-4"><div className="mb-3 flex items-center justify-between gap-2"><Label htmlFor={`mark-${subject.id}`} className="text-base font-semibold">{subject.name}</Label><span className="text-xs text-muted-foreground">Pass {subject.min_marks} / Max {subject.max_marks}</span></div><div className="grid gap-3 sm:grid-cols-[120px_1fr]"><div><Label htmlFor={`mark-${subject.id}`} className="text-xs text-muted-foreground">Mark</Label><Input id={`mark-${subject.id}`} type="number" min={0} max={subject.max_marks} value={value.marks} onChange={event => setDraft(current => ({ ...current, [subject.id]: { ...value, marks: event.target.value } }))} className={value.marks && marks < subject.min_marks ? "border-red-300" : ""} /></div><div><Label htmlFor={`remark-${subject.id}`} className="text-xs text-muted-foreground">Optional remark</Label><Input id={`remark-${subject.id}`} value={value.remarks} onChange={event => setDraft(current => ({ ...current, [subject.id]: { ...value, remarks: event.target.value } }))} placeholder="Add a remark" /></div></div></div> })}</div>
            <DialogFooter className="border-t p-4"><Button variant="outline" onClick={() => setStudent(null)}>Cancel</Button><Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Save marks</Button></DialogFooter>
        </DialogContent></Dialog>
    </div>
}
