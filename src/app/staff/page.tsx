"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, getDay } from "date-fns"
import {
    BookOpen, ChevronRight, Clock, CalendarDays,
    TrendingUp, Award, Search, Camera, Loader2, BarChart2,
    CheckCircle2, ClipboardCheck, DoorOpen, UserPlus,
    type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import { AssignStudentsModal } from "@/components/staff/AssignStudentsModal"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type Student = {
    adm_no: string
    name: string
    photo_url: string | null
    batch_year: string
    standard: string
    dob: string
    assigned_usthad: { name: string } | null
    is_outside?: boolean
    is_delegated?: boolean
    delegated_to?: string | null
    active_leave?: {
        leave_type: string
        reason: string
        end_datetime: string
    } | null
    today_stats?: {
        hifz: number
        revision: number
        juz: number
        attendance: string
        session_marks?: { schedule_id: string; status: string }[]
    }
    last_hifz?: {
        surah_name?: string
        start_v?: number
        end_v?: number
        start_page?: number
        end_page?: number
    } | null
}

type AllStudent = {
    adm_no: string
    name: string
    standard: string | null
    status: string
}

type Session = {
    id: string
    name: string
    class_type: string
    start_time: string | null
    end_time: string | null
    day_of_week: number
    effective_from: string
    effective_until: string | null
    is_deleted: boolean
}

type MonthlyTopPerformer = {
    adm_no: string
    name: string
    standard: string
    totalPoints: number
}

type MonthlyReportRow = {
    adm_no: string
    totalPoints?: number | string | null
    total_points?: number | string | null
    points?: number | string | null
    percentage?: number | string | null
}

// ─── Helper: greeting ─────────────────────────────────────────────────────────
function getGreeting(h: number) {
    if (h < 12) return "Good Morning"
    if (h < 17) return "Good Afternoon"
    return "Good Evening"
}

// ─── Helper: build ranked top performers from a monthly-report payload ─────────
// Maps each assigned student to their monthly points, drops students with no
// report row, and sorts by points desc (name as tie-breaker).
function buildPerformers(
    reports: MonthlyReportRow[],
    students: { adm_no: string; name: string; standard: string }[]
): MonthlyTopPerformer[] {
    const reportByAdmNo = new Map<string, MonthlyReportRow>(reports.map((r) => [r.adm_no, r]))
    return students
        .map((student) => {
            const report = reportByAdmNo.get(student.adm_no)
            const rawPoints = report?.totalPoints ?? report?.total_points ?? report?.points
            const rawPercentage = report?.percentage
            const percentage = Number(rawPercentage)
            const legacyPoints = Number(rawPoints)
            if (!report) return null

            // Juz Revision can now be non-applicable or pro-rated, so students
            // have different raw maximums. Rank and display everyone on the
            // same 70-point scale using their calculated percentage.
            const totalPoints = rawPercentage !== undefined
                && rawPercentage !== null
                && Number.isFinite(percentage)
                ? Math.round((percentage * 0.7 + Number.EPSILON) * 100) / 100
                : legacyPoints
            if (!Number.isFinite(totalPoints)) return null
            return {
                adm_no: student.adm_no,
                name: student.name,
                standard: student.standard,
                totalPoints,
            }
        })
        .filter((p): p is MonthlyTopPerformer => p !== null)
        .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))
}

// ─── Helper: months from Jun 2026 up to anchor month ─────────────────────────
function buildMonthOptions(anchor: Date): { value: string; label: string }[] {
    const opts: { value: string; label: string }[] = []
    const start = new Date(2026, 5, 1) // June 2026
    const cur = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    for (let d = new Date(cur); d >= start; d.setMonth(d.getMonth() - 1)) {
        opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") })
    }
    return opts
}

// ─── Helper: compact stat tile (icon + number + progress bar) ────────────────
const STAT_COLORS = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
} as const

function StatTile({
    icon: Icon, color, label, value, sub, pct,
}: {
    icon: LucideIcon
    color: keyof typeof STAT_COLORS
    label: string
    value: string
    sub: string
    pct: number
}) {
    const c = STAT_COLORS[color]
    return (
        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${c.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${c.text}`} />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-1.5 truncate">{sub}</p>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-2.5 overflow-hidden">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
        </div>
    )
}

// ─── Helper: small "live" bar-chart icon (bars pulse at staggered delays) —
// used on the floating trigger that opens Top Performers on mobile. ─────────
function LiveBarsIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <style>{`
                @keyframes mpLiveBar { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
            `}</style>
            <rect x="2" y="8" width="3.5" height="10" rx="1" className="fill-current" style={{ transformOrigin: "bottom", transformBox: "fill-box", animation: "mpLiveBar 1s ease-in-out infinite" }} />
            <rect x="8.25" y="2" width="3.5" height="16" rx="1" className="fill-current" style={{ transformOrigin: "bottom", transformBox: "fill-box", animation: "mpLiveBar 1s ease-in-out infinite 0.15s" }} />
            <rect x="14.5" y="11" width="3.5" height="7" rx="1" className="fill-current" style={{ transformOrigin: "bottom", transformBox: "fill-box", animation: "mpLiveBar 1s ease-in-out infinite 0.3s" }} />
        </svg>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StaffDashboard() {
    const [staffName, setStaffName] = useState("")
    const [staffId, setStaffId] = useState("")
    const [staffPhoto, setStaffPhoto] = useState("")
    const [myStudents, setMyStudents] = useState<Student[]>([])
    const [allStudents, setAllStudents] = useState<AllStudent[]>([])
    const [allStudentsLoaded, setAllStudentsLoaded] = useState(false)
    const [sessions, setSessions] = useState<Session[]>([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [topPerformersLoading, setTopPerformersLoading] = useState(false)
    const [topPerformersError, setTopPerformersError] = useState<string | null>(null)
    const [currentTime, setCurrentTime] = useState<Date | null>(null)
    // "my" = assigned only, "all" = every active student
    const [studentMode, setStudentMode] = useState<"my" | "all">("my")
    const [mounted, setMounted] = useState(false)
    const router = useRouter()

    // Chart modal
    type ChartStudent = { adm_no: string; name: string; standard: string | null; photo_url?: string | null }
    const [chartStudent, setChartStudent] = useState<ChartStudent | null>(null)

    // Only compute date on client to avoid hydration mismatch
    const [todayStr, setTodayStr] = useState("")
    const [todayLabel, setTodayLabel] = useState("")
    const [monthlyTopPerformers, setMonthlyTopPerformers] = useState<MonthlyTopPerformer[]>([])
    // Top Performers month picker. "" until the client date resolves, then the
    // current month. Selecting the current month reuses `dashboardReports` (no
    // extra request); any other month hits the cached /calculate endpoint.
    const [selectedMonth, setSelectedMonth] = useState("")
    const [dashboardReports, setDashboardReports] = useState<MonthlyReportRow[]>([])

    // Refresh trigger to update points/stats
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    // The register can contain several cell edits. Refresh the expensive staff
    // dashboard once when the register closes instead of after every cell save.
    const hifzRegisterDirtyRef = useRef(false)

    useEffect(() => {
        setMounted(true)
        const now = new Date()
        setCurrentTime(now)
        setTodayStr(format(now, "yyyy-MM-dd"))
        setTodayLabel(format(now, "EEEE, MMMM d, yyyy"))
        setSelectedMonth(format(now, "yyyy-MM"))
    }, [])

    // Clock tick
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000)
        return () => clearInterval(timer)
    }, [])

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !staffId) return
        try {
            const formData = new FormData()
            formData.append("avatar", file)
            const uploadRes = await api.post("/upload/avatar", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            })
            if (uploadRes.data.success && uploadRes.data.filePath) {
                const newUrl = uploadRes.data.filePath
                setStaffPhoto(newUrl)
                await api.put(`/staff/${staffId}`, { photo_url: newUrl })
                invalidateCache('/dashboard/staff')
                invalidateCache('/staff/me')
                window.location.reload()
            }
        } catch (error) {
            console.error("Failed to upload photo:", error)
        }
    }

    // Load aggregated staff dashboard summary (profile, assigned students, sessions, top performers).
    useEffect(() => {
        if (!todayStr) return
        async function load() {
            setLoading(true)
            setTopPerformersLoading(true)
            setTopPerformersError(null)
            try {
                const res = await cachedGet("/dashboard/staff", { date: todayStr }, 30_000)

                if (!res.data.success) {
                    setLoading(false)
                    router.push("/login")
                    return
                }

                const summary = res.data.summary
                const profile = summary.profile || {}
                setStaffName(profile.name || "")
                setStaffId(profile.id || "")
                setStaffPhoto(profile.photo_url || "")

                const students = summary.students || []
                setMyStudents(students)

                const rawSchedules = summary.schedules || []
                setSessions(rawSchedules.map((s: any) => ({
                    ...s,
                    name: s.name || `${s.class_type} Class`,
                })))

                // Current-month reports arrive with the dashboard payload — stash
                // them so the Top Performers month effect can build the ranking
                // without a second request when the current month is selected.
                const reports = Array.isArray(summary.monthly_report) ? summary.monthly_report : []
                setDashboardReports(reports)

            } catch (err: any) {
                console.warn("[STAFF PAGE] Load error:", err)
                setDashboardReports([])
                if (err?.response?.status === 401) router.push("/login")
            }
            setLoading(false)
        }
        load()
    }, [router, todayStr, refreshTrigger])

    // ─── Top Performers: build ranking for the selected month ──────────────────
    // Current month → reuse dashboardReports (already fetched). Other months →
    // fetch the backend's result-cached /calculate endpoint for this mentor.
    useEffect(() => {
        if (!selectedMonth || !staffId) return
        const currentMonth = todayStr.slice(0, 7)
        const students = myStudents.map((s) => ({ adm_no: s.adm_no, name: s.name, standard: s.standard }))

        if (selectedMonth === currentMonth) {
            setMonthlyTopPerformers(buildPerformers(dashboardReports, students))
            setTopPerformersLoading(false)
            setTopPerformersError(null)
            return
        }

        let cancelled = false
        setTopPerformersLoading(true)
        setTopPerformersError(null)
        cachedGet("/hifz/monthly-reports/calculate", { month: selectedMonth, mentor_id: staffId }, 60_000)
            .then((res) => {
                if (cancelled) return
                const reports: MonthlyReportRow[] = Array.isArray(res.data?.reports) ? res.data.reports : []
                setMonthlyTopPerformers(buildPerformers(reports, students))
            })
            .catch((err) => {
                if (cancelled) return
                console.warn("[STAFF TOP PERFORMERS] month load error:", err)
                setMonthlyTopPerformers([])
                setTopPerformersError("Monthly points could not be calculated")
            })
            .finally(() => {
                if (!cancelled) setTopPerformersLoading(false)
            })
        return () => { cancelled = true }
    }, [selectedMonth, staffId, dashboardReports, myStudents, todayStr])

    // Lazy-load all students when switching to "All Students" mode
    useEffect(() => {
        if (studentMode !== "all" || allStudentsLoaded) return
        async function loadAll() {
            try {
                // scope=all tells the backend to skip the mentor-assignment filter
                const res = await cachedGet("/students", {
                    scope: "all",
                    light: "true",
                    status: "active",
                    limit: 500,
                    count: "false",
                    sort: "name",
                }, 60_000)
                if (res.data.success) setAllStudents(res.data.students || [])
            } catch { /* non-blocking */ }
            setAllStudentsLoaded(true)
        }
        loadAll()
    }, [studentMode, allStudentsLoaded])

    // ── Derived ──────────────────────────────────────────────────
    const todaySessions = useMemo(() => {
        if (myStudents.length === 0) return []
        return [...sessions].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""))
    }, [sessions, myStudents.length])

    // Last 12 months for the Top Performers picker (anchored on today).
    const monthOptions = useMemo(
        () => (todayStr ? buildMonthOptions(new Date(`${todayStr}T00:00:00`)) : []),
        [todayStr]
    )

    const presentCount = myStudents.filter(s => s.today_stats?.attendance === "Present" || s.today_stats?.attendance === "present").length
    const absentCount = myStudents.filter(s => s.today_stats?.attendance === "Absent").length
    const leaveCount = myStudents.filter(s => s.today_stats?.attendance === "Leave" || s.today_stats?.attendance === "Outside").length
    const entryCount = myStudents.filter(s => s.today_stats && (
        s.today_stats.hifz > 0 ||
        s.today_stats.revision > 0 ||
        s.today_stats.juz > 0
    )).length
    const attendancePct = myStudents.length > 0 ? Math.round((presentCount / myStudents.length) * 100) : 0
    const entryPct = myStudents.length > 0 ? Math.round((entryCount / myStudents.length) * 100) : 0
    const outsidePct = myStudents.length > 0 ? Math.round((leaveCount / myStudents.length) * 100) : 0

    // Feature 1: Session-Based Attendance
    const totalRecords = myStudents.length * todaySessions.length
    let totalPresentMarks = 0
    let totalOutsideMarks = 0
    myStudents.forEach(s => {
        if (s.today_stats?.session_marks) {
            s.today_stats.session_marks.forEach((m: any) => {
                if (m.status === 'Present') totalPresentMarks++;
                else if (m.status === 'Leave' || m.status === 'Outside') totalOutsideMarks++;
            });
        }
    })
    const sessionAttendancePct = totalRecords > 0 ? Math.round((totalPresentMarks / totalRecords) * 100) : 0

    const nowStr = currentTime ? format(currentTime, "HH:mm") : "00:00"
    const greetingHour = currentTime ? currentTime.getHours() : 12

    const currentSession = todaySessions.find(s =>
        s.start_time && s.end_time &&
        nowStr >= s.start_time.slice(0, 5) &&
        nowStr <= s.end_time.slice(0, 5)
    )
    const nextSession = !currentSession ? todaySessions.find(s =>
        s.start_time && nowStr < s.start_time.slice(0, 5)
    ) : undefined
    let nextSessionLabel = nextSession
        ? `Next: ${nextSession.name} at ${nextSession.start_time?.slice(0, 5)}`
        : null
    if (!currentSession && !nextSessionLabel && todaySessions.length > 0) {
        nextSessionLabel = "Classes resume tomorrow"
    }

    // Filtered student list (mode-aware)
    const filteredStudents = useMemo(() => {
        const q = search.toLowerCase()
        if (studentMode === "my") {
            return myStudents.filter(s =>
                s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q)
            )
        } else {
            return allStudents.filter(s =>
                !q || s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q)
            )
        }
    }, [studentMode, myStudents, allStudents, search])

    // ── Loading placeholder ───────────────────────────────────────
    if (loading || !mounted) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm">Loading dashboard…</p>
                </div>
            </div>
        )
    }

    // Shared body for Top Performers — rendered inline on desktop, and inside
    // a slide-in sheet on mobile (see the floating trigger near the bottom of
    // this component) so the ranking list doesn't push the student list down.
    const topPerformersContent = (
        <>
            <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-4 text-white shadow-lg shadow-indigo-500/15">
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
                <div className="absolute -bottom-10 left-10 h-20 w-20 rounded-full bg-white/5" />
                <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
                            <Award className="h-5 w-5 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-bold">Top Performers</h3>
                            <p className="text-[11px] text-indigo-100">Monthly leaderboard</p>
                        </div>
                    </div>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        aria-label="Select month"
                        className="min-w-[100px] cursor-pointer rounded-xl border border-white/25 bg-white/15 px-2.5 py-2 text-xs font-medium text-white outline-none backdrop-blur-sm transition hover:bg-white/20 focus:ring-2 focus:ring-white/60 [&>option]:text-slate-900"
                    >
                        {monthOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {topPerformersLoading ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-800">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    </div>
                    Loading monthly points...
                </div>
            ) : topPerformersError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/20">
                    {topPerformersError}
                </div>
            ) : monthlyTopPerformers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
                    <Award className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No points recorded</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Try selecting another month.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {monthlyTopPerformers[0] && (() => {
                        const winner = monthlyTopPerformers[0]
                        const progress = Math.min(100, Math.max(0, (winner.totalPoints / 70) * 100))
                        return (
                            <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-slate-900">
                                <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-amber-300/15" />
                                <div className="relative flex items-center gap-3">
                                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25">
                                        <Award className="h-6 w-6" />
                                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-50 bg-white text-[9px] font-black text-amber-600 dark:border-slate-900 dark:bg-slate-800">1</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Champion</span>
                                        <p className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white" title={winner.name}>{winner.name}</p>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{winner.standard}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-xl font-black tabular-nums text-amber-600 dark:text-amber-400">{winner.totalPoints.toFixed(2)}</p>
                                        <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">points</p>
                                    </div>
                                </div>
                                <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-slate-800">
                                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: String(progress) + "%" }} />
                                </div>
                            </div>
                        )
                    })()}

                    {monthlyTopPerformers.length > 1 && (
                        <div>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Leaderboard</p>
                                <p className="text-[10px] text-slate-400">Score</p>
                            </div>
                            <div className="space-y-1.5">
                                {monthlyTopPerformers.slice(1).map((stu, index) => {
                                    const rank = index + 2
                                    const medalClasses = rank === 2
                                        ? "bg-slate-200 text-slate-600 ring-slate-300/70 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600"
                                        : rank === 3
                                            ? "bg-orange-100 text-orange-600 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20"
                                            : "bg-slate-100 text-slate-500 ring-transparent dark:bg-slate-800 dark:text-slate-400"
                                    return (
                                        <div
                                            key={stu.adm_no}
                                            className={"group flex items-center gap-3 rounded-xl border px-2.5 py-2.5 transition-all " + (rank <= 3
                                                ? "border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                                                : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60")}
                                        >
                                            <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-black ring-1 " + medalClasses}>
                                                #{rank}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100" title={stu.name}>{stu.name}</p>
                                                <p className="mt-0.5 text-[10px] text-slate-400">{stu.standard}</p>
                                            </div>
                                            <div className={"shrink-0 rounded-lg px-2.5 py-1.5 text-right " + (rank <= 3
                                                ? "bg-indigo-50 dark:bg-indigo-500/10"
                                                : "bg-emerald-50 dark:bg-emerald-500/10")}>
                                                <p className={"text-xs font-bold tabular-nums " + (rank <= 3
                                                    ? "text-indigo-600 dark:text-indigo-400"
                                                    : "text-emerald-600 dark:text-emerald-400")}>
                                                    {stu.totalPoints.toFixed(2)}
                                                </p>
                                                <p className="text-[8px] uppercase tracking-wide text-slate-400">pts</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    )

    return (
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-[#020617]" suppressHydrationWarning>

            {/* ── Welcome Banner — sits close under the top bar on mobile (small
                 inset, still fully rounded) so it reads as a natural
                 continuation of the header rather than a separate card with a
                 big gap, without going flush/square (that read as an abrupt
                 slab). Reverts to the normal desktop inset at the lg breakpoint. ── */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-2xl ring-1 ring-white/10 rounded-2xl mx-3 mt-3 lg:mx-6 lg:mt-6">
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5" />
                <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/5" />
                <div className="absolute top-4 right-24 w-20 h-20 rounded-full bg-white/5" />

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 md:p-7">
                    <div className="flex items-center gap-4">
                        {/* Avatar + photo upload (only place this lives now) */}
                        <div className="relative group shrink-0">
                            <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-xl ring-2 ring-white/20">
                                <AvatarImage src={getPhotoUrl(staffPhoto)} className="object-cover" />
                                <AvatarFallback className="bg-white/15 rounded-xl flex items-center justify-center text-base font-bold text-white">
                                    {staffName ? staffName.substring(0, 2).toUpperCase() : "ST"}
                                </AvatarFallback>
                            </Avatar>
                            <label className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-sm">
                                <Camera className="h-4 w-4 text-white" />
                                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                            </label>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-blue-200 text-[11px] font-medium tracking-wide uppercase">Mentor Portal</p>
                            <h1 className="text-xl md:text-2xl font-bold leading-tight">
                                {getGreeting(greetingHour)}, {staffName || "Mentor"} 👋
                            </h1>
                            <p className="text-blue-100 text-xs">{todayLabel}</p>
                            {(currentSession || nextSessionLabel) && (
                                <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 w-fit text-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                                    {currentSession
                                        ? `Now: ${currentSession.name} (${currentSession.start_time?.slice(0, 5)} – ${currentSession.end_time?.slice(0, 5)})`
                                        : nextSessionLabel}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{myStudents.length}</div>
                            <div className="text-blue-200 text-[11px]">Students</div>
                        </div>
                        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{todaySessions.length}</div>
                            <div className="text-blue-200 text-[11px]">Sessions</div>
                        </div>
                        <div className="bg-emerald-500/30 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{presentCount}</div>
                            <div className="text-emerald-200 text-[11px]">Present</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full px-4 lg:px-6 py-4 lg:py-6 space-y-4">

                {/* ── Stat strip — replaces the 4 stacked donut cards ─ */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatTile
                        icon={TrendingUp}
                        color="blue"
                        label="Entries Logged"
                        value={`${entryPct}%`}
                        sub={`${entryCount} of ${myStudents.length} logged`}
                        pct={entryPct}
                    />
                    <StatTile
                        icon={CheckCircle2}
                        color="emerald"
                        label="Daily Attendance"
                        value={`${attendancePct}%`}
                        sub={`${presentCount} present · ${absentCount} absent`}
                        pct={attendancePct}
                    />
                    <StatTile
                        icon={ClipboardCheck}
                        color="indigo"
                        label="Session Attendance"
                        value={`${sessionAttendancePct}%`}
                        sub={`${totalPresentMarks}/${totalRecords} marks · ${totalOutsideMarks} outside`}
                        pct={sessionAttendancePct}
                    />
                    <StatTile
                        icon={DoorOpen}
                        color="amber"
                        label="Currently Outside"
                        value={String(leaveCount)}
                        sub={`of ${myStudents.length} students`}
                        pct={outsidePct}
                    />
                </div>

                {/* ── Main content: 2-column (list | sessions+performers) ──
                     Order classes put the right column FIRST on mobile — Today's
                     Sessions is time-sensitive and shouldn't require scrolling
                     past the whole student list to see. */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Left: student list */}
                    <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">

                        {/* Student List — My Students / All Students toggle */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-slate-100 dark:border-gray-700">
                                {/* Mode toggle */}
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shrink-0">
                                    <button
                                        onClick={() => { setStudentMode("my"); setSearch("") }}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all
                                            ${studentMode === "my"
                                                ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400"
                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"}`}
                                    >
                                        My Students
                                    </button>
                                    <button
                                        onClick={() => { setStudentMode("all"); setSearch("") }}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all
                                            ${studentMode === "all"
                                                ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400"
                                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"}`}
                                    >
                                        All Students
                                    </button>
                                </div>

                                {/* Search */}
                                <div className="relative flex-1 min-w-[160px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input
                                        placeholder="Search name or admission no…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-8 h-8 text-xs"
                                    />
                                </div>

                                {/* Assign — the one quick action without a nav link */}
                                {mounted && (
                                    <AssignStudentsModal
                                        currentStaffId={staffId}
                                        students={myStudents}
                                        trigger={
                                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 shrink-0">
                                                <UserPlus className="h-3.5 w-3.5" /> Assign
                                            </Button>
                                        }
                                    />
                                )}
                            </div>

                            {/* All Students loading state */}
                            {studentMode === "all" && !allStudentsLoaded ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                                </div>
                            ) : filteredStudents.length === 0 ? (
                                <div className="text-center py-10 text-sm text-slate-400">
                                    {search ? "No students match your search." : "No students found."}
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-gray-800/50">
                                    {(studentMode === "my" ? filteredStudents as Student[] : []).map(student => {
                                        const isOnLeave = student.is_outside
                                        const isActionable = !student.is_delegated && !isOnLeave
                                        return (
                                            <div key={student.adm_no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">

                                                {/* ── Mobile card (hidden on md+) ─────────────────── */}
                                                <div className="md:hidden px-4 py-3.5 space-y-2.5">
                                                    {/* Row 1: Avatar + Name/Meta (single status indicator) */}
                                                    <div className="flex items-start gap-3">
                                                        <Avatar className="h-11 w-11 shrink-0 mt-0.5">
                                                            <AvatarImage src={getPhotoUrl(student.photo_url)} />
                                                            <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">
                                                                {student.name.substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1 min-w-0">
                                                            <button
                                                                onClick={() => router.push(`/staff/student/${student.adm_no}`)}
                                                                className="font-bold text-[13px] text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 text-left w-full leading-snug"
                                                                style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}
                                                            >
                                                                {student.name}
                                                            </button>
                                                            <p className="text-[11px] text-slate-400 dark:text-gray-400 mt-0.5">
                                                                {student.adm_no} · {student.standard}
                                                            </p>
                                                            {student.last_hifz && (
                                                                <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 mt-1 leading-snug">
                                                                    📍 {student.last_hifz.surah_name
                                                                        ? `${student.last_hifz.surah_name} – ${student.last_hifz.end_v || student.last_hifz.start_v || ""}`
                                                                        : `Page ${student.last_hifz.end_page || student.last_hifz.start_page || ""}`}
                                                                </p>
                                                            )}
                                                            {student.is_delegated ? (
                                                                <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-gray-400 tracking-wide">
                                                                    DELEGATED
                                                                </span>
                                                            ) : isOnLeave ? (
                                                                <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 tracking-wide">
                                                                    OUTSIDE
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: one action — edit progress when unlocked, view-only otherwise */}
                                                    <div className="flex items-center gap-2 pl-14">
                                                        {isActionable ? (
                                                            <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })} size="sm" className="flex-1 h-8 text-[12px] font-semibold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white">
                                                                <BookOpen className="h-3.5 w-3.5 mr-1" /> Open progress
                                                            </Button>
                                                        ) : (
                                                            <button
                                                                onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })}
                                                                className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-gray-400 hover:text-[#3d5ee1] hover:bg-[#e8ebfd] dark:hover:bg-[#1e2a5c] transition-colors text-[12px] font-semibold"
                                                            >
                                                                <BarChart2 className="h-3.5 w-3.5" /> View register
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => router.push(`/staff/student/${student.adm_no}`)}
                                                            className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                                                        >
                                                            <ChevronRight className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* ── Desktop row (hidden below md) ───────────────── */}
                                                <div className="hidden md:flex items-center gap-3 px-5 py-3.5">
                                                    <Avatar className="h-10 w-10 shrink-0">
                                                        <AvatarImage src={getPhotoUrl(student.photo_url)} />
                                                        <AvatarFallback className="bg-slate-200 text-slate-600">{student.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex-1 min-w-0">
                                                        <button
                                                            onClick={() => router.push(`/staff/student/${student.adm_no}`)}
                                                            className="font-semibold text-sm text-slate-900 dark:text-white hover:text-blue-600 line-clamp-2 break-words whitespace-normal text-left w-full"
                                                        >
                                                            {student.name}
                                                        </button>
                                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                                            <p className="text-[11px] text-slate-400 dark:text-gray-400">
                                                                {student.adm_no} · {student.standard}
                                                            </p>
                                                            {student.last_hifz && (
                                                                <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                                                                    📍 Last Hifz: {student.last_hifz.surah_name
                                                                        ? `${student.last_hifz.surah_name} – ${student.last_hifz.end_v || student.last_hifz.start_v || ""}`
                                                                        : `Page ${student.last_hifz.end_page || student.last_hifz.start_page || ""}`}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {student.is_delegated ? (
                                                            <>
                                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-gray-400 font-semibold flex items-center gap-1">
                                                                    <Clock className="h-3 w-3" /> Delegated
                                                                </span>
                                                                <button
                                                                    title="View monthly Hifz register"
                                                                    onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })}
                                                                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e8ebfd] dark:hover:bg-[#1e2a5c] text-slate-400 hover:text-[#3d5ee1] transition-colors"
                                                                >
                                                                    <BarChart2 className="h-4 w-4" />
                                                                </button>
                                                            </>
                                                        ) : isOnLeave ? (
                                                            <>
                                                                <span className="text-[10px] px-2.5 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-semibold">
                                                                    Outside
                                                                </span>
                                                                <button
                                                                    title="View monthly Hifz register"
                                                                    onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })}
                                                                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e8ebfd] dark:hover:bg-[#1e2a5c] text-slate-400 hover:text-[#3d5ee1] transition-colors"
                                                                >
                                                                    <BarChart2 className="h-4 w-4" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })} size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white">
                                                                <BookOpen className="h-3 w-3" /> Open progress
                                                            </Button>
                                                        )}
                                                        <button onClick={() => router.push(`/staff/student/${student.adm_no}`)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                                            <ChevronRight className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                            </div>
                                        )
                                    })}

                                    {/* All Students mode — scrollable with chart button */}
                                    {studentMode === "all" && (
                                        <>
                                            {allStudentsLoaded && filteredStudents.length > 0 && (
                                                <div className="px-5 py-2 text-[11px] text-slate-400 border-b border-slate-50 dark:border-slate-800">
                                                    Showing {filteredStudents.length} student{filteredStudents.length !== 1 ? "s" : ""}
                                                </div>
                                            )}
                                            <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50" style={{ maxHeight: 440 }}>
                                                {(filteredStudents as AllStudent[]).map(student => (
                                                    <div key={student.adm_no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                        {/* Mobile */}
                                                        <div className="md:hidden flex items-center gap-3 px-4 py-3">
                                                            <div className="h-10 w-10 rounded-full bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center font-bold text-sm shrink-0">
                                                                {student.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-semibold text-sm text-slate-900 dark:text-white break-words leading-snug" style={{ wordBreak: "break-word" }}>
                                                                    {student.name}
                                                                </p>
                                                                <p className="text-[11px] text-slate-400 dark:text-gray-400 mt-0.5">
                                                                    {student.adm_no}{student.standard ? ` · ${student.standard}` : ""}
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0">
                                                                <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })} size="sm" className="h-8 text-[11px] bg-green-600 hover:bg-green-700 text-white px-3">
                                                                    <BookOpen className="h-3 w-3 mr-1" /> Open progress
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        {/* Desktop */}
                                                        <div className="hidden md:flex items-center gap-3 px-5 py-3.5">
                                                            <div className="h-10 w-10 rounded-full bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center font-bold text-sm shrink-0">
                                                                {student.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{student.name}</p>
                                                                <p className="text-[11px] text-slate-400 dark:text-gray-400">{student.adm_no}{student.standard ? ` · ${student.standard}` : ""}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })} size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white">
                                                                    <BookOpen className="h-3 w-3" /> Open progress
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                        </div>
                    </div>

                    {/* Right: today's sessions + live snapshot + top performers */}
                    <div className="lg:col-span-1 space-y-4 order-1 lg:order-2">

                        {/* Today's Sessions */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-blue-500" /> Today's Sessions
                            </h3>
                            {todaySessions.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No sessions scheduled for today.</p>
                            ) : (
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {todaySessions.map((s) => {
                                        const isNow = currentSession?.id === s.id
                                        return (
                                            <Link href={`/staff/attendance?session=${s.id}`} key={s.id} className="block shrink-0">
                                                <div className={`w-44 rounded-xl border p-3 transition-colors ${isNow
                                                        ? "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30"
                                                        : "border-slate-200 dark:border-gray-700 bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    }`}>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="font-semibold text-sm truncate dark:text-white">{s.name}</p>
                                                        {isNow && <span className="text-[9px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 shrink-0">Now</span>}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</div>
                                                </div>
                                            </Link>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top Performers — desktop only; mobile gets the slide-in
                            panel below so this long ranking list doesn't push the
                            student list further down the page. */}
                        <div className="hidden lg:block rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm p-5">
                            {topPerformersContent}
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Performers — floating trigger + slide-in panel (mobile/tablet only) */}
            <div className="lg:hidden fixed bottom-24 right-4 z-40">
                <Sheet>
                    <SheetTrigger asChild>
                        <button
                            aria-label="Open top performers"
                            className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center transition-transform active:scale-95"
                        >
                            <LiveBarsIcon />
                        </button>
                    </SheetTrigger>
                    <SheetContent side="right" className="p-0 flex flex-col w-[85vw] sm:max-w-sm">
                        {/* Visually hidden — the visible heading lives inside
                            topPerformersContent itself, so it isn't duplicated. */}
                        <SheetTitle className="sr-only">Top Performers</SheetTitle>
                        <div className="flex-1 overflow-y-auto px-5 pt-12 pb-6">
                            {topPerformersContent}
                        </div>
                    </SheetContent>
                </Sheet>
            </div>

            {/* Hifz Progress Modal */}
            <HifzMonthlyRegister
                open={!!chartStudent}
                onClose={() => {
                    setChartStudent(null)
                    if (hifzRegisterDirtyRef.current) {
                        hifzRegisterDirtyRef.current = false
                        setRefreshTrigger(prev => prev + 1)
                    }
                }}
                student={chartStudent}
                onChange={() => {
                    invalidateCache("/dashboard/staff")
                    hifzRegisterDirtyRef.current = true
                }}
            />
        </div>
    )
}
