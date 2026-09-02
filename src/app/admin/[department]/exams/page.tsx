"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, ChevronRight, GraduationCap, Loader2, Plus, Sparkles } from "lucide-react"
import { format } from "date-fns"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type Exam = { id: string; title: string; start_date: string; is_active: boolean }

export default function ExamsPage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params)
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1)
    const [exams, setExams] = useState<Exam[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        api.get("/exams", { params: { department: departmentName } })
            .then(response => setExams(response.data.exams || []))
            .catch(error => alert(error.response?.data?.error || "Failed to load exams"))
            .finally(() => setLoading(false))
    }, [departmentName])

    const active = exams.filter(exam => exam.is_active)
    const completed = exams.filter(exam => !exam.is_active)

    const examCard = (exam: Exam) => <Link key={exam.id} href={`/admin/${department}/exams/${exam.id}`} className="group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md dark:bg-slate-950">
        <div className={`absolute inset-x-0 top-0 h-1 ${exam.is_active ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-slate-300"}`} />
        <div className="flex items-start gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${exam.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><GraduationCap className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="line-clamp-2 font-bold leading-snug">{exam.title}</h3><ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-emerald-600" /></div><div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={exam.is_active ? "default" : "secondary"} className={exam.is_active ? "bg-emerald-600" : ""}>{exam.is_active ? "Active" : "Completed"}</Badge><span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Calendar className="h-3.5 w-3.5" />{format(new Date(exam.start_date), "dd MMM yyyy")}</span></div></div>
        </div>
    </Link>

    return <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-10">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-5 py-4 text-white shadow-sm sm:px-6">
            <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
            <div className="absolute -right-8 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full border-[10px] border-white/15" />
            <div className="relative flex flex-wrap items-center justify-between gap-3"><div><div className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-100"><Sparkles className="h-3.5 w-3.5" />Examination center</div><h1 className="text-xl font-bold sm:text-2xl">{departmentName} examinations</h1><p className="mt-0.5 text-[13px] font-medium text-blue-100">Plan exams, configure subjects, and record results.</p></div><Button asChild size="sm" className="bg-white text-blue-700 shadow-sm hover:bg-blue-50"><Link href={`/admin/${department}/exams/create`}><Plus className="mr-1.5 h-4 w-4" />Create exam</Link></Button></div>
        </header>

        <div className="grid grid-cols-3 gap-3">
            {[["Total exams", exams.length, "bg-blue-50 text-blue-700", "bg-blue-100"], ["Active", active.length, "bg-emerald-50 text-emerald-700", "bg-emerald-100"], ["Completed", completed.length, "bg-violet-50 text-violet-700", "bg-violet-100"]].map(([label, value, colors, iconColors]) => <Card key={String(label)} className="border-slate-200/70 shadow-sm"><CardContent className="flex items-center justify-between p-3.5 sm:p-4"><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">{label}</p><p className={`mt-0.5 text-2xl font-extrabold ${String(colors).split(" ")[1]}`}>{value}</p></div><div className={`hidden h-10 w-10 items-center justify-center rounded-xl sm:flex ${iconColors}`}><GraduationCap className={`h-5 w-5 ${String(colors).split(" ")[1]}`} /></div></CardContent></Card>)}
        </div>

        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div> : exams.length === 0 ? <Card><CardContent className="py-16 text-center"><h2 className="font-semibold">No exams yet</h2><p className="mt-1 text-sm text-muted-foreground">Create an exam to begin subject setup.</p><Button asChild className="mt-5 bg-emerald-600 hover:bg-emerald-700"><Link href={`/admin/${department}/exams/create`}>Create exam</Link></Button></CardContent></Card> : <div className="space-y-6">
            {active.length > 0 && <section><h2 className="mb-2 text-[16px] font-extrabold text-slate-800">Active examinations</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{active.map(examCard)}</div></section>}
            {completed.length > 0 && <section><h2 className="mb-2 text-[16px] font-extrabold text-slate-800">Completed examinations</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{completed.map(examCard)}</div></section>}
        </div>}
    </div>
}
