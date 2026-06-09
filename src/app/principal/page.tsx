"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { cachedGet } from "@/lib/api-cache"
import {
    AttentionBadge,
    EmptyState,
    LoadingBlock,
    MentorReport,
    OutsideStudent,
    PrincipalFrame,
    PrincipalIcons,
    QuickActions,
    SectionHeader,
    StatCard,
    Student,
    useFavorites,
    usePrincipalRange,
} from "./_components/principal-ui"

type ProgressMap = Record<string, number>

export default function PrincipalDashboardPage() {
    const range = usePrincipalRange()
    const { favorites } = useFavorites()
    const [students, setStudents] = useState<Student[]>([])
    const [progressMap, setProgressMap] = useState<ProgressMap>({})
    const [outsideStudents, setOutsideStudents] = useState<OutsideStudent[]>([])
    const [mentors, setMentors] = useState<MentorReport[]>([])
    const [loading, setLoading] = useState(true)
    const [mentorLoading, setMentorLoading] = useState(false)

    useEffect(() => {
        let cancelled = false
        async function loadDashboard() {
            setLoading(true)
            try {
                const [studentsRes, outsideRes, progressRes] = await Promise.allSettled([
                    cachedGet("/students", { light: "true", status: "active", limit: 250, offset: 0, sort: "name", count: "false" }, 60_000),
                    cachedGet("/leaves/outside-students", undefined, 15_000),
                    cachedGet("/hifz/progress-summary", undefined, 60_000),
                ])
                if (cancelled) return
                if (studentsRes.status === "fulfilled" && studentsRes.value.data?.success) setStudents(studentsRes.value.data.students || [])
                if (outsideRes.status === "fulfilled") setOutsideStudents(outsideRes.value.data?.students || outsideRes.value.data?.data || [])
                if (progressRes.status === "fulfilled" && progressRes.value.data?.success) setProgressMap(progressRes.value.data.progressMap || {})
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadDashboard()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        let cancelled = false
        let timeoutId: number | null = null
        async function loadMentorSummary() {
            setMentorLoading(true)
            try {
                const res = await cachedGet("/reports/mentors", {
                    start_date: range.startDate,
                    end_date: range.endDate,
                    limit: 100,
                    sort: "lowest_percentage",
                }, 60_000)
                if (!cancelled) setMentors(res.data?.data || [])
            } finally {
                if (!cancelled) setMentorLoading(false)
            }
        }
        timeoutId = window.setTimeout(() => {
            if (!cancelled) void loadMentorSummary()
        }, loading ? 1_500 : 300)
        return () => {
            cancelled = true
            if (timeoutId) window.clearTimeout(timeoutId)
        }
    }, [loading, range.startDate, range.endDate])

    const mentorStats = useMemo(() => {
        const sorted = [...mentors].sort((a, b) => (b.attendance?.marking_percentage || 0) - (a.attendance?.marking_percentage || 0))
        return { best: sorted[0], lowest: sorted[sorted.length - 1] }
    }, [mentors])

    const requiringAttention = useMemo(() => {
        return students
            .filter((student) => (progressMap[student.adm_no] ?? 100) < 35 || outsideStudents.some((item) => item.adm_no === student.adm_no || item.student_id === student.adm_no))
            .slice(0, 6)
    }, [outsideStudents, progressMap, students])

    const starred = useMemo(() => students.filter((student) => favorites.includes(student.adm_no)).slice(0, 5), [favorites, students])
    const avgHifz = students.length ? Math.round(students.reduce((sum, s) => sum + (progressMap[s.adm_no] || 0), 0) / students.length) : 0
    const mentorCompletion = mentors.length ? Math.round(mentors.reduce((sum, m) => sum + (m.attendance?.marking_percentage || 0), 0) / mentors.length) : 0

    return (
        <PrincipalFrame title="Dashboard" subtitle="Institution-wide health, attention items, and quick actions." range={range}>
            {loading ? (
                <LoadingBlock label="Loading dashboard data" />
            ) : (
                <div className="space-y-6">
                    {/* Top Stats Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.Users} label="Active Students" value={students.length} sub="Alumni excluded from active index" tone="teal" />
                        <StatCard icon={PrincipalIcons.DoorOpen} label="Outside / On Leave" value={outsideStudents.length} sub="Currently away from campus grounds" tone="amber" />
                        <StatCard icon={PrincipalIcons.TrendingUp} label="Mentor Reporting" value={mentorLoading && mentors.length === 0 ? "..." : `${mentorCompletion}%`} sub="Marking rate over selected range" tone="emerald" />
                        <StatCard icon={PrincipalIcons.BookOpen} label="Hifz Activity" value={`${avgHifz}%`} sub="Average curriculum progression rate" tone="sky" />
                    </div>

                    <QuickActions />

                    {/* Main Responsive Grid Layout */}
                    <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
                        <section className="space-y-4 rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                            <SectionHeader icon={PrincipalIcons.AlertTriangle} title="Students Requiring Attention" subtitle="Low Hifz progress or currently outside campus." />

                            {requiringAttention.length ? (
                                <div className="mt-2 divide-y divide-slate-100/80">
                                    {requiringAttention.map((student) => {
                                        const isOutside = outsideStudents.some((item) => item.adm_no === student.adm_no || item.student_id === student.adm_no)
                                        const studentProgress = progressMap[student.adm_no] ?? 0
                                        return (
                                            <Link
                                                key={student.adm_no}
                                                href={`/principal/students/${student.adm_no}`}
                                                className="group flex items-center justify-between gap-4 rounded-xl py-3 transition-all duration-200 hover:bg-teal-50/40 first:pt-0"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-800 group-hover:text-teal-700">{student.name}</p>
                                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                                        {student.adm_no} · {student.standard || "Unassigned"}
                                                    </p>
                                                </div>

                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    {isOutside && (
                                                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">Outside</span>
                                                    )}
                                                    <AttentionBadge>{studentProgress}% Hifz</AttentionBadge>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="mt-2">
                                    <EmptyState title="No urgent student flags" subtitle="Students needing attention will appear here." />
                                </div>
                            )}
                        </section>

                        <section className="flex flex-col justify-between space-y-4 rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                            <div>
                                <SectionHeader icon={PrincipalIcons.BarChart3} title="Institution Snapshot" subtitle="Fast leadership indicators for oversight review." />
                                <div className="mt-5 space-y-4">
                                    <Snapshot 
                                        label="Best Reporting Mentor" 
                                        value={mentorStats.best?.name || "-"} 
                                        sub={`${mentorStats.best?.attendance?.marked_classes || 0}/${mentorStats.best?.attendance?.required_classes || 0} classes`}
                                        progress={mentorStats.best?.attendance?.marking_percentage || 0}
                                        tone="emerald"
                                    />
                                    <Snapshot 
                                        label="Lowest Reporting Mentor" 
                                        value={mentorStats.lowest?.name || "-"} 
                                        sub={`${mentorStats.lowest?.attendance?.marked_classes || 0}/${mentorStats.lowest?.attendance?.required_classes || 0} classes`}
                                        progress={mentorStats.lowest?.attendance?.marking_percentage || 0}
                                        tone="rose"
                                    />
                                    <Snapshot 
                                        label="Total Students Tracked" 
                                        value={students.length} 
                                        sub="Enrolled and active in madrasa registry"
                                        progress={students.length > 0 ? 100 : 0}
                                        tone="teal"
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    <section className="space-y-4 rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                        <SectionHeader icon={PrincipalIcons.UserRound} title="Starred Students" subtitle="Bookmarked for quick access." />
                        {starred.length ? (
                            <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                {starred.map((student) => (
                                    <Link
                                        key={student.adm_no}
                                        href={`/principal/students/${student.adm_no}`}
                                        className="group flex items-center gap-2.5 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 transition-all duration-200 hover:border-teal-200 hover:bg-white hover:shadow-sm"
                                    >
                                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-[10px] font-semibold text-white shadow-sm">{student.name.slice(0, 2)}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium text-slate-800">{student.name}</p>
                                            <p className="mt-0.5 truncate text-[10px] text-slate-400">{student.adm_no} · {student.standard || "—"}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-2">
                                <EmptyState title="No starred students yet" subtitle="Click the bookmark star icon on any student profile or card to pin them here." />
                            </div>
                        )}
                    </section>
                </div>
            )}
        </PrincipalFrame>
    )
}

function Snapshot({
    label,
    value,
    sub,
    progress = 0,
    tone = "teal",
}: {
    label: string
    value: string | number
    sub: string
    progress?: number
    tone?: "teal" | "emerald" | "amber" | "rose" | "sky"
}) {
    const barTones = {
        teal: "bg-gradient-to-r from-teal-500 to-cyan-500",
        emerald: "bg-gradient-to-r from-emerald-400 to-emerald-500",
        amber: "bg-gradient-to-r from-amber-400 to-amber-500",
        rose: "bg-gradient-to-r from-rose-400 to-rose-500",
        sky: "bg-gradient-to-r from-sky-400 to-sky-500",
    }
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-colors hover:bg-slate-50">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-400">{label}</p>
                    <p className="mt-1 truncate text-sm font-medium text-slate-800">{value}</p>
                </div>
                <div className="shrink-0 text-right">
                    <span className="text-xs font-medium text-slate-600 tabular-nums">{progress}%</span>
                    <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p>
                </div>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-slate-200/70">
                <div className={`h-full rounded-full transition-all duration-500 ${barTones[tone]}`} style={{ width: `${progress}%` }} />
            </div>
        </div>
    )
}
