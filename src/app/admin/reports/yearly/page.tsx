"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import {
    Search,
    Users,
    GraduationCap,
    BookOpen,
    School,
    RefreshCw,
    ChevronRight,
    AlertCircle,
} from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type AcademicYear = { id: string; name: string; start_date: string; end_date: string; is_current?: boolean }
type ClassGroup = { standard: string; section?: string | null }
type HifzMentor = { mentor_id: string; mentor_name: string; student_count: number }

type StudentRow = {
    adm_no: string
    name: string
    photo_url?: string
    standard?: string
    section?: string
    mentor_name?: string
    admission_date?: string
    effective_start?: string
    effective_end?: string
    present?: number | null
    effective_classes?: number | null
    attendance_pct?: number | null
    hifz_sessions?: number | null
}

const TABS = [
    { key: "school", label: "School", icon: School, color: "blue" },
    { key: "madrasa", label: "Madrasa", icon: BookOpen, color: "emerald" },
    { key: "hifz", label: "Hifz", icon: GraduationCap, color: "violet" },
]

const tabStyle: Record<string, string> = {
    blue:   "text-blue-700 border-blue-600",
    emerald: "text-emerald-700 border-emerald-600",
    violet: "text-violet-700 border-violet-600",
}

const pctColor = (pct: number | null) => {
    if (pct === null || pct === undefined) return "text-slate-400"
    if (pct >= 80) return "text-emerald-600"
    if (pct >= 60) return "text-amber-600"
    return "text-rose-600"
}

export default function YearlyReportPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [activeTab, setActiveTab] = useState("school")
    const [classes, setClasses] = useState<{ school: ClassGroup[]; madrasa: ClassGroup[]; hifz_mentors: HifzMentor[] }>({
        school: [], madrasa: [], hifz_mentors: []
    })
    const [selectedStd, setSelectedStd] = useState("__all")
    const [data, setData] = useState<StudentRow[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")

    // Load academic years
    useEffect(() => {
        api.get("/academic-history/years")
            .then((res) => {
                const rows: AcademicYear[] = res.data?.data || []
                setYears(rows)
                const curr = rows.find((y) => y.is_current) || rows[0]
                if (curr) setYearId(curr.id)
            })
            .catch(() => {})
    }, [])

    // Load available classes whenever year changes
    useEffect(() => {
        if (!yearId) return
        api.get("/yearly-report/classes", { params: { academic_year_id: yearId } })
            .then((res) => {
                setClasses({
                    school: res.data.school || [],
                    madrasa: res.data.madrasa || [],
                    hifz_mentors: res.data.hifz_mentors || [],
                })
            })
            .catch(() => {})
        setSelectedStd("__all")
    }, [yearId])

    const loadData = useCallback(async () => {
        if (!yearId) return
        setLoading(true)
        setError("")
        try {
            const params: Record<string, string> = { academic_year_id: yearId }
            if (selectedStd !== "__all") params.standard = selectedStd
            const res = await api.get(`/yearly-report/class/${activeTab}`, { params })
            setData(res.data?.data || [])
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || "Failed to load report")
            setData([])
        } finally {
            setLoading(false)
        }
    }, [yearId, activeTab, selectedStd])

    useEffect(() => { void loadData() }, [loadData])

    const filtered = useMemo(() =>
        data.filter((s) =>
            s.name?.toLowerCase().includes(search.toLowerCase()) ||
            s.adm_no?.toLowerCase().includes(search.toLowerCase())
        ), [data, search]
    )

    const currentYear = years.find((y) => y.id === yearId)

    // Standards dropdown options for current tab
    const stdOptions = useMemo(() => {
        if (activeTab === "school") return classes.school
        if (activeTab === "madrasa") return classes.madrasa
        return [] // hifz grouped by mentor, not standard
    }, [activeTab, classes])

    return (
        <main className="space-y-5">
            {/* Header */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-blue-600">Reports</p>
                        <h1 className="mt-0.5 text-2xl font-black text-slate-950">Yearly Student Reports</h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                            Attendance, Hifz progress, leave records, and exam results — scoped to each student's enrollment dates.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={yearId} onValueChange={setYearId}>
                            <SelectTrigger className="w-[180px] bg-white">
                                <SelectValue placeholder="Academic year" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map((y) => (
                                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {stdOptions.length > 0 && (
                            <Select value={selectedStd} onValueChange={setSelectedStd}>
                                <SelectTrigger className="w-[160px] bg-white">
                                    <SelectValue placeholder="All classes" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all">All Classes</SelectItem>
                                    {stdOptions.map((c) => (
                                        <SelectItem key={`${c.standard}-${c.section}`} value={c.standard}>
                                            {c.standard}{c.section ? ` (${c.section})` : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </Button>
                    </div>
                </div>
                {currentYear && (
                    <p className="mt-3 text-xs font-semibold text-slate-400">
                        Year window: {currentYear.start_date?.slice(0, 10)} → {currentYear.end_date?.slice(0, 10)}
                    </p>
                )}
            </section>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-slate-200">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    const active = activeTab === tab.key
                    return (
                        <button
                            key={tab.key}
                            onClick={() => { setActiveTab(tab.key); setSelectedStd("__all") }}
                            className={`flex items-center gap-2 px-5 py-3 text-sm font-bold transition-all border-b-2 -mb-px ${
                                active
                                    ? `${tabStyle[tab.color]} bg-white`
                                    : "border-transparent text-slate-500 hover:text-slate-800"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search student name or ID..."
                    className="pl-9"
                />
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            {/* Student table */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-500" />
                        <span className="text-sm font-black text-slate-950">
                            {activeTab === "hifz" ? "Hifz Students" : activeTab === "school" ? "School Students" : "Madrasa Students"}
                        </span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-bold text-slate-600">
                        {filtered.length} students
                    </span>
                </div>

                {loading ? (
                    <div className="py-16 text-center">
                        <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-300 mb-3" />
                        <p className="text-sm font-bold text-slate-400">Loading report data...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center text-sm font-bold text-slate-400">
                        No students found for this class and year.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-slate-100 bg-slate-50/50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">Student</th>
                                    {activeTab !== "hifz" && <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">Class</th>}
                                    {activeTab === "hifz" && <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider text-slate-400">Mentor</th>}
                                    <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-400">Present</th>
                                    <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-400">Total</th>
                                    <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-400">Attendance %</th>
                                    {activeTab === "hifz" && <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-400">Hifz Sessions</th>}
                                    <th className="px-5 py-3 text-right text-[11px] font-black uppercase tracking-wider text-slate-400">Full Report</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map((student) => (
                                    <tr key={student.adm_no} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div>
                                                <p className="text-sm font-black text-slate-950">{student.name}</p>
                                                <p className="text-xs font-semibold text-slate-400">{student.adm_no}</p>
                                                {student.effective_start && (
                                                    <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                                                        {student.effective_start} → {student.effective_end}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        {activeTab !== "hifz" && (
                                            <td className="px-4 py-3.5 text-sm font-bold text-slate-700">
                                                {student.standard || "—"}{student.section ? ` (${student.section})` : ""}
                                            </td>
                                        )}
                                        {activeTab === "hifz" && (
                                            <td className="px-4 py-3.5 text-sm font-bold text-slate-700">
                                                {student.mentor_name || "—"}
                                            </td>
                                        )}
                                        <td className="px-4 py-3.5 text-center text-sm font-black text-slate-900">
                                            {student.present ?? "—"}
                                        </td>
                                        <td className="px-4 py-3.5 text-center text-sm font-bold text-slate-500">
                                            {student.effective_classes ?? "—"}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {student.attendance_pct !== null && student.attendance_pct !== undefined ? (
                                                <span className={`text-sm font-black ${pctColor(student.attendance_pct)}`}>
                                                    {student.attendance_pct}%
                                                </span>
                                            ) : (
                                                <span className="text-sm text-slate-300">—</span>
                                            )}
                                        </td>
                                        {activeTab === "hifz" && (
                                            <td className="px-4 py-3.5 text-center text-sm font-bold text-violet-700">
                                                {student.hifz_sessions ?? "—"}
                                            </td>
                                        )}
                                        <td className="px-5 py-3.5 text-right">
                                            <Link
                                                href={`/admin/reports/yearly/${student.adm_no}?academic_year_id=${yearId}`}
                                                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                                            >
                                                View <ChevronRight className="h-3 w-3" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    )
}
