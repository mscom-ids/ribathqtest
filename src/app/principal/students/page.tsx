"use client"

import { useEffect, useMemo, useState } from "react"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import {
    EmptyState,
    LoadingBlock,
    PrincipalFrame,
    SectionHeader,
    Student,
    StudentCard,
    StudentSearchInput,
    useFavorites,
    usePrincipalRange,
} from "../_components/principal-ui"
import { Filter, Users } from "lucide-react"

type ProgressMap = Record<string, number>

export default function PrincipalStudentsPage() {
    const range = usePrincipalRange()
    const { favorites, toggleFavorite } = useFavorites()
    const [students, setStudents] = useState<Student[]>([])
    const [progressMap, setProgressMap] = useState<ProgressMap>({})
    const [search, setSearch] = useState("")
    const [standard, setStandard] = useState("all")
    const [batch, setBatch] = useState("all")
    const [status, setStatus] = useState("active")
    const [mentor, setMentor] = useState("")
    const [lowAttendance, setLowAttendance] = useState(false)
    const [lowHifz, setLowHifz] = useState(false)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        async function loadStudents() {
            setLoading(true)
            try {
                const studentsRes = await api.get("/students", {
                    params: {
                        light: "true",
                        limit: 24,
                        offset: (page - 1) * 24,
                        search: search || undefined,
                        status,
                        sort: "name",
                    },
                })
                if (cancelled) return
                if (studentsRes.data?.success) {
                    setStudents(studentsRes.data.students || [])
                    setTotal(studentsRes.data.pagination?.total || studentsRes.data.students?.length || 0)
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        const timer = window.setTimeout(() => void loadStudents(), 250)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [page, search, status])

    useEffect(() => {
        let cancelled = false
        async function loadProgress() {
            try {
                const res = await cachedGet("/hifz/progress-summary", undefined, 60_000)
                if (!cancelled && res.data?.success) setProgressMap(res.data.progressMap || {})
            } catch {}
        }
        void loadProgress()
        return () => { cancelled = true }
    }, [])

    const standards = useMemo(() => Array.from(new Set(students.map((s) => s.standard).filter(Boolean))).sort() as string[], [students])
    const batches = useMemo(() => Array.from(new Set(students.map((s) => s.batch_year).filter(Boolean))).sort() as string[], [students])

    const visibleStudents = useMemo(() => {
        const mentorQuery = mentor.trim().toLowerCase()
        return students.filter((student) => {
            const hifzProgress = progressMap[student.adm_no] ?? 0
            if (standard !== "all" && student.standard !== standard) return false
            if (batch !== "all" && student.batch_year !== batch) return false
            if (lowHifz && hifzProgress >= 35) return false
            if (lowAttendance) return false
            if (mentorQuery) {
                const values = [student.hifz_mentor, student.school_mentor, student.madrasa_mentor].map((value) => typeof value === "string" ? value : value?.name || "").join(" ").toLowerCase()
                if (!values.includes(mentorQuery)) return false
            }
            return true
        })
    }, [batch, lowAttendance, lowHifz, mentor, progressMap, standard, students])

    return (
        <PrincipalFrame title="Students" subtitle="Find active students quickly and open their report profile." range={range}>
            <div className="space-y-6">
                {/* Search & Filter Toolbar */}
                <section className="space-y-4 rounded-2xl border border-slate-200/60 bg-white/90 p-5 shadow-sm backdrop-blur-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <SectionHeader icon={Users} title="Student Registry" subtitle="Search and filter student records." />
                        <div className="w-fit rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-600 ring-1 ring-teal-100">{total} records</div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <StudentSearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} />

                        <select suppressHydrationWarning value={standard} onChange={(e) => setStandard(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100">
                            <option value="all">All Classes</option>
                            {standards.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>

                        <select suppressHydrationWarning value={batch} onChange={(e) => setBatch(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100">
                            <option value="all">All Batches</option>
                            {batches.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>

                        <select suppressHydrationWarning value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input suppressHydrationWarning value={mentor} onChange={(e) => setMentor(e.target.value)} placeholder="Filter by mentor name" className="h-10 w-full rounded-lg border border-slate-200/80 bg-white pl-10 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100" />
                        </div>

                        <label className="flex h-10 cursor-not-allowed select-none items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-3 text-xs text-slate-400" title="Student attendance summary aggregate query pending">
                            <input suppressHydrationWarning type="checkbox" checked={lowAttendance} onChange={(e) => setLowAttendance(e.target.checked)} disabled className="rounded" />
                            Low Attendance
                        </label>

                        <label className="flex h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-3 text-xs text-slate-600 hover:bg-slate-50">
                            <input suppressHydrationWarning type="checkbox" checked={lowHifz} onChange={(e) => setLowHifz(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                            Low Hifz (&lt;35%)
                        </label>
                    </div>
                </section>

                {loading ? (
                    <LoadingBlock label="Loading student records" />
                ) : (
                    <>
                        {visibleStudents.length === 0 ? (
                            <EmptyState title="No students found" subtitle="No students matched your active filter configuration. Try broadening your query terms." />
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {visibleStudents.map((student) => (
                                    <StudentCard
                                        key={student.adm_no}
                                        student={student}
                                        progress={progressMap[student.adm_no]}
                                        favorite={favorites.includes(student.adm_no)}
                                        onToggleFavorite={() => toggleFavorite(student.adm_no)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Pagination control */}
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-white/90 p-3 shadow-sm">
                            <button
                                suppressHydrationWarning
                                disabled={page === 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                className="rounded-lg border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <p className="text-xs text-slate-500">Page {page}</p>
                            <button
                                suppressHydrationWarning
                                disabled={page * 24 >= total}
                                onClick={() => setPage((p) => p + 1)}
                                className="rounded-lg border border-slate-200/80 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </PrincipalFrame>
    )
}
