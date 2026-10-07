"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { Clock3, FileWarning, UserRound } from "lucide-react"
import { toast } from "sonner"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { DisciplineLoading, DisciplineMetric, SeverityBadge, StatusBadge, formatDisciplineDate } from "@/components/discipline/discipline-ui"

type Row = Record<string, any>
type Profile = { student: Row; incidents: Row[]; actions: Row[]; summary: { openIncidents: number; highestSeverity: string } }

export default function StudentDisciplineProfile() {
    const { id } = useParams<{ id: string }>()
    const [data, setData] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const load = useCallback(() => {
        setLoading(true)
        api.get(`/discipline/students/${id}/profile`).then(r => setData(r.data)).catch((e: any) => toast.error(e.response?.data?.error || "Could not load profile")).finally(() => setLoading(false))
    }, [id])
    useEffect(() => load(), [load])
    const computed = useMemo(() => ({
        recent: (data?.incidents || []).filter(x => String(x.reported_at).slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
        pending: (data?.actions || []).filter(x => !["completed", "cancelled"].includes(x.status)).length,
    }), [data])
    if (loading) return <DisciplineLoading label="Loading student discipline profile" />
    if (!data) return <main className="p-8">Student not found.</main>
    return <main className="mx-auto max-w-[1450px] space-y-5 p-4 md:p-8">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div className="flex gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><UserRound /></div><div><p className="text-xs font-bold uppercase text-red-600">Student discipline profile</p><h1 className="text-2xl font-bold">{data.student.name}</h1><p className="text-sm text-slate-500">{data.student.adm_no} - {[data.student.standard, data.student.division].filter(Boolean).join(" - ") || "Not placed"}</p></div></div><Button asChild variant="outline"><Link href={`/admin/disciplinary/new?student=${id}`}>Report incident</Link></Button></header>
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5"><DisciplineMetric label="Open incidents" value={data.summary.openIncidents} icon={FileWarning} tone="red" /><DisciplineMetric label="All incidents" value={data.incidents.length} icon={FileWarning} /><DisciplineMetric label="This month" value={computed.recent} icon={Clock3} tone="amber" /><DisciplineMetric label="Pending actions" value={computed.pending} icon={Clock3} tone="violet" /><div className="rounded-lg border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Highest open severity</p><div className="mt-5"><SeverityBadge severity={data.summary.highestSeverity} /></div></div></section>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,.6fr)]"><section className="overflow-hidden rounded-lg border bg-white"><div className="border-b p-5"><h2 className="font-semibold">Full discipline timeline</h2><p className="text-sm text-slate-500">Incident history and corrective action progress.</p></div><div className="divide-y">{data.incidents.map(x => <Link href={`/admin/disciplinary/incidents/${x.id}`} key={x.id} className="grid gap-3 p-4 hover:bg-slate-50 sm:grid-cols-[1fr_auto_auto]"><div><b>{x.offence_name}</b><p className="text-xs text-slate-500">{x.reference_no} - {x.category_name} - {formatDisciplineDate(x.reported_at, true)}</p></div><SeverityBadge severity={x.severity} /><StatusBadge status={x.status} /></Link>)}{!data.incidents.length && <p className="p-10 text-center text-sm text-slate-500">No discipline incidents recorded.</p>}</div></section><aside className="rounded-lg border bg-white p-5"><h2 className="font-semibold">Severity guide</h2><p className="mt-2 text-sm text-slate-500">Use severity and corrective actions to assess and follow up on each incident.</p><div className="mt-4 flex flex-wrap gap-2">{["minor", "moderate", "major", "critical"].map(severity => <SeverityBadge key={severity} severity={severity} />)}</div></aside></div>
    </main>
}
