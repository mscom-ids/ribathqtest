"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import api from "@/lib/api"
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

    useEffect(() => {
        let cancelled = false
        async function loadDashboard() {
            setLoading(true)
            try {
                const [studentsRes, outsideRes, mentorRes, progressRes] = await Promise.allSettled([
                    api.get("/students", { params: { light: "true", status: "active", limit: 250, offset: 0, sort: "name" } }),
                    api.get("/leaves/outside-students"),
                    api.get("/reports/mentors", { params: { start_date: range.startDate, end_date: range.endDate } }),
                    api.get("/hifz/progress-summary"),
                ])
                if (cancelled) return
                if (studentsRes.status === "fulfilled" && studentsRes.value.data?.success) setStudents(studentsRes.value.data.students || [])
                if (outsideRes.status === "fulfilled") setOutsideStudents(outsideRes.value.data?.students || outsideRes.value.data?.data || [])
                if (mentorRes.status === "fulfilled") setMentors(mentorRes.value.data?.data || [])
                if (progressRes.status === "fulfilled" && progressRes.value.data?.success) setProgressMap(progressRes.value.data.progressMap || {})
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadDashboard()
        return () => { cancelled = true }
    }, [range.startDate, range.endDate])

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
                <LoadingBlock label="Loading dashboard" />
            ) : (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.Users} label="Active Students" value={students.length} sub="Alumni excluded" tone="indigo" />
                        <StatCard icon={PrincipalIcons.DoorOpen} label="Outside / On Leave" value={outsideStudents.length} sub="Currently away" tone="amber" />
                        <StatCard icon={PrincipalIcons.TrendingUp} label="Mentor Reporting" value={`${mentorCompletion}%`} sub="Selected period" tone="emerald" />
                        <StatCard icon={PrincipalIcons.BookOpen} label="Hifz Activity" value={`${avgHifz}%`} sub="Average progress" tone="sky" />
                    </div>

                    <QuickActions />

                    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
                        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <SectionHeader icon={PrincipalIcons.AlertTriangle} title="Students Requiring Attention" subtitle="Low Hifz activity, active outside status, or risk indicators." />
                            {requiringAttention.length ? (
                                <div className="divide-y divide-slate-100">
                                    {requiringAttention.map((student) => (
                                        <Link key={student.adm_no} href={`/principal/students/${student.adm_no}`} className="flex items-center justify-between gap-3 py-3">
                                            <div>
                                                <p className="font-black">{student.name}</p>
                                                <p className="text-xs font-semibold text-slate-500">{student.adm_no} - {student.standard || "Class not set"}</p>
                                            </div>
                                            <AttentionBadge>{progressMap[student.adm_no] ?? 0}% Hifz</AttentionBadge>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState title="No urgent student flags" subtitle="Risk cards will appear here when thresholds are crossed." />
                            )}
                        </section>

                        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <SectionHeader icon={PrincipalIcons.BarChart3} title="Institution Snapshot" subtitle="Fast leadership signals for this period." />
                            <Snapshot label="Best Reporting Mentor" value={mentorStats.best?.name || "-"} sub={`${mentorStats.best?.attendance?.marking_percentage || 0}% completion`} />
                            <Snapshot label="Lowest Reporting Mentor" value={mentorStats.lowest?.name || "-"} sub={`${mentorStats.lowest?.attendance?.marking_percentage || 0}% completion`} />
                            <Snapshot label="Students Currently At Risk" value={requiringAttention.length} sub="Based on available alerts" />
                        </section>
                    </div>

                    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.UserRound} title="Starred Students" subtitle="Bookmarked students for quick review." />
                        {starred.length ? (
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {starred.map((student) => (
                                    <Link key={student.adm_no} href={`/principal/students/${student.adm_no}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                        <p className="font-black">{student.name}</p>
                                        <p className="text-xs font-semibold text-slate-500">{student.adm_no} - {student.standard || "Class not set"}</p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <EmptyState title="No starred students yet" subtitle="Use the star on student cards to keep important students close." />
                        )}
                    </section>
                </div>
            )}
        </PrincipalFrame>
    )
}

function Snapshot({ label, value, sub }: { label: string; value: string | number; sub: string }) {
    return (
        <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 font-black text-slate-900">{value}</p>
            <p className="text-xs font-semibold text-slate-500">{sub}</p>
        </div>
    )
}
