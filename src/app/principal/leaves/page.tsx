"use client"

import { useEffect, useMemo, useState } from "react"
import api from "@/lib/api"
import {
    EmptyState,
    formatDate,
    LeaveRecord,
    LoadingBlock,
    OutsideStudent,
    PrincipalFrame,
    PrincipalIcons,
    SectionHeader,
    StatCard,
    StudentSearchInput,
    usePrincipalRange,
} from "../_components/principal-ui"
import { Plus } from "lucide-react"

export default function PrincipalLeavesPage() {
    const range = usePrincipalRange()
    const [outsideStudents, setOutsideStudents] = useState<OutsideStudent[]>([])
    const [activeLeaves, setActiveLeaves] = useState<LeaveRecord[]>([])
    const [history, setHistory] = useState<LeaveRecord[]>([])
    const [query, setQuery] = useState("")
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        async function loadLeaves() {
            setLoading(true)
            try {
                const [outsideRes, activeRes, historyRes] = await Promise.allSettled([
                    api.get("/leaves/outside-students"),
                    api.get("/leaves/active"),
                    api.get("/leaves"),
                ])
                if (cancelled) return
                if (outsideRes.status === "fulfilled") setOutsideStudents(outsideRes.value.data?.students || outsideRes.value.data?.data || [])
                if (activeRes.status === "fulfilled") setActiveLeaves(activeRes.value.data?.leaves || activeRes.value.data?.data || [])
                if (historyRes.status === "fulfilled") setHistory(historyRes.value.data?.leaves || historyRes.value.data?.data || [])
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadLeaves()
        return () => { cancelled = true }
    }, [range.startDate, range.endDate])

    const visibleOutside = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return outsideStudents
        return outsideStudents.filter((item) => [item.name, item.student_name, item.adm_no, item.student_id, item.standard].filter(Boolean).join(" ").toLowerCase().includes(q))
    }, [outsideStudents, query])

    return (
        <PrincipalFrame title="Leaves" subtitle="Institution leave visibility and principal leave actions." range={range}>
            {loading ? (
                <LoadingBlock label="Loading leaves" />
            ) : (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.DoorOpen} label="Currently Outside" value={outsideStudents.length} sub="Students outside campus" tone="amber" />
                        <StatCard icon={PrincipalIcons.CalendarDays} label="Active Leaves" value={activeLeaves.length} sub="Ongoing records" tone="indigo" />
                        <StatCard icon={PrincipalIcons.Users} label="Leave History" value={history.length} sub="Institution-wide records" tone="sky" />
                        <StatCard icon={PrincipalIcons.AlertTriangle} label="Needs Review" value={history.filter((item) => item.status === "pending").length} sub="Pending requests" tone="rose" />
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <SectionHeader icon={PrincipalIcons.DoorOpen} title="Principal Leave Application" subtitle="Start a principal leave request without entering admin modules." />
                            <button suppressHydrationWarning className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white">
                                <Plus className="h-4 w-4" />
                                Apply Leave
                            </button>
                        </div>
                    </section>

                    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.DoorOpen} title="Currently Outside" subtitle="Students currently outside campus." />
                        <StudentSearchInput value={query} onChange={setQuery} placeholder="Search outside students" />
                        {visibleOutside.length ? (
                            <div className="divide-y divide-slate-100">
                                {visibleOutside.map((item, index) => (
                                    <div key={`${item.adm_no || item.student_id || index}`} className="grid gap-1 py-3 md:grid-cols-4 md:items-center">
                                        <p className="font-black">{item.name || item.student_name || "-"}</p>
                                        <p className="text-sm font-semibold text-slate-500">{item.adm_no || item.student_id || "-"}</p>
                                        <p className="text-sm font-semibold text-slate-500">{item.leave_type || item.reason_category || "Leave"}</p>
                                        <p className="text-sm font-black text-slate-700">{formatDate(item.end_datetime)}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState title="No outside students" subtitle="Current outside students will appear here." />
                        )}
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.CalendarDays} title="Active Leaves" subtitle="All ongoing leave records visible to the principal." />
                        <LeaveRows rows={activeLeaves} />
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.BarChart3} title="Leave History" subtitle="Institution-wide leave history." />
                        <LeaveRows rows={history.slice(0, 30)} />
                    </section>
                </div>
            )}
        </PrincipalFrame>
    )
}

function LeaveRows({ rows }: { rows: LeaveRecord[] }) {
    if (!rows.length) return <EmptyState title="No leave records" subtitle="Records will appear here when available." />
    return (
        <div className="mt-4 divide-y divide-slate-100">
            {rows.map((row) => (
                <div key={row.id} className="grid gap-1 py-3 md:grid-cols-5 md:items-center">
                    <p className="font-black">{row.student?.name || row.student?.adm_no || "Student"}</p>
                    <p className="text-sm font-semibold text-slate-500">{row.leave_type || "Leave"}</p>
                    <p className="text-sm font-semibold text-slate-500">{row.reason_category || row.remarks || "-"}</p>
                    <p className="text-sm font-semibold text-slate-500">{formatDate(row.start_datetime)} - {formatDate(row.end_datetime)}</p>
                    <p className="text-sm font-black capitalize text-slate-700">{row.status || "-"}</p>
                </div>
            ))}
        </div>
    )
}
