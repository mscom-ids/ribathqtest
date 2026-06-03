"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import api from "@/lib/api"
import {
    EmptyState,
    LoadingBlock,
    MentorReport,
    PrincipalFrame,
    PrincipalIcons,
    SectionHeader,
    StatCard,
    Student,
    TrendChart,
    usePrincipalRange,
} from "../_components/principal-ui"

type ProgressMap = Record<string, number>

export default function PrincipalReportsPage() {
    const range = usePrincipalRange()
    const [students, setStudents] = useState<Student[]>([])
    const [progressMap, setProgressMap] = useState<ProgressMap>({})
    const [mentors, setMentors] = useState<MentorReport[]>([])
    const [loading, setLoading] = useState(true)
    const [mentorLoading, setMentorLoading] = useState(false)
    const [shouldLoadMentors, setShouldLoadMentors] = useState(false)
    const mentorSectionRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        let cancelled = false
        async function loadReports() {
            setLoading(true)
            try {
                const [studentsRes, progressRes] = await Promise.allSettled([
                    api.get("/students", { params: { light: "true", status: "active", limit: 500, offset: 0, sort: "name" } }),
                    api.get("/hifz/progress-summary"),
                ])
                if (cancelled) return
                if (studentsRes.status === "fulfilled" && studentsRes.value.data?.success) setStudents(studentsRes.value.data.students || [])
                if (progressRes.status === "fulfilled" && progressRes.value.data?.success) setProgressMap(progressRes.value.data.progressMap || {})
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadReports()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        const node = mentorSectionRef.current
        if (!node || shouldLoadMentors) return
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) setShouldLoadMentors(true)
        }, { rootMargin: "240px" })
        observer.observe(node)
        return () => observer.disconnect()
    }, [shouldLoadMentors])

    useEffect(() => {
        if (!shouldLoadMentors) return
        let cancelled = false
        async function loadMentors() {
            setMentorLoading(true)
            try {
                const res = await api.get("/reports/mentors", {
                    params: {
                        start_date: range.startDate,
                        end_date: range.endDate,
                        filter: "active",
                        sort: "lowest_percentage",
                        limit: 50,
                        offset: 0,
                    },
                })
                if (!cancelled) setMentors(res.data?.data || [])
            } finally {
                if (!cancelled) setMentorLoading(false)
            }
        }
        void loadMentors()
        return () => { cancelled = true }
    }, [range.startDate, range.endDate, shouldLoadMentors])

    const classRows = useMemo(() => {
        const map = new Map<string, { label: string; students: number; hifzTotal: number }>()
        for (const student of students) {
            const label = student.standard || "Unassigned"
            const item = map.get(label) || { label, students: 0, hifzTotal: 0 }
            item.students += 1
            item.hifzTotal += progressMap[student.adm_no] || 0
            map.set(label, item)
        }
        return Array.from(map.values()).map((item) => ({ ...item, hifzAvg: item.students ? Math.round(item.hifzTotal / item.students) : 0 }))
    }, [progressMap, students])

    const mentorAvg = mentors.length ? Math.round(mentors.reduce((sum, mentor) => sum + (mentor.attendance?.marking_percentage || 0), 0) / mentors.length) : 0
    const bestClass = [...classRows].sort((a, b) => b.hifzAvg - a.hifzAvg)[0]
    const weakClass = [...classRows].sort((a, b) => a.hifzAvg - b.hifzAvg)[0]

    return (
        <PrincipalFrame title="Reports" subtitle="Institution-wide attendance, Hifz, exam, and mentor reporting." range={range}>
            {loading ? (
                <LoadingBlock label="Loading reports" />
            ) : (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.Users} label="Classes Covered" value={classRows.length} sub="Active students only" />
                        <StatCard icon={PrincipalIcons.BookOpen} label="Top Hifz Class" value={bestClass?.label || "-"} sub={`${bestClass?.hifzAvg || 0}% average`} tone="emerald" />
                        <StatCard icon={PrincipalIcons.AlertTriangle} label="Lowest Hifz Class" value={weakClass?.label || "-"} sub={`${weakClass?.hifzAvg || 0}% average`} tone="rose" />
                        <StatCard icon={PrincipalIcons.BarChart3} label="Mentor Reporting" value={`${mentorAvg}%`} sub="Completion average" tone="sky" />
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.TrendingUp} title="Attendance Reports" subtitle="Class-wise and batch-wise attendance will use dedicated attendance endpoints when available." />
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {classRows.map((row) => (
                                <ReportRow key={row.label} title={row.label} value={`${row.students} students`} sub="Class-wise active count" />
                            ))}
                        </div>
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.BookOpen} title="Hifz Reports" subtitle="Class-wise progress and top performer signals." />
                        <TrendChart data={classRows.map((row) => ({ label: row.label, value: row.hifzAvg }))} />
                    </section>

                    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.GraduationCap} title="Exam Reports" subtitle="Exam trends and subject analysis area." />
                        <EmptyState title="Exam report endpoint pending" subtitle="Student exam details are available in each student profile. Class ranking needs a dedicated aggregate API." />
                    </section>

                    <section ref={mentorSectionRef} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <SectionHeader icon={PrincipalIcons.BarChart3} title="Mentor Reports" subtitle="Reporting completion rate and attendance recording consistency." />
                        {mentorLoading ? (
                            <div className="mt-4">
                                <LoadingBlock label="Loading mentor reports" />
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {mentors.length === 0 && shouldLoadMentors ? (
                                <EmptyState title="No teaching mentor reports" subtitle="Leadership and administrative users are excluded from mentor performance." />
                            ) : mentors.map((mentor) => (
                                <ReportRow
                                    key={mentor.id}
                                    title={mentor.name}
                                    value={`${mentor.attendance?.marking_percentage || 0}%`}
                                    sub={`${mentor.attendance?.marked_classes || 0}/${mentor.attendance?.required_classes || 0} classes marked`}
                                />
                            ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </PrincipalFrame>
    )
}

function ReportRow({ title, value, sub }: { title: string; value: string; sub: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="font-black">{title}</p>
            <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
            <p className="text-xs font-semibold text-slate-500">{sub}</p>
        </div>
    )
}
