"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { cachedGet } from "@/lib/api-cache"
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
                    cachedGet("/students", { light: "true", status: "active", limit: 500, offset: 0, sort: "name", count: "false" }, 60_000),
                    cachedGet("/hifz/progress-summary", undefined, 60_000),
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
                const res = await cachedGet("/reports/mentors", {
                        start_date: range.startDate,
                        end_date: range.endDate,
                        filter: "active",
                        sort: "lowest_percentage",
                        limit: 50,
                        offset: 0,
                    }, 60_000)
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
                <LoadingBlock label="Loading reports dashboards" />
            ) : (
                <div className="space-y-6">
                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard icon={PrincipalIcons.Users} label="Classes Covered" value={classRows.length} sub="Active classes with placement lists" />
                        <StatCard icon={PrincipalIcons.BookOpen} label="Top Hifz Class" value={bestClass?.label || "-"} sub={`${bestClass?.hifzAvg || 0}% avg progress`} tone="emerald" />
                        <StatCard icon={PrincipalIcons.AlertTriangle} label="Lowest Hifz Class" value={weakClass?.label || "-"} sub={`${weakClass?.hifzAvg || 0}% avg progress`} tone="rose" />
                        <StatCard icon={PrincipalIcons.BarChart3} label="Mentor Reporting" value={`${mentorAvg}%`} sub="Completion rate across active staff" tone="sky" />
                    </div>

                    {/* Class Metrics Table */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.TrendingUp} title="Cohort Analysis" subtitle="Standard-wise student distribution and average Quran memorization progress." />
                        
                        <div className="overflow-x-auto border border-slate-100 rounded-xl">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                        <th className="px-5 py-4">Standard / Class</th>
                                        <th className="px-5 py-4 text-center">Student Count</th>
                                        <th className="px-5 py-4">Hifz Average Progress</th>
                                        <th className="px-5 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                    {classRows.map((row) => (
                                        <tr key={row.label} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-4 font-black text-slate-800">{row.label}</td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">{row.students} students</span>
                                            </td>
                                            <td className="px-5 py-4 min-w-[200px]">
                                                <div className="flex items-center gap-3">
                                                    <span className="w-9 font-black text-slate-800">{row.hifzAvg}%</span>
                                                    <div className="flex-1 h-2 bg-slate-150 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${row.hifzAvg < 35 ? "bg-rose-500" : row.hifzAvg < 75 ? "bg-teal-500" : "bg-emerald-500"}`} style={{ width: `${row.hifzAvg}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Link href={`/principal/students?standard=${row.label}`} className="text-[10px] font-black uppercase text-teal-600 hover:text-teal-800 tracking-wider">View Registry →</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Hifz Trend graph */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.BookOpen} title="Hifz Progression Index" subtitle="Comparative analysis of average Hifz progression by class." />
                        <TrendChart data={classRows.map((row) => ({ label: row.label, value: row.hifzAvg }))} />
                    </section>

                    {/* Exams placeholder card */}
                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.GraduationCap} title="Academic Assessment Overview" subtitle="Consolidated exam trends and subject analysis aggregates." />
                        <EmptyState title="Exam statistics pending aggregate query" subtitle="Individual student mark transcripts are available in the respective student profile views. Class ranking aggregates will be available in future releases." />
                    </section>

                    {/* Mentor Performance Leaderboard Table */}
                    <section ref={mentorSectionRef} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                        <SectionHeader icon={PrincipalIcons.BarChart3} title="Mentor Reporting Consistency" subtitle="Tracking submission rates and classroom attendance logs per assigned staff member." />
                        
                        {mentorLoading ? (
                            <LoadingBlock label="Loading mentor records" />
                        ) : mentors.length === 0 ? (
                            <EmptyState title="No teaching mentor reports available" subtitle="Leadership and administrative users are omitted from reporting metrics." />
                        ) : (
                            <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                            <th className="px-5 py-4">Mentor Name</th>
                                            <th className="px-5 py-4 text-center">Submission Rate</th>
                                            <th className="px-5 py-4">Submission Ratio</th>
                                            <th className="px-5 py-4 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                        {mentors.map((mentor) => {
                                            const pct = mentor.attendance?.marking_percentage || 0
                                            return (
                                                <tr key={mentor.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-5 py-4 font-black text-slate-800">{mentor.name}</td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider ${pct < 50 ? "bg-rose-50 text-rose-600 border border-rose-100" : pct < 90 ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"}`}>{pct}%</span>
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-500 font-bold">
                                                        {mentor.attendance?.marked_classes || 0} of {mentor.attendance?.required_classes || 0} classes logged
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <span className={`text-[10px] font-black uppercase tracking-wider ${pct >= 90 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-rose-500"}`}>
                                                            {pct >= 90 ? "Excellent" : pct >= 50 ? "Satisfactory" : "Needs Review"}
                                                        </span>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </PrincipalFrame>
    )
}
