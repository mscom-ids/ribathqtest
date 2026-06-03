"use client"

import { useEffect, useMemo, useState } from "react"
import api from "@/lib/api"
import {
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
                const [studentsRes, progressRes] = await Promise.allSettled([
                    api.get("/students", {
                        params: {
                            light: "true",
                            limit: 24,
                            offset: (page - 1) * 24,
                            search: search || undefined,
                            status,
                            sort: "name",
                        },
                    }),
                    api.get("/hifz/progress-summary"),
                ])
                if (cancelled) return
                if (studentsRes.status === "fulfilled" && studentsRes.value.data?.success) {
                    setStudents(studentsRes.value.data.students || [])
                    setTotal(studentsRes.value.data.pagination?.total || studentsRes.value.data.students?.length || 0)
                }
                if (progressRes.status === "fulfilled" && progressRes.value.data?.success) setProgressMap(progressRes.value.data.progressMap || {})
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        const timer = window.setTimeout(() => void loadStudents(), 250)
        return () => { cancelled = true; window.clearTimeout(timer) }
    }, [page, search, status])

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
            <div className="space-y-5">
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <SectionHeader icon={Users} title="Student List" subtitle="Search by name, admission number, or roll number." />
                        <div className="text-sm font-bold text-slate-500">{total} active records</div>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_180px]">
                        <StudentSearchInput value={search} onChange={(value) => { setSearch(value); setPage(1) }} />
                        <select suppressHydrationWarning value={standard} onChange={(e) => setStandard(e.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold">
                            <option value="all">All Classes</option>
                            {standards.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <select suppressHydrationWarning value={batch} onChange={(e) => setBatch(e.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold">
                            <option value="all">All Batches</option>
                            {batches.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <select suppressHydrationWarning value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input suppressHydrationWarning value={mentor} onChange={(e) => setMentor(e.target.value)} placeholder="Filter by mentor" className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold" />
                        </div>
                        <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-400" title="Needs a student attendance summary endpoint">
                            <input suppressHydrationWarning type="checkbox" checked={lowAttendance} onChange={(e) => setLowAttendance(e.target.checked)} disabled />
                            Low Attendance
                        </label>
                        <label className="flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600">
                            <input suppressHydrationWarning type="checkbox" checked={lowHifz} onChange={(e) => setLowHifz(e.target.checked)} />
                            Low Hifz
                        </label>
                    </div>
                </section>

                {loading ? (
                    <LoadingBlock label="Loading students" />
                ) : (
                    <>
                        <div className="grid gap-3 lg:grid-cols-2">
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
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                            <button suppressHydrationWarning disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black disabled:opacity-40">Previous</button>
                            <p className="text-sm font-bold text-slate-500">Page {page}</p>
                            <button suppressHydrationWarning disabled={page * 24 >= total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black disabled:opacity-40">Next</button>
                        </div>
                    </>
                )}
            </div>
        </PrincipalFrame>
    )
}
