"use client"

import { FormEvent, use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, BookOpen, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Exam = { id: string; title: string; is_active: boolean }
type Subject = { id: string; name: string; max_marks: number; min_marks: number; standard: string | null }

export default function StandardExamPage({ params }: { params: Promise<{ id: string; department: string; standard: string }> }) {
    const resolved = use(params)
    const { id, department } = resolved
    const standard = decodeURIComponent(resolved.standard)
    const router = useRouter()
    const [exam, setExam] = useState<Exam | null>(null)
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [name, setName] = useState("")
    const [maximum, setMaximum] = useState(100)
    const [passMark, setPassMark] = useState(40)
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)

    async function load() {
        try {
            const response = await api.get(`/exams/${id}`)
            setExam(response.data.exam)
            setSubjects((response.data.subjects || []).filter((subject: Subject) => subject.standard === standard))
        } catch (error: any) { alert(error.response?.data?.error || "Failed to load standard") }
        finally { setLoading(false) }
    }
    useEffect(() => { load() }, [id, standard])

    async function addSubject(event: FormEvent) {
        event.preventDefault()
        if (!name.trim() || maximum <= 0 || passMark < 0 || passMark > maximum) return
        setAdding(true)
        try {
            await api.post(`/exams/${id}/subjects`, { name: name.trim(), standard, max_marks: maximum, min_marks: passMark })
            setName(""); await load()
        } catch (error: any) { alert(error.response?.data?.error || "Failed to add subject") }
        finally { setAdding(false) }
    }

    async function removeSubject(subject: Subject) {
        if (!confirm(`Delete ${subject.name}? Its saved marks will also be deleted.`)) return
        try { await api.delete(`/exams/subjects/${subject.id}`); await load() }
        catch (error: any) { alert(error.response?.data?.error || "Failed to delete subject") }
    }

    if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
    if (!exam) return <div className="p-8">Exam not found</div>
    const totalMaximum = subjects.reduce((sum, subject) => sum + Number(subject.max_marks), 0)

    return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 px-5 py-4 text-white shadow-sm sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
            <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border-[10px] border-white/15" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><button onClick={() => router.push(`/admin/${department}/exams/${id}`)} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />All standards</button><div className="flex items-center gap-2"><h1 className="text-xl font-bold sm:text-2xl">{standard} Standard</h1><Badge className="bg-white/15 text-white hover:bg-white/15">{subjects.length} subjects</Badge></div><p className="truncate text-[13px] font-medium text-emerald-100">{exam.title}</p></div>{subjects.length ? <Button asChild size="sm" className="bg-white text-emerald-700 shadow-sm hover:bg-emerald-50"><Link href={`/admin/${department}/exams/${id}/marks?standard=${encodeURIComponent(standard)}`}><ClipboardList className="mr-1.5 h-4 w-4" />Enter marks</Link></Button> : <Button size="sm" disabled className="bg-white/30 text-white"><ClipboardList className="mr-1.5 h-4 w-4" />Add subjects first</Button>}</div>
        </header>

        <div className="grid grid-cols-2 gap-3"><Card className="border-slate-200/70 shadow-sm"><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Subjects</p><p className="mt-0.5 text-2xl font-extrabold text-blue-700">{subjects.length}</p></CardContent></Card><Card className="border-slate-200/70 shadow-sm"><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total marks</p><p className="mt-0.5 text-2xl font-extrabold text-violet-700">{totalMaximum}</p></CardContent></Card></div>

        <Card className="overflow-hidden rounded-xl border-slate-200/70 shadow-sm"><CardHeader className="border-b bg-slate-50/80 px-5 py-3.5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><BookOpen className="h-4 w-4" /></div><div><CardTitle className="text-[16px] font-extrabold">Subject setup</CardTitle><p className="text-xs font-medium text-muted-foreground">Configure subjects for {standard} Standard.</p></div></div></CardHeader><CardContent className="space-y-4 p-4 sm:p-5">
            <form onSubmit={addSubject} className="grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 sm:grid-cols-[1fr_110px_110px_auto] sm:items-end"><div><Label htmlFor="subject-name">Subject</Label><Input id="subject-name" value={name} onChange={event => setName(event.target.value)} placeholder="Subject name" /></div><div><Label htmlFor="maximum">Maximum</Label><Input id="maximum" type="number" min={1} value={maximum} onChange={event => setMaximum(Number(event.target.value))} /></div><div><Label htmlFor="pass-mark">Pass mark</Label><Input id="pass-mark" type="number" min={0} max={maximum} value={passMark} onChange={event => setPassMark(Number(event.target.value))} /></div><Button type="submit" disabled={adding || !name.trim() || maximum <= 0 || passMark > maximum} className="bg-emerald-600 hover:bg-emerald-700">{adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add</Button></form>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{subjects.length === 0 ? <div className="col-span-full rounded-xl border border-dashed px-4 py-10 text-center"><p className="font-medium">No subjects configured</p><p className="mt-1 text-sm text-muted-foreground">Add the first subject above.</p></div> : subjects.map((subject, index) => <div key={subject.id} className="relative overflow-hidden rounded-xl border bg-white p-3.5 shadow-sm transition hover:border-emerald-200"><div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" /><div className="flex items-start gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{subject.name}</p><p className="mt-1 text-[11px] font-medium text-slate-500">Maximum {subject.max_marks} · Pass {subject.min_marks}</p></div><Button variant="ghost" size="icon" aria-label={`Delete ${subject.name}`} onClick={() => removeSubject(subject)} className="h-7 w-7 text-muted-foreground hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}</div>
        </CardContent></Card>
    </div>
}
