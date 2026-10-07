"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ClipboardList, FilePlus2, ShieldAlert } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DisciplineEmpty, DisciplineLoading, Incident, SeverityBadge, StatusBadge, formatDisciplineDate } from "@/components/discipline/discipline-ui"

export default function StaffDisciplinaryPage() {
    const [incidents, setIncidents] = useState<Incident[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        let active = true
        api.get("/discipline/incidents", { params: { page: 1, limit: 20 } })
            .then(response => { if (active) setIncidents(response.data.incidents || []) })
            .catch(err => { if (active) setError(err.response?.data?.error || "Unable to load discipline records") })
            .finally(() => { if (active) setLoading(false) })
        return () => { active = false }
    }, [])

    return <main className="mx-auto w-full max-w-[1200px] space-y-5 p-4 md:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600"><ShieldAlert className="h-6 w-6" /></div>
                <div><p className="text-xs font-bold uppercase text-red-600">My students</p><h1 className="text-2xl font-bold text-slate-950 dark:text-white">Disciplinary Actions</h1><p className="text-sm text-slate-500">Report incidents for your assigned students. Admin or leadership must verify every submission.</p></div>
            </div>
            <Button asChild className="bg-red-600 hover:bg-red-700"><Link href="/staff/disciplinary/new"><FilePlus2 className="mr-2 h-4 w-4" />Report incident</Link></Button>
        </header>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800"><ClipboardList className="h-5 w-5 text-slate-500" /><div><h2 className="font-semibold">My submitted incidents</h2><p className="text-xs text-slate-500">Reports are reviewed using severity and corrective action.</p></div></div>
            {loading ? <DisciplineLoading label="Loading discipline records" /> : !incidents.length ? <DisciplineEmpty title="No incidents submitted" description="Incidents you report for your students will appear here." /> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{incidents.map(item => <Link href={`/staff/disciplinary/incidents/${item.id}`} key={item.id} className="grid gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><p className="font-semibold text-slate-950 dark:text-white">{item.student_name}</p><p className="text-xs text-slate-500">{item.reference_no} · {item.offence_name} · {formatDisciplineDate(item.reported_at, true)}</p></div><SeverityBadge severity={item.severity} /><StatusBadge status={item.status} /></Link>)}</div>}
        </section>
    </main>
}
