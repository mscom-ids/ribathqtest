"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CalendarDays, ChevronRight, GraduationCap, Loader2, Trash2 } from "lucide-react"
import { format } from "date-fns"
import api from "@/lib/api"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Exam = { id: string; title: string; start_date: string; is_active: boolean }
type Subject = { id: string; max_marks: number; standard: string | null }
const standards = ["5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"]
const accents = [
    { bar: "bg-blue-500", icon: "bg-blue-50 text-blue-600", hover: "hover:border-blue-200" },
    { bar: "bg-violet-500", icon: "bg-violet-50 text-violet-600", hover: "hover:border-violet-200" },
    { bar: "bg-emerald-500", icon: "bg-emerald-50 text-emerald-600", hover: "hover:border-emerald-200" },
    { bar: "bg-orange-500", icon: "bg-orange-50 text-orange-600", hover: "hover:border-orange-200" },
]

export default function ExamPage({ params }: { params: Promise<{ id: string; department: string }> }) {
    const { id, department } = use(params)
    const router = useRouter()
    const [exam, setExam] = useState<Exam | null>(null)
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(false)
    const [confirmation, setConfirmation] = useState("")

    useEffect(() => {
        api.get(`/exams/${id}`).then(response => {
            setExam(response.data.exam)
            setSubjects(response.data.subjects || [])
        }).catch(error => alert(error.response?.data?.error || "Failed to load exam"))
            .finally(() => setLoading(false))
    }, [id])

    async function setStatus(is_active: boolean) {
        try {
            await api.patch(`/exams/${id}/status`, { is_active })
            setExam(current => current ? { ...current, is_active } : current)
        } catch (error: any) { alert(error.response?.data?.error || "Failed to update exam") }
    }

    async function deleteExam() {
        if (!exam || confirmation !== exam.title) return
        setDeleting(true)
        try { await api.delete(`/exams/${id}`); router.replace(`/admin/${department}/exams`) }
        catch (error: any) { alert(error.response?.data?.error || "Failed to delete exam"); setDeleting(false) }
    }

    if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>
    if (!exam) return <div className="p-8">Exam not found</div>

    const configuredStandards = standards.filter(value => subjects.some(subject => subject.standard === value)).length

    return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 px-5 py-4 text-white shadow-sm sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
            <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border-[10px] border-white/15" />
            <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0"><button onClick={() => router.push(`/admin/${department}/exams`)} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-100 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />All exams</button><div className="flex flex-wrap items-center gap-2"><Badge className={exam.is_active ? "bg-lime-400 text-emerald-950 hover:bg-lime-400" : "bg-slate-500 text-white"}>{exam.is_active ? "Active" : "Completed"}</Badge><span className="flex items-center gap-1 text-xs font-medium text-emerald-100"><CalendarDays className="h-3.5 w-3.5" />Starts {format(new Date(exam.start_date), "dd MMM yyyy")}</span></div><h1 className="mt-1.5 truncate text-xl font-bold sm:text-2xl">{exam.title}</h1></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setStatus(!exam.is_active)} className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">{exam.is_active ? "Complete exam" : "Reopen exam"}</Button><AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant="outline" className="border-red-100/30 bg-red-500/15 text-white hover:bg-red-500/30 hover:text-white"><Trash2 className="mr-1.5 h-4 w-4" />Delete</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this exam permanently?</AlertDialogTitle><AlertDialogDescription>All subjects and student results in this exam will be deleted. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><div className="space-y-2"><Label>Type “{exam.title}” to confirm</Label><Input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteExam} disabled={deleting || confirmation !== exam.title} className="bg-red-600 hover:bg-red-700">{deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete permanently</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
            </div>
        </header>

        <div className="grid grid-cols-3 gap-3">
            <Card className="border-slate-200/70 shadow-sm"><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Standards</p><p className="mt-0.5 text-2xl font-extrabold text-blue-700">{standards.length}</p></CardContent></Card>
            <Card className="border-slate-200/70 shadow-sm"><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Configured</p><p className="mt-0.5 text-2xl font-extrabold text-emerald-700">{configuredStandards}</p></CardContent></Card>
            <Card className="border-slate-200/70 shadow-sm"><CardContent className="p-3.5 sm:p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Subjects</p><p className="mt-0.5 text-2xl font-extrabold text-violet-700">{subjects.length}</p></CardContent></Card>
        </div>

        <section><div className="mb-3"><h2 className="text-[17px] font-extrabold text-slate-800">Choose a standard</h2><p className="text-[13px] font-medium text-slate-500">Open a standard to configure subjects and enter marks.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{standards.map((value, index) => {
            const configured = subjects.filter(subject => subject.standard === value)
            const totalMarks = configured.reduce((sum, subject) => sum + Number(subject.max_marks), 0)
            const accent = accents[index % accents.length]
            return <Link key={value} href={`/admin/${department}/exams/${id}/standard/${value}`} className={`group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${accent.hover}`}><div className={`absolute inset-y-0 left-0 w-1 ${accent.bar}`} /><div className="flex items-center gap-3"><div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.icon}`}><GraduationCap className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="text-lg font-extrabold">{value} Standard</h3>{configured.length > 0 && <span className="h-2 w-2 rounded-full bg-emerald-500" />}</div><p className="text-xs font-medium text-slate-500">{configured.length ? `${configured.length} subjects · ${totalMarks} total marks` : "Not configured"}</p></div><ChevronRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1" /></div></Link>
        })}</div></section>
    </div>
}
