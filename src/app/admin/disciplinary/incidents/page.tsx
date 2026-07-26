"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Filter, FilePlus2, Search } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DisciplineEmpty, DisciplineLoading, Incident, SeverityBadge, StatusBadge, formatDisciplineDate } from "@/components/discipline/discipline-ui"

export default function DisciplineIncidentsPage() {
    const [incidents, setIncidents] = useState<Incident[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [status, setStatus] = useState("")
    const [severity, setSeverity] = useState("")
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const queueReview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("queue") === "review"
    const effectiveStatus = queueReview && !status ? "submitted" : status
    const query = useMemo(() => ({ page, limit: 20, search: search || undefined, status: effectiveStatus || undefined, severity: severity || undefined }), [page, search, effectiveStatus, severity])

    useEffect(() => {
        const timer = setTimeout(() => {
            let active = true
            setLoading(true)
            api.get("/discipline/incidents", { params: query }).then(response => { if (active) { setIncidents(response.data.incidents || []); setTotal(response.data.pagination?.total || 0) } }).finally(() => { if (active) setLoading(false) })
            return () => { active = false }
        }, search ? 300 : 0)
        return () => clearTimeout(timer)
    }, [query, search])

    return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-8">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase text-red-600">Discipline management</p><h1 className="text-2xl font-bold text-slate-950">{queueReview ? "Review Queue" : "Incident Records"}</h1><p className="text-sm text-slate-500">Search, filter, and follow each case through resolution.</p></div><Button asChild className="bg-red-600 hover:bg-red-700"><Link href="/admin/disciplinary/new"><FilePlus2 className="mr-2 h-4 w-4" />Report incident</Link></Button></header>
        <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[minmax(220px,1fr)_200px_180px_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Student, admission no, reference..." className="pl-9" /></div><select value={effectiveStatus} onChange={event => { setStatus(event.target.value); setPage(1) }} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">All statuses</option>{["draft","submitted","under_review","waiting_student_explanation","action_assigned","follow_up_pending","completed","cancelled"].map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><select value={severity} onChange={event => { setSeverity(event.target.value); setPage(1) }} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="">All severity</option>{["minor","moderate","major","critical"].map(value => <option key={value}>{value}</option>)}</select><Button variant="outline" onClick={() => { setSearch(""); setStatus(""); setSeverity(""); setPage(1) }}><Filter className="mr-2 h-4 w-4" />Clear</Button></section>
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">{loading ? <DisciplineLoading label="Loading incident records" /> : !incidents.length ? <DisciplineEmpty title="No matching incidents" description="Adjust the filters or create a new incident report." /> : <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Incident</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Problem</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Reported</th></tr></thead><tbody className="divide-y">{incidents.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-4"><Link href={`/admin/disciplinary/incidents/${item.id}`} className="font-semibold text-blue-700 hover:underline">{item.reference_no}</Link>{item.repeat_offence && <p className="mt-1 text-xs font-semibold text-red-600">Repeat offence</p>}</td><td className="px-4 py-4"><Link href={`/admin/disciplinary/students/${item.student_id}`} className="font-semibold text-slate-900">{item.student_name}</Link><p className="text-xs text-slate-500">{item.student_id}</p></td><td className="px-4 py-4"><p className="font-medium text-slate-800">{item.offence_name}</p><p className="text-xs text-slate-500">{item.category_name}</p></td><td className="px-4 py-4"><SeverityBadge severity={item.severity} /></td><td className="px-4 py-4"><StatusBadge status={item.status} /></td><td className="px-4 py-4 text-slate-500">{formatDisciplineDate(item.reported_at,true)}</td></tr>)}</tbody></table></div><div className="divide-y md:hidden">{incidents.map(item => <Link href={`/admin/disciplinary/incidents/${item.id}`} key={item.id} className="block space-y-3 p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-slate-950">{item.student_name}</p><p className="text-xs text-slate-500">{item.reference_no} · {item.student_id}</p></div><SeverityBadge severity={item.severity} /></div><p className="text-sm text-slate-700">{item.offence_name}</p><div className="flex items-center justify-between"><StatusBadge status={item.status} /><span className="text-xs text-slate-500">{formatDisciplineDate(item.reported_at)}</span></div></Link>)}</div></>}</section>
        <footer className="flex items-center justify-between text-sm text-slate-500"><span>{total ? `${(page-1)*20+1}-${Math.min(page*20,total)} of ${total}` : "0 records"}</span><div className="flex gap-2"><Button size="icon" variant="outline" disabled={page===1} onClick={() => setPage(value => value-1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" disabled={page*20>=total} onClick={() => setPage(value => value+1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button></div></footer>
    </main>
}