"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
    AlertTriangle,
    BarChart3,
    BookOpen,
    CalendarDays,
    DoorOpen,
    Download,
    FileText,
    GraduationCap,
    LayoutDashboard,
    LogOut,
    Menu,
    Printer,
    Search,
    Star,
    TrendingUp,
    UserRound,
    Users,
} from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

export type RangeMode = "week" | "month" | "year" | "custom"

export type Student = {
    adm_no: string
    name: string
    standard?: string | null
    batch_year?: string | null
    roll_no?: string | null
    photo_url?: string | null
    status?: string | null
    hifz_mentor?: { name?: string } | string | null
    school_mentor?: { name?: string } | string | null
    madrasa_mentor?: { name?: string } | string | null
    hifz_mentor_id?: string | null
    school_mentor_id?: string | null
    madrasa_mentor_id?: string | null
    progress?: number
}

export type AttendanceTotals = {
    effectiveClasses?: number
    attendedClasses?: number
    notAttendedClasses?: number
    presentClasses?: number
    absentClasses?: number
    lateClasses?: number
    leaveClasses?: number
}

export type HifzLog = {
    id: string
    mode: string
    entry_date: string
    surah_name?: string | null
    start_v?: number | null
    end_v?: number | null
    start_page?: number | null
    end_page?: number | null
    juz_number?: number | null
    juz_portion?: string | null
}

export type StudentProgress = {
    student: Student
    attendance_totals: AttendanceTotals | null
    period_logs: HifzLog[]
    hifz_logs_agg?: { mode: string; entry_count: number; pages_recited?: number; verses_recited?: number }[]
    revision_days?: number
}

export type MentorReport = {
    id: string
    name: string
    role?: string
    role_label?: string
    assigned_students?: number
    hifz_students?: number
    school_students?: number
    madrasa_students?: number
    attendance?: {
        marking_percentage?: number
        marked_classes?: number
        required_classes?: number
        not_marked_classes?: number
    }
}

export type OutsideStudent = {
    student_id?: string
    adm_no?: string
    name?: string
    student_name?: string
    standard?: string
    leave_type?: string
    reason_category?: string
    end_datetime?: string
}

export type LeaveRecord = {
    id: string
    leave_type?: string
    reason_category?: string
    remarks?: string
    status?: string
    start_datetime?: string
    end_datetime?: string
    student?: { name?: string; adm_no?: string; standard?: string }
}

export type ExamSummary = {
    id: string
    title: string
    department?: string
    start_date?: string
    total: number
    max: number
    percentage: number
    subjects: { name: string; marks: number; max: number; remarks?: string | null }[]
}

const NAV = [
    { href: "/principal", label: "Dashboard", icon: LayoutDashboard },
    { href: "/principal/students", label: "Students", icon: Users },
    { href: "/principal/reports", label: "Reports", icon: BarChart3 },
    { href: "/principal/leaves", label: "Leaves", icon: DoorOpen },
]

function toDateKey(date: Date) {
    return date.toISOString().slice(0, 10)
}

export function getRange(mode: RangeMode) {
    const now = new Date()
    const end = new Date(now)
    const start = new Date(now)
    if (mode === "week") {
        const day = start.getDay()
        start.setDate(start.getDate() - day)
    } else if (mode === "month") {
        start.setDate(1)
    } else if (mode === "year") {
        const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
        start.setFullYear(year, 5, 1)
        end.setFullYear(year + 1, 3, 30)
    }
    return { start: toDateKey(start), end: toDateKey(end) }
}

export function formatDate(value?: string | null) {
    if (!value) return "-"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

export function percent(part = 0, total = 0) {
    if (!total) return 0
    return Math.round((part / total) * 100)
}

export function mentorName(value: Student["hifz_mentor"]) {
    if (!value) return "Unassigned"
    if (typeof value === "string") return value
    return value.name || "Unassigned"
}

export function pagesFromLog(log: HifzLog) {
    const start = Number(log.start_page || 0)
    const end = Number(log.end_page || 0)
    if (start && end) return Math.max(0, end - start + 1)
    return start || end ? 1 : 0
}

export function logDetail(log: HifzLog) {
    if (log.mode?.startsWith("Juz")) return `Juz ${log.juz_number || "-"} ${log.juz_portion || ""}`.trim()
    if (log.surah_name && log.start_v && log.end_v) return `${log.surah_name} ${log.start_v}-${log.end_v}`
    if (log.start_page || log.end_page) return `Pages ${log.start_page || "-"}-${log.end_page || log.start_page || "-"}`
    return "Recorded"
}

export function weekLabel(dateValue: string, rangeStart: string) {
    const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`)
    const start = new Date(`${rangeStart}T00:00:00`)
    const diff = Math.max(0, Math.floor((date.getTime() - start.getTime()) / 86400000))
    return `W${Math.floor(diff / 7) + 1}`
}

export function usePrincipalRange() {
    const initial = useMemo(() => getRange("month"), [])
    const [rangeMode, setRangeMode] = useState<RangeMode>("month")
    const [startDate, setStartDate] = useState(initial.start)
    const [endDate, setEndDate] = useState(initial.end)

    const setPreset = useCallback((mode: RangeMode) => {
        setRangeMode(mode)
        if (mode === "custom") return
        const next = getRange(mode)
        setStartDate(next.start)
        setEndDate(next.end)
    }, [])

    return { rangeMode, startDate, endDate, setPreset, setStartDate, setEndDate, setRangeMode }
}

export function PrincipalFrame({
    title,
    subtitle,
    children,
    range,
}: {
    title: string
    subtitle: string
    children: React.ReactNode
    range: ReturnType<typeof usePrincipalRange>
}) {
    const pathname = usePathname()
    const router = useRouter()
    const [open, setOpen] = useState(false)

    async function logout() {
        try { await api.post("/auth/logout") } catch {}
        router.push("/login")
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-300 md:translate-x-0",
                    open ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="px-5 py-6">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50">
                            <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900 tracking-tight">Ribathul Quran</p>
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-teal-700">Principal</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 px-3">
                    {NAV.map((item) => {
                        const active = item.href === "/principal" ? pathname === item.href : pathname.startsWith(item.href)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                    "relative flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors",
                                    active
                                        ? "bg-slate-100 text-slate-950"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                )}
                            >
                                {active && (
                                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-teal-600" />
                                )}
                                <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-teal-700" : "text-slate-400")} />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>

                <div className="border-t border-slate-100/80 p-3">
                    <button
                        suppressHydrationWarning
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                        <LogOut className="h-[18px] w-[18px]" />
                        Logout
                    </button>
                </div>
            </aside>

            {open && (
                <button
                    suppressHydrationWarning
                    aria-label="Close navigation"
                    className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] md:hidden"
                    onClick={() => setOpen(false)}
                />
            )}

            <main className="min-w-0 flex-1 md:pl-[260px]">
                <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
                    <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                        <div className="flex min-w-0 items-center gap-3">
                            <button
                                suppressHydrationWarning
                                onClick={() => setOpen(true)}
                                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 md:hidden"
                            >
                                <Menu className="h-5 w-5" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-2xl font-semibold text-slate-950 tracking-tight">{title}</h1>
                                <p className="mt-0.5 truncate text-sm text-slate-500">{subtitle}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
                            <div className="flex items-center gap-0.5">
                                {(["week", "month", "year", "custom"] as RangeMode[]).map((mode) => (
                                    <button
                                        suppressHydrationWarning
                                        key={mode}
                                        onClick={() => range.setPreset(mode)}
                                        className={cn(
                                            "h-9 rounded-xl px-3.5 text-xs font-semibold capitalize transition-colors",
                                            range.rangeMode === mode
                                                ? "bg-slate-950 text-white"
                                                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                        )}
                                    >
                                        {mode === "year" ? "Jun–Apr" : mode}
                                    </button>
                                ))}
                            </div>
                            <div className="mx-1 hidden h-4 w-px bg-slate-200 sm:block" />
                            <div className="flex items-center gap-1.5">
                                <input
                                    suppressHydrationWarning
                                    type="date"
                                    value={range.startDate}
                                    onChange={(e) => { range.setStartDate(e.target.value); range.setRangeMode("custom") }}
                                    className="h-9 rounded-xl border-0 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-teal-300"
                                />
                                <span className="text-[11px] text-slate-400">–</span>
                                <input
                                    suppressHydrationWarning
                                    type="date"
                                    value={range.endDate}
                                    onChange={(e) => { range.setEndDate(e.target.value); range.setRangeMode("custom") }}
                                    className="h-9 rounded-xl border-0 bg-slate-50 px-2.5 text-xs text-slate-700 outline-none ring-1 ring-slate-200 focus:ring-teal-300"
                                />
                            </div>
                        </div>
                    </div>
                </header>

                <div className="mx-auto w-full max-w-[1600px] px-5 py-7 pb-24 md:px-8 md:pb-8">
                    {children}
                </div>

                <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-slate-200/60 bg-white/90 backdrop-blur-xl md:hidden">
                    {NAV.map((item) => {
                        const active = item.href === "/principal" ? pathname === item.href : pathname.startsWith(item.href)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                                    active ? "text-teal-700" : "text-slate-400"
                                )}
                            >
                                <item.icon className={cn("h-[18px] w-[18px]", active && "drop-shadow-sm")} />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </main>
        </div>
    )
}

export function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
    return (
        <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-teal-700 ring-1 ring-slate-200">
                <Icon className="h-4 w-4" />
            </div>
            <div>
                <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
            </div>
        </div>
    )
}

export function StatCard({ icon: Icon, label, value, sub, tone = "teal" }: { icon: React.ElementType; label: string; value: string | number; sub: string; tone?: "teal" | "emerald" | "amber" | "rose" | "sky" }) {
    const tones = {
        teal: { icon: "bg-teal-50 text-teal-700 ring-teal-100" },
        emerald: { icon: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
        amber: { icon: "bg-amber-50 text-amber-700 ring-amber-100" },
        rose: { icon: "bg-rose-50 text-rose-700 ring-rose-100" },
        sky: { icon: "bg-sky-50 text-sky-700 ring-sky-100" },
    }
    const current = tones[tone]

    return (
        <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-500">{label}</p>
                    <p className="mt-1.5 text-2xl font-semibold text-slate-950 tracking-tight tabular-nums">{value}</p>
                </div>
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1", current.icon)}>
                    <Icon className="h-4 w-4" />
                </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 leading-relaxed">{sub}</p>
        </div>
    )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <FileText className="mx-auto mb-3 h-5 w-5 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">{title}</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400 leading-relaxed">{subtitle}</p>
        </div>
    )
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
    return (
        <div className="grid min-h-48 place-items-center rounded-xl border border-slate-200/80 bg-white">
            <div className="flex items-center gap-2.5 text-sm text-slate-500">
                <ThreeBallLoader label={`${label}...`} />
            </div>
        </div>
    )
}

export function QuickActions() {
    const actions = [
        { label: "Student Report", icon: FileText },
        { label: "Attendance Export", icon: Download },
        { label: "Hifz Export", icon: Download },
        { label: "Print Summary", icon: Printer },
    ]
    return (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {actions.map((action) => (
                <button
                    suppressHydrationWarning
                    key={action.label}
                    className="group flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                >
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-teal-50 group-hover:text-teal-700">
                        <action.icon className="h-3.5 w-3.5" />
                    </span>
                    {action.label}
                </button>
            ))}
        </div>
    )
}

export function StudentSearchInput({ value, onChange, placeholder = "Search by name, admission no, roll no" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
                suppressHydrationWarning
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
            />
        </div>
    )
}

export function useFavorites() {
    const [favorites, setFavorites] = useState<string[]>([])
    useEffect(() => {
        try { setFavorites(JSON.parse(localStorage.getItem("principal.favoriteStudents") || "[]")) } catch {}
    }, [])
    const toggleFavorite = (id: string) => {
        setFavorites((current) => {
            const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
            localStorage.setItem("principal.favoriteStudents", JSON.stringify(next))
            return next
        })
    }
    return { favorites, toggleFavorite }
}

export function StudentCard({ student, progress, attendance, favorite, onToggleFavorite }: { student: Student; progress?: number; attendance?: number; favorite: boolean; onToggleFavorite: () => void }) {
    const initials = student.name.slice(0, 2).toUpperCase()

    return (
        <Link
            href={`/principal/students/${student.adm_no}`}
            className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300"
        >
            <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-sm">
                    {initials}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800 group-hover:text-slate-900">{student.name}</p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {student.adm_no}{student.roll_no ? ` · ${student.roll_no}` : ""} · {student.standard || "Unassigned"}
                            </p>
                        </div>
                        <button
                            suppressHydrationWarning
                            type="button"
                            onClick={(event) => { event.preventDefault(); onToggleFavorite() }}
                            className={cn(
                                "grid h-7 w-7 place-items-center rounded-md transition-colors",
                                favorite ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
                            )}
                            aria-label="Toggle favorite"
                        >
                            <Star className={cn("h-3.5 w-3.5", favorite && "fill-current")} />
                        </button>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <MiniMetric label="Attendance" value={attendance == null ? "—" : `${attendance}%`} tone={attendance && attendance < 75 ? "rose" : "neutral"} />
                        <MiniMetric label="Hifz" value={progress == null ? "—" : `${progress}%`} tone={progress && progress < 35 ? "rose" : "neutral"} />
                        <MiniMetric label="Status" value={student.status || "active"} tone={student.status === "inactive" ? "rose" : "neutral"} />
                    </div>
                </div>
            </div>
        </Link>
    )
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: "neutral" | "rose" }) {
    return (
        <div className={cn(
            "rounded-md px-2 py-1.5 text-center",
            tone === "rose" ? "bg-rose-50" : "bg-slate-50"
        )}>
            <p className={cn("text-xs font-medium tabular-nums", tone === "rose" ? "text-rose-600" : "text-slate-700")}>{value}</p>
            <p className="mt-0.5 truncate text-[10px] text-slate-400">{label}</p>
        </div>
    )
}

export function hifzChartData(progress: StudentProgress | null, startDate: string) {
    const map = new Map<string, { label: string; newPages: number; recent: number; juz: number }>()
    for (const log of progress?.period_logs || []) {
        const label = weekLabel(log.entry_date, startDate)
        const item = map.get(label) || { label, newPages: 0, recent: 0, juz: 0 }
        if (log.mode === "New Verses") item.newPages += pagesFromLog(log)
        else if (log.mode === "Recent Revision") item.recent += 1
        else if (log.mode?.startsWith("Juz")) item.juz += 1
        map.set(label, item)
    }
    return Array.from(map.values())
}

export function hifzTotals(progress: StudentProgress | null) {
    return (progress?.period_logs || []).reduce(
        (acc, log) => {
            if (log.mode === "New Verses") acc.newPages += pagesFromLog(log)
            else if (log.mode === "Recent Revision") acc.recent += 1
            else if (log.mode?.startsWith("Juz")) acc.juz += 1
            return acc
        },
        { newPages: 0, recent: 0, juz: 0 }
    )
}

export function HifzChart({ data }: { data: ReturnType<typeof hifzChartData> }) {
    if (!data.length) return <EmptyState title="No Hifz activity" subtitle="No recitation records were found for this period." />
    return (
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <defs>
                        <linearGradient id="newPagesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f766e" stopOpacity={0.85} />
                            <stop offset="100%" stopColor="#0f766e" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="recentGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={0.85} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.4} />
                        </linearGradient>
                        <linearGradient id="juzGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.85} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.4} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#64748b", fontWeight: 700 }} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#64748b", fontWeight: 700 }} />
                    <Tooltip cursor={{ fill: "#f8fafc" }} content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                            <div className="bg-slate-950 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-800">
                                <p className="font-black border-b border-white/10 pb-1 mb-1">{label}</p>
                                {payload.map((p) => (
                                    <div key={p.dataKey as string} className="flex items-center gap-2 py-0.5">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }}></span>
                                        <span className="font-bold text-slate-300">{p.name}:</span>
                                        <span className="font-black text-white ml-auto">{p.value}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    }} />
                    <Bar dataKey="newPages" name="New Pages" fill="url(#newPagesGrad)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="recent" name="Recent Revision" fill="url(#recentGrad)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="juz" name="Juz Revision" fill="url(#juzGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

export function TrendChart({ data }: { data: { label: string; value: number }[] }) {
    if (!data.length) return <EmptyState title="No trend data" subtitle="The selected period has no chartable records yet." />
    return (
        <div className="h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <defs>
                        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0f766e" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#0f766e" stopOpacity={0.0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#64748b", fontWeight: 700 }} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#64748b", fontWeight: 700 }} />
                    <Tooltip content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null
                        return (
                            <div className="bg-slate-950 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-800">
                                <p className="font-black border-b border-white/10 pb-1 mb-1">{label}</p>
                                {payload.map((p) => (
                                    <div key={p.dataKey as string} className="flex items-center gap-2 py-0.5">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }}></span>
                                        <span className="font-bold text-slate-300">{p.name}:</span>
                                        <span className="font-black text-white ml-auto">{p.value}%</span>
                                    </div>
                                ))}
                            </div>
                        )
                    }} />
                    <Line type="monotone" dataKey="value" name="Performance" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export function AttentionBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 ring-1 ring-rose-100">
            {children}
        </span>
    )
}

export const PrincipalIcons = {
    AlertTriangle,
    BarChart3,
    BookOpen,
    CalendarDays,
    DoorOpen,
    GraduationCap,
    TrendingUp,
    UserRound,
    Users,
}
