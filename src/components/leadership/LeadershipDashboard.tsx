"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
    Users, DoorOpen, CheckCircle2, GraduationCap, BookOpen, Search, Loader2,
    Trophy, CalendarDays, ArrowUpRight, type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LeadershipLeaderboard } from "@/components/leadership/LeadershipLeaderboard"
import { LeadershipPointsTable } from "@/components/leadership/LeadershipPointsTable"
import { useLeadershipIdentity } from "@/components/leadership/LeadershipShell"
import { OutsideStudentsPopover } from "@/components/leadership/OutsideStudentsPopover"
import { getHifzPerformancePoints } from "@/lib/hifz-performance"
import { cachedGet } from "@/lib/api-cache"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

type AllStudent = { adm_no: string; name: string; standard: string | null; status?: string; photo_url?: string | null }
type Mentor = { id: string; name: string }
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

const SUPERVISOR_SNAPSHOT_KEY = "__leadership_home_snapshot:v2:"
const SUPERVISOR_SNAPSHOT_MAX_AGE_MS = 5 * 60_000

function readSupervisorSnapshot(userId: string): SupervisorSnapshot | null {
    try {
        if (typeof window === "undefined") return null
        const raw = sessionStorage.getItem(SUPERVISOR_SNAPSHOT_KEY + userId)
        if (!raw) return null
        const snapshot = JSON.parse(raw) as SupervisorSnapshot
        if (!snapshot.savedAt || Date.now() - snapshot.savedAt > SUPERVISOR_SNAPSHOT_MAX_AGE_MS) return null
        return snapshot
    } catch {
        return null
    }
}

function saveSupervisorSnapshot(userId: string, snapshot: SupervisorSnapshot) {
    try {
        sessionStorage.setItem(SUPERVISOR_SNAPSHOT_KEY + userId, JSON.stringify(snapshot))
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
    bonusPoints?: number
    grade?: string | null
    hifz_stage?: string
}

type TopPerformer = {
    adm_no: string
    name: string
    standard: string
    totalPoints: number
    bonusPoints: number
    grade: string
    isHafiz: boolean
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
        <div className="leadership-stat rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400">{label}</span>
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${c.bg}`}>
                    <Icon className={`h-4 w-4 ${c.text}`} />
                </div>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">{value}</p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-1.5 truncate">{sub}</p>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-4 overflow-hidden">
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
            const totalPoints = getHifzPerformancePoints(r)
            if (totalPoints === null) return null
            return {
                adm_no: r.adm_no,
                name: r.name || r.adm_no,
                standard: r.standard || "",
                totalPoints,
                bonusPoints: Number(r.bonusPoints || 0),
                grade: r.grade || "NO GRADE",
                isHafiz: r.hifz_stage === 'HAFIZ_REVISION',
            }
        })
        .filter((p): p is TopPerformer => p !== null && p.totalPoints >= 0)
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
 * Institution-wide leadership home. Mentor selection is a report filter only.
 */
export function LeadershipDashboard() {
    const identity = useLeadershipIdentity()
    const role = identity.role
    const [initialSnapshot] = useState(() => readSupervisorSnapshot(identity.id))
    const [name, setName] = useState(initialSnapshot?.name || "")
    const [photo, setPhoto] = useState(initialSnapshot?.photo || "")
    const [counts, setCounts] = useState<SupervisorCounts | null>(initialSnapshot?.counts || null)
    const [attendance, setAttendance] = useState<SupervisorAttendance | null>(initialSnapshot?.attendance || null)
    const [students, setStudents] = useState<AllStudent[]>(initialSnapshot?.students || [])
    const [mentors, setMentors] = useState<Mentor[]>(initialSnapshot?.mentors || [])
    const [loading, setLoading] = useState(!initialSnapshot)
    const [search, setSearch] = useState("")
    const [selectedMentor, setSelectedMentor] = useState("all")
    const [classFilter, setClassFilter] = useState("all")

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
            const [admin, daily, mentorList, studentList] = await Promise.allSettled([
                cachedGet("/dashboard/admin", undefined, 60_000),
                cachedGet("/attendance/daily-stats", { start_date: today, end_date: today }, 60_000),
                cachedGet("/staff", undefined, 60_000),
                cachedGet("/students", { scope: "all", light: "true", status: "active", limit: 500, count: "false", sort: "name" }, 60_000),
            ])
            if (cancelled) return

            const nextName = identity.name || ""
            const nextPhoto = identity.photo_url || ""
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
            const nextMentors = mentorList.status === "fulfilled" && mentorList.value.data?.staff
                ? mentorList.value.data.staff.filter((m: Mentor & { role?: string; is_active?: boolean }) => m.is_active !== false && ["staff", "usthad", "mentor", "teacher"].includes(m.role || ""))
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
                saveSupervisorSnapshot(identity.id, {
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
    // Report scope only: selecting a mentor never impersonates that mentor.
    useEffect(() => {
        if (!selectedMonth) return
        let cancelled = false
        setPerfLoading(true)
        setPerfError(null)

        cachedGet("/hifz/monthly-reports/calculate", { month: selectedMonth, ...(selectedMentor !== "all" ? { mentor_id: selectedMentor } : {}) }, 120_000)
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
    }, [selectedMonth, selectedMentor])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return students.filter(s => (classFilter === "all" || s.standard === classFilter)
            && (!q || s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q)))
    }, [students, search, classFilter])
    const classOptions = useMemo(() => [...new Set(students.map(s => s.standard).filter((s): s is string => !!s))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [students])
    const performersWithPhotos = useMemo(() => {
        const photos = new Map(students.map(student => [student.adm_no, student.photo_url]))
        return performers.map(student => ({ ...student, photo_url: photos.get(student.adm_no) || null }))
    }, [students, performers])
    const attendancePct = attendance && attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0
    const roleLabel = role === "principal" ? "Principal" : "Vice Principal"

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

    const topPerformersContent = <LeadershipPointsTable
        performers={performersWithPhotos} loading={perfLoading} error={perfError}
        month={selectedMonth} onMonthChange={value => { if (value !== selectedMonth) setPerfLoading(true); setSelectedMonth(value) }} months={monthOptions}
        mentors={mentors} mentor={selectedMentor} onMentorChange={value => { if (value !== selectedMentor) setPerfLoading(true); setSelectedMentor(value) }}
        onStudentClick={student => { setChartStudent(student); setLbOpen(false) }}
    />

    return (
        <div className="leadership-dashboard">

            {/* ── Welcome banner ── */}
            <div className="leadership-welcome relative rounded-[20px] mx-4 mt-4 text-white lg:mx-6 lg:mt-6">
                <div className="leadership-welcome-body relative flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-5 sm:p-7">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-xl ring-2 ring-white/20 shrink-0">
                            <AvatarImage src={getPhotoUrl(photo)} className="object-cover" />
                            <AvatarFallback className="bg-white/15 rounded-xl text-base font-bold text-white">
                                {name ? name.substring(0, 2).toUpperCase() : "VP"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                            <p className="text-indigo-200 text-[10px] font-semibold tracking-[0.16em] uppercase">Leadership workspace · {roleLabel}</p>
                            <h1 className="text-[22px] sm:text-2xl font-bold leading-tight tracking-tight">
                                Institution overview
                            </h1>
                            <p className="text-sm text-slate-200">{getGreeting(now ? now.getHours() : 12)}, {name || roleLabel}</p>
                            <p className="flex items-center gap-1.5 text-indigo-100/80 text-[11px]"><CalendarDays className="h-3.5 w-3.5" />{now ? format(now, "EEEE, MMMM d, yyyy") : ""}</p>
                            <div className="flex items-center gap-2 text-indigo-100/80 text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                                All students. Every mentor. One clear view.
                            </div>
                        </div>
                    </div>
                    <div className="leadership-welcome-counts grid grid-cols-3 gap-2 border-t border-white/15 pt-4 lg:shrink-0 lg:border-t-0 lg:pt-0">
                        <div className="leadership-count rounded-2xl px-4 py-3 text-center lg:min-w-[88px]">
                            <div className="text-2xl font-bold tracking-tight">{counts?.active ?? "—"}</div>
                            <div className="mt-1 text-indigo-100/80 text-[10px]">Students</div>
                        </div>
                        <div className="leadership-count rounded-2xl px-4 py-3 text-center lg:min-w-[88px]">
                            <div className="text-2xl font-bold tracking-tight">{counts?.on_campus ?? "—"}</div>
                            <div className="mt-1 text-indigo-100/80 text-[10px]">On Campus</div>
                        </div>
                        <OutsideStudentsPopover count={counts?.out_campus ?? null}><button type="button" aria-label="View outside students" className="leadership-outside-count relative rounded-2xl px-4 py-3 text-center outline-none focus-visible:ring-2 focus-visible:ring-amber-200 lg:min-w-[88px]">
                            <ArrowUpRight className="absolute right-2 top-2 h-3 w-3 text-amber-200" /><span className="block text-2xl font-bold tracking-tight">{counts?.out_campus ?? "—"}</span>
                            <span className="mt-1 block text-amber-100 text-[10px]">Outside</span>
                        </button></OutsideStudentsPopover>
                    </div>
                </div>
            </div>

            <div className="w-full px-4 lg:px-6 py-4 lg:py-6 space-y-4">

                {/* ── School-wide stat strip ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
                    <StatTile icon={Users} color="blue" label="Total Students" value={String(counts?.active ?? 0)} sub={`${counts?.on_campus ?? 0} on campus`} pct={100} />
                    <StatTile icon={CheckCircle2} color="emerald" label="Attendance Today" value={`${attendancePct}%`} sub={attendance ? `${attendance.present} of ${attendance.total} marks` : "No marks yet"} pct={attendancePct} />
                    <OutsideStudentsPopover count={counts?.out_campus ?? null}><button type="button" aria-label="View currently outside students" className="rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><StatTile icon={DoorOpen} color="amber" label="Currently Outside" value={String(counts?.out_campus ?? 0)} sub="Tap to view students ↗" pct={counts && counts.active ? (counts.out_campus / counts.active) * 100 : 0} /></button></OutsideStudentsPopover>
                    <StatTile icon={GraduationCap} color="indigo" label="Active Mentors" value={String(counts?.mentors ?? 0)} sub="teaching & leadership" pct={100} />
                </div>

                {/* Institution-wide student directory */}
                <div className="leadership-directory-grid grid grid-cols-1 gap-4">

                    {/* Left: All students */}
                    <div className="min-w-0">
                        <div className="leadership-section rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-slate-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">All Students</h2>
                                </div>
                                <div className="relative flex-1 min-w-[160px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input aria-label="Search students" placeholder="Search name or admission no…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-11 text-sm" />
                                </div>
                                <select aria-label="Filter students by class" value={classFilter} onChange={e => setClassFilter(e.target.value)} className="min-h-11 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                    <option value="all">All classes</option>
                                    {classOptions.map(standard => <option key={standard} value={standard}>{standard}</option>)}
                                </select>
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
                                                <Button aria-label={`Open progress for ${student.name}`} onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })} variant="outline" size="sm" className="leadership-progress-button min-h-11 text-xs shrink-0">
                                                    <BookOpen className="h-3 w-3" /> Open progress
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>


                </div>
            </div>

            {/* ── Floating Trophy button — opens Top Performers sheet ── */}
            <div className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-4 z-40 md:bottom-6 md:right-6">
                <button
                    onClick={() => { if (selectedMentor !== "all") setPerfLoading(true); setSelectedMentor("all"); setLbOpen(true) }}
                    aria-label="Open top performers"
                    className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg flex items-center justify-center transition-all active:scale-95"
                >
                    <Trophy className="h-5 w-5" aria-hidden="true" />
                </button>
            </div>

            {/* ── Top Performers slide-in sheet ── */}
            <LeadershipLeaderboard open={lbOpen} onOpenChange={setLbOpen}>
                {topPerformersContent}
            </LeadershipLeaderboard>

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
