"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertOctagon, ArrowRight, BarChart3, CheckCircle2, ClipboardList, Clock3, FilePlus2, Settings2, ShieldAlert, UsersRound } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DisciplineEmpty, DisciplineLoading, DisciplineMetric, Incident, RiskBadge, SeverityBadge, StatusBadge, formatDisciplineDate } from "@/components/discipline/discipline-ui"

type DashboardData = {
    summary: { incidents_today: number; waiting_review: number; serious_cases: number; students_needing_attention: number; pending_actions: number; overdue_actions: number; completed_last_30: number }
    recent: Incident[]
    categories: Array<{ name: string; count: number }>
    trend: Array<{ label: string; month: string; count: number }>
    risk: Array<{ student_id: string; name: string; standard?: string; division?: string; active_marks: number; risk_level: string }>
}

export default function DisciplinaryPage() {
    const [data, setData] = useState<DashboardData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        api.get("/discipline/dashboard").then(response => { if (active) setData(response.data) }).catch(error => { if (active) setError(error.response?.data?.error || "Unable to load discipline dashboard") }).finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    if (loading) return <DisciplineLoading label="Loading discipline dashboard" />

    return (
        <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
            <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><ShieldAlert className="h-6 w-6" /></div>
                    <div><p className="text-xs font-bold uppercase text-red-600">Student wellbeing</p><h1 className="text-2xl font-bold text-slate-950 md:text-3xl">Discipline Management</h1><p className="mt-1 text-sm text-slate-500">Fair reporting, review, corrective action, and improvement tracking.</p></div>
                </div>
                <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/disciplinary/incidents"><ClipboardList className="mr-2 h-4 w-4" />All records</Link></Button><Button asChild className="bg-red-600 hover:bg-red-700"><Link href="/admin/disciplinary/new"><FilePlus2 className="mr-2 h-4 w-4" />Report incident</Link></Button></div>
            </header>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
                <DisciplineMetric label="Today" value={data?.summary.incidents_today || 0} icon={ClipboardList} />
                <DisciplineMetric label="Waiting review" value={data?.summary.waiting_review || 0} icon={Clock3} tone="amber" href="/admin/disciplinary/incidents?queue=review" />
                <DisciplineMetric label="Serious cases" value={data?.summary.serious_cases || 0} icon={AlertOctagon} tone="red" />
                <DisciplineMetric label="Need attention" value={data?.summary.students_needing_attention || 0} icon={UsersRound} tone="violet" />
                <DisciplineMetric label="Pending actions" value={data?.summary.pending_actions || 0} icon={Clock3} tone="amber" />
                <DisciplineMetric label="Overdue" value={data?.summary.overdue_actions || 0} icon={AlertOctagon} tone="red" />
                <DisciplineMetric label="Resolved 30d" value={data?.summary.completed_last_30 || 0} icon={CheckCircle2} tone="emerald" />
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Recent incidents</h2><p className="text-sm text-slate-500">Latest records visible to your role</p></div><Button asChild variant="ghost" size="sm"><Link href="/admin/disciplinary/incidents">View all<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
                    {!data?.recent.length ? <DisciplineEmpty title="No incidents recorded" description="New incident reports will appear here after submission." action={<Button asChild><Link href="/admin/disciplinary/new">Create first report</Link></Button>} /> : <div className="divide-y divide-slate-100">{data.recent.map(incident => <Link key={incident.id} href={`/admin/disciplinary/incidents/${incident.id}`} className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-semibold text-slate-900">{incident.student_name}</p>{incident.repeat_offence && <span className="text-xs font-semibold text-red-600">Repeat</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{incident.offence_name} · {incident.reference_no} · {formatDisciplineDate(incident.reported_at, true)}</p></div><SeverityBadge severity={incident.severity} /><StatusBadge status={incident.status} /></Link>)}</div>}
                </div>

                <div className="space-y-6">
                    <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-950">Priority students</h2><p className="mb-4 text-sm text-slate-500">Active marks after positive adjustments</p><div className="space-y-3">{data?.risk.length ? data.risk.map(student => <Link key={student.student_id} href={`/admin/disciplinary/students/${student.student_id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-3 hover:bg-slate-50"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{student.name}</p><p className="text-xs text-slate-500">{student.student_id} · {[student.standard, student.division].filter(Boolean).join(" - ") || "Not placed"}</p></div><div className="text-right"><p className="text-sm font-bold text-red-600">{student.active_marks}</p><RiskBadge level={student.risk_level} /></div></Link>) : <p className="py-8 text-center text-sm text-slate-500">No students currently need attention.</p>}</div></div>
                    <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-950">Quick access</h2><div className="mt-4 grid grid-cols-2 gap-2"><Button asChild variant="outline" className="h-auto justify-start py-3"><Link href="/admin/disciplinary/incidents?queue=review"><Clock3 className="mr-2 h-4 w-4" />Review queue</Link></Button><Button asChild variant="outline" className="h-auto justify-start py-3"><Link href="/admin/disciplinary/reports"><BarChart3 className="mr-2 h-4 w-4" />Reports</Link></Button><Button asChild variant="outline" className="col-span-2 h-auto justify-start py-3"><Link href="/admin/disciplinary/settings"><Settings2 className="mr-2 h-4 w-4" />Categories, marks, and rules</Link></Button></div></div>
                </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-950">Common problem categories</h2><div className="mt-5 space-y-4">{(data?.categories || []).map(item => { const max = Math.max(...(data?.categories || []).map(row => row.count), 1); return <div key={item.name}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{item.name}</span><span className="font-semibold text-slate-900">{item.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(4, item.count / max * 100)}%` }} /></div></div> })}</div></div>
                <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-950">Six-month incident trend</h2><div className="mt-5 flex h-40 items-end gap-3">{(data?.trend || []).map(item => { const max = Math.max(...(data?.trend || []).map(row => row.count), 1); return <div key={item.month} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-xs font-semibold text-slate-600">{item.count}</span><div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.max(6, item.count / max * 110)}px` }} /><span className="text-xs text-slate-500">{item.label}</span></div> })}</div></div>
            </section>
        </main>
    )
}