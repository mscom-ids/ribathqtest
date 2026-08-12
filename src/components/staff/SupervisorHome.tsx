"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
    Users, DoorOpen, CheckCircle2, GraduationCap, BookOpen, Search, Loader2,
    Target, ChevronRight, Trophy, Star, Award, Gem, type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

type AllStudent = { adm_no: string; name: string; standard: string | null; status?: string }
type Mentor = { id: string; name: string; photo_url: string | null; place: string | null; student_count: number }
type SupervisorCounts = { active: number; on_campus: number; out_campus: number; mentors: number }
type SupervisorAttendance = { present: number; total: number }
type SupervisorSnapshot = {
    savedAt: number
    name: string
    photo: string
    counts: SupervisorCounts | null
    attendance: SupervisorAttendance | null
    students: AllStudent[]
    mentors: Mentor[]
}

const SUPERVISOR_SNAPSHOT_KEY = "__supervisor_home_snapshot"
const SUPERVISOR_SNAPSHOT_MAX_AGE_MS = 5 * 60_000

function readSupervisorSnapshot(): SupervisorSnapshot | null {
    try {
        if (typeof window === "undefined") return null
        const raw = sessionStorage.getItem(SUPERVISOR_SNAPSHOT_KEY)
        if (!raw) return null
        const snapshot = JSON.parse(raw) as SupervisorSnapshot
        if (!snapshot.savedAt || Date.now() - snapshot.savedAt > SUPERVISOR_SNAPSHOT_MAX_AGE_MS) return null
        return snapshot
    } catch {
        return null
    }
}

function saveSupervisorSnapshot(snapshot: SupervisorSnapshot) {
    try {
        sessionStorage.setItem(SUPERVISOR_SNAPSHOT_KEY, JSON.stringify(snapshot))
    } catch { /* A fresh network load remains the fallback. */ }
}

type MonthlyReportRow = {
    adm_no: string
    name?: string
    standard?: string
    totalPoints?: number | string | null
    total_points?: number | string | null
    points?: number | string | null
    percentage?: number | string | null
}

type TopPerformer = {
    adm_no: string
    name: string
    standard: string
    totalPoints: number
}

const STAT_COLORS = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
} as const

function StatTile({ icon: Icon, color, label, value, sub, pct }: {
    icon: LucideIcon; color: keyof typeof STAT_COLORS; label: string; value: string; sub: string; pct: number
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

function getGreeting(h: number) {
    if (h < 12) return "Good Morning"
    if (h < 17) return "Good Afternoon"
    return "Good Evening"
}

// ─── Build ranked top performers from a monthly-report payload ───────────────
// Same logic as the mentor portal's page.tsx `buildPerformers`
function buildPerformers(reports: MonthlyReportRow[]): TopPerformer[] {
    return reports
        .map((r) => {
            const rawPoints = r.totalPoints ?? r.total_points ?? r.points
            const rawPercentage = r.percentage
            const percentage = Number(rawPercentage)
            const legacyPoints = Number(rawPoints)

            const totalPoints = rawPercentage !== undefined
                && rawPercentage !== null
                && Number.isFinite(percentage)
                ? Math.round((percentage * 0.7 + Number.EPSILON) * 100) / 100
                : legacyPoints
            if (!Number.isFinite(totalPoints)) return null
            return {
                adm_no: r.adm_no,
                name: r.name || r.adm_no,
                standard: r.standard || "",
                totalPoints,
            }
        })
        .filter((p): p is TopPerformer => p !== null && p.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints || a.name.localeCompare(b.name))
}

// ─── Month options from Jun 2026 back ──────────────────────────────────────
function buildMonthOptions(anchor: Date): { value: string; label: string }[] {
    const opts: { value: string; label: string }[] = []
    const start = new Date(2026, 5, 1)
    const cur = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    for (let d = new Date(cur); d >= start; d.setMonth(d.getMonth() - 1)) {
        opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy") })
    }
    return opts
}

/**
 * Leadership home for Principal / Vice Principal when NO Mentor Focus is set.
 */
export function SupervisorHome({ role }: { role: string }) {
    const [initialSnapshot] = useState(readSupervisorSnapshot)
    const [name, setName] = useState(initialSnapshot?.name || "")
    const [photo, setPhoto] = useState(initialSnapshot?.photo || "")
    const [counts, setCounts] = useState<SupervisorCounts | null>(initialSnapshot?.counts || null)
    const [attendance, setAttendance] = useState<SupervisorAttendance | null>(initialSnapshot?.attendance || null)
    const [students, setStudents] = useState<AllStudent[]>(initialSnapshot?.students || [])
    const [mentors, setMentors] = useState<Mentor[]>(initialSnapshot?.mentors || [])
    const [loading, setLoading] = useState(!initialSnapshot)
    const [search, setSearch] = useState("")
    const [focusingId, setFocusingId] = useState<string | null>(null)

    // Top Performers — same data as mentor portal, but for ALL students
    const [lbOpen, setLbOpen] = useState(false)
    const [performers, setPerformers] = useState<TopPerformer[]>([])
    const [perfLoading, setPerfLoading] = useState(true)
    const [perfError, setPerfError] = useState<string | null>(null)
    const [selectedMonth, setSelectedMonth] = useState("")

    type ChartStudent = { adm_no: string; name: string; standard: string | null }
    const [chartStudent, setChartStudent] = useState<ChartStudent | null>(null)

    const [now, setNow] = useState<Date | null>(null)
    useEffect(() => {
        const d = new Date()
        setNow(d)
        setSelectedMonth(format(d, "yyyy-MM"))
    }, [])

    const monthOptions = useMemo(
        () => (now ? buildMonthOptions(now) : []),
        [now]
    )

    // ── Load main data ──────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        async function load() {
            // Keep a recent snapshot painted while revalidating. This avoids a
            // full-page spinner every time leadership returns to the dashboard.
            if (!initialSnapshot) setLoading(true)
            const today = format(new Date(), "yyyy-MM-dd")
            const [me, admin, daily, mentorList, studentList] = await Promise.allSettled([
                cachedGet("/staff/me", undefined, 60_000),
                cachedGet("/dashboard/admin", undefined, 60_000),
                cachedGet("/attendance/daily-stats", { start_date: today, end_date: today }, 60_000),
                cachedGet("/delegations/focusable-mentors", undefined, 60_000),
                cachedGet("/students", { scope: "all", light: "true", status: "active", limit: 500, count: "false", sort: "name" }, 60_000),
            ])
            if (cancelled) return

            const nextName = me.status === "fulfilled" && me.value.data?.staff
                ? me.value.data.staff.name || ""
                : initialSnapshot?.name || ""
            const nextPhoto = me.status === "fulfilled" && me.value.data?.staff
                ? me.value.data.staff.photo_url || ""
                : initialSnapshot?.photo || ""
            let nextCounts = initialSnapshot?.counts || null
            if (admin.status === "fulfilled" && admin.value.data?.summary) {
                const s = admin.value.data.summary
                nextCounts = {
                    active: s.students?.active ?? 0,
                    on_campus: s.students?.on_campus ?? 0,
                    out_campus: s.students?.out_campus ?? 0,
                    mentors: s.staff?.active ?? 0,
                }
            }
            let nextAttendance = initialSnapshot?.attendance || null
            if (daily.status === "fulfilled" && daily.value.data?.students) {
                nextAttendance = { present: daily.value.data.students.present ?? 0, total: daily.value.data.students.total ?? 0 }
            }
            const nextMentors = mentorList.status === "fulfilled" && mentorList.value.data?.mentors
                ? mentorList.value.data.mentors
                : initialSnapshot?.mentors || []
            const nextStudents = studentList.status === "fulfilled" && studentList.value.data?.students
                ? studentList.value.data.students
                : initialSnapshot?.students || []

            setName(nextName)
            setPhoto(nextPhoto)
            setCounts(nextCounts)
            setAttendance(nextAttendance)
            setMentors(nextMentors)
            setStudents(nextStudents)
            // Only persist a usable overview. A failed cold load must not turn
            // into a fresh-looking empty snapshot on the next visit.
            if (nextCounts) {
                saveSupervisorSnapshot({
                    savedAt: Date.now(),
                    name: nextName,
                    photo: nextPhoto,
                    counts: nextCounts,
                    attendance: nextAttendance,
                    students: nextStudents,
                    mentors: nextMentors,
                })
            }
            setLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [])

    // ── Load top performers for the selected month ──────────────────
    // Uses the SAME endpoint as the mentor portal: /hifz/monthly-reports/calculate
    // Without mentor_id → returns ALL students.
    useEffect(() => {
        if (!selectedMonth) return
        let cancelled = false
        setPerfLoading(true)
        setPerfError(null)

        cachedGet("/hifz/monthly-reports/calculate", { month: selectedMonth }, 120_000)
            .then((res) => {
                if (cancelled) return
                const reports: MonthlyReportRow[] = Array.isArray(res.data?.reports) ? res.data.reports : []
                setPerformers(buildPerformers(reports))
            })
            .catch((err) => {
                if (cancelled) return
                console.warn("[VP TOP PERFORMERS] load error:", err)
                setPerformers([])
                setPerfError("Could not load monthly points")
            })
            .finally(() => {
                if (!cancelled) setPerfLoading(false)
            })
        return () => { cancelled = true }
    }, [selectedMonth])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return students
        return students.filter(s => s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q))
    }, [students, search])

    const attendancePct = attendance && attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0
    const roleLabel = role === "principal" ? "Principal" : "Vice Principal"

    async function focusMentor(m: Mentor) {
        setFocusingId(m.id)
        try {
            const res = await api.post("/delegations/supervisor-focus", { mentorId: m.id })
            if (res.data?.success) {
                sessionStorage.setItem("delegationToken", res.data.delegationToken)
                sessionStorage.setItem("delegationMentorName", res.data.mentor.name)
                sessionStorage.setItem("mentorFocus", "1")
                sessionStorage.removeItem("delegationStudentName")
                window.location.href = "/staff"
            } else {
                setFocusingId(null)
            }
        } catch {
            setFocusingId(null)
        }
    }

    if (loading && !counts) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm">Loading overview…</p>
                </div>
            </div>
        )
    }

    // ── Top Performers sheet content (same visual as mentor portal) ──
    const topPerformersContent = (
        <>
            <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-4 text-white shadow-lg shadow-indigo-500/15">
                <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10" />
                <div className="absolute -bottom-10 left-10 h-20 w-20 rounded-full bg-white/5" />
                <div className="relative flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                            <Award className="h-5 w-5 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-bold">Top Performers</h3>
                            <p className="text-[11px] text-indigo-100">All students · Monthly leaderboard</p>
                        </div>
                    </div>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        aria-label="Select month"
                        className="min-w-[100px] cursor-pointer rounded-xl border border-white/25 bg-white/15 px-2.5 py-2 text-xs font-medium text-white outline-none transition hover:bg-white/20 focus:ring-2 focus:ring-white/60 [&>option]:text-slate-900"
                    >
                        {monthOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {perfLoading ? (
                <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-800">
                        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    </div>
                    Loading monthly points...
                </div>
            ) : perfError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-8 text-center text-sm text-red-500 dark:border-red-900/40 dark:bg-red-950/20">
                    {perfError}
                </div>
            ) : performers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
                    <Award className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No points recorded</p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Try selecting another month.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Champion card */}
                    {performers[0] && (() => {
                        const winner = performers[0]
                        const progress = Math.min(100, Math.max(0, (winner.totalPoints / 70) * 100))
                        return (
                            <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm dark:border-amber-500/20 dark:from-amber-500/10 dark:via-orange-500/5 dark:to-slate-900">
                                <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-amber-300/15" />
                                <div className="relative flex items-center gap-3">
                                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/25">
                                        <Award className="h-6 w-6" />
                                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-amber-50 bg-gradient-to-br from-cyan-300 to-blue-500 shadow-sm dark:border-slate-900">
                                            <Gem className="h-2.5 w-2.5 text-white" />
                                        </span>
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

                    {/* Rest of leaderboard */}
                    {performers.length > 1 && (
                        <div>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Leaderboard</p>
                                <p className="text-[10px] text-slate-400">Score</p>
                            </div>
                            <div className="space-y-1.5">
                                {performers.slice(1).map((stu, index) => {
                                    const rank = index + 2
                                    const medalClasses = rank === 2
                                        ? "bg-gradient-to-br from-yellow-300 to-amber-500 text-white ring-amber-300/70 dark:ring-amber-500/40"
                                        : rank === 3
                                            ? "bg-gradient-to-br from-slate-300 to-slate-400 text-white ring-slate-300/70 dark:from-slate-400 dark:to-slate-500 dark:ring-slate-400/40"
                                            : "bg-white text-slate-500 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700"
                                    return (
                                        <button
                                            key={stu.adm_no}
                                            type="button"
                                            onClick={() => { setChartStudent({ adm_no: stu.adm_no, name: stu.name, standard: stu.standard }); setLbOpen(false) }}
                                            className={"w-full group flex items-center gap-3 rounded-xl border px-2.5 py-2.5 transition-all text-left " + (rank <= 3
                                                ? "border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                                                : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/60")}
                                        >
                                            <div className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ring-1 " + medalClasses}>
                                                {rank}
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
                                        </button>
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
        <div className="min-h-full bg-slate-50 dark:bg-[#020617]" suppressHydrationWarning>

            {/* ── Welcome banner ── */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-2xl ring-1 ring-white/10 rounded-2xl mx-3 mt-3 lg:mx-6 lg:mt-6">
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5" />
                <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/5" />
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 md:p-7">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-xl ring-2 ring-white/20 shrink-0">
                            <AvatarImage src={getPhotoUrl(photo)} className="object-cover" />
                            <AvatarFallback className="bg-white/15 rounded-xl text-base font-bold text-white">
                                {name ? name.substring(0, 2).toUpperCase() : "VP"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1.5">
                            <p className="text-blue-200 text-[11px] font-medium tracking-wide uppercase">Leadership Portal · {roleLabel}</p>
                            <h1 className="text-xl md:text-2xl font-bold leading-tight">
                                {getGreeting(now ? now.getHours() : 12)}, {name || roleLabel} 👋
                            </h1>
                            <p className="text-blue-100 text-xs">{now ? format(now, "EEEE, MMMM d, yyyy") : ""}</p>
                            <div className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 w-fit text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                                Full access to every student and mentor
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <div className="bg-white/15 rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.active ?? "—"}</div>
                            <div className="text-blue-200 text-[11px]">Students</div>
                        </div>
                        <div className="bg-white/15 rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.on_campus ?? "—"}</div>
                            <div className="text-blue-200 text-[11px]">On Campus</div>
                        </div>
                        <div className="bg-amber-500/30 rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.out_campus ?? "—"}</div>
                            <div className="text-amber-100 text-[11px]">Outside</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="w-full px-4 lg:px-6 py-4 lg:py-6 space-y-4">

                {/* ── School-wide stat strip ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatTile icon={Users} color="blue" label="Total Students" value={String(counts?.active ?? 0)} sub={`${counts?.on_campus ?? 0} on campus`} pct={100} />
                    <StatTile icon={CheckCircle2} color="emerald" label="Attendance Today" value={`${attendancePct}%`} sub={attendance ? `${attendance.present} of ${attendance.total} marks` : "No marks yet"} pct={attendancePct} />
                    <StatTile icon={DoorOpen} color="amber" label="Currently Outside" value={String(counts?.out_campus ?? 0)} sub={`of ${counts?.active ?? 0} students`} pct={counts && counts.active ? (counts.out_campus / counts.active) * 100 : 0} />
                    <StatTile icon={GraduationCap} color="indigo" label="Active Mentors" value={String(counts?.mentors ?? 0)} sub="teaching & leadership" pct={100} />
                </div>

                {/* ── Main: all students | mentors panel ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Left: All students */}
                    <div className="lg:col-span-2">
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-slate-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">All Students</span>
                                </div>
                                <div className="relative flex-1 min-w-[160px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input placeholder="Search name or admission no…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                                </div>
                            </div>

                            {loading && students.length === 0 ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-10 text-sm text-slate-400">{search ? "No students match your search." : "No students found."}</div>
                            ) : (
                                <>
                                    <div className="px-5 py-2 text-[11px] text-slate-400 border-b border-slate-50 dark:border-slate-800">
                                        Showing {filtered.length} student{filtered.length !== 1 ? "s" : ""}
                                    </div>
                                    <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50" style={{ maxHeight: 560 }}>
                                        {filtered.map(student => (
                                            <div key={student.adm_no} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <div className="h-10 w-10 rounded-full bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center font-bold text-sm shrink-0">
                                                    {student.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{student.name}</p>
                                                    <p className="text-[11px] text-slate-400 dark:text-gray-400">{student.adm_no}{student.standard ? ` · ${student.standard}` : ""}</p>
                                                </div>
                                                <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })} size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white shrink-0">
                                                    <BookOpen className="h-3 w-3" /> Open progress
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: Mentors panel — click any mentor to focus */}
                    <div className="lg:col-span-1">
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 p-5 border-b border-slate-100 dark:border-gray-700">
                                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                                    <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Mentor Focus</p>
                                    <p className="text-[11px] text-slate-400">Tap to open a mentor&apos;s class</p>
                                </div>
                            </div>
                            {mentors.length === 0 ? (
                                <div className="text-center py-8 text-xs text-slate-400">No mentors found.</div>
                            ) : (
                                <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50">
                                    {mentors.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            disabled={focusingId !== null}
                                            onClick={() => focusMentor(m)}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-60"
                                        >
                                            <Avatar className="h-9 w-9 shrink-0">
                                                <AvatarImage src={getPhotoUrl(m.photo_url)} className="object-cover" />
                                                <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
                                                    {m.name.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
                                                <p className="truncate text-[11px] text-slate-400">
                                                    {m.place ? `${m.place} · ` : ""}{m.student_count} student{m.student_count !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                            {focusingId === m.id
                                                ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                                                : <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Floating Trophy button — opens Top Performers sheet ── */}
            <div className="fixed bottom-24 right-4 z-40">
                <button
                    onClick={() => setLbOpen(true)}
                    aria-label="Open top performers"
                    className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg flex items-center justify-center transition-all active:scale-95"
                >
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            {/* ── Top Performers slide-in sheet ── */}
            <Sheet open={lbOpen} onOpenChange={setLbOpen}>
                <SheetContent side="right" className="p-0 flex flex-col w-[85vw] sm:max-w-sm">
                    <SheetTitle className="sr-only">Top Performers</SheetTitle>
                    <div className="flex-1 overflow-y-auto px-5 pt-12 pb-6">
                        {topPerformersContent}
                    </div>
                </SheetContent>
            </Sheet>

            {/* Hifz register modal */}
            <HifzMonthlyRegister
                open={!!chartStudent}
                onClose={() => setChartStudent(null)}
                student={chartStudent}
                onChange={() => { }}
            />
        </div>
    )
}
