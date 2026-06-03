"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
    AlertTriangle,
    BarChart3,
    Bell,
    BookOpen,
    CalendarDays,
    ChevronLeft,
    DoorOpen,
    Download,
    FileText,
    GraduationCap,
    LayoutDashboard,
    Loader2,
    LogOut,
    Menu,
    Printer,
    Search,
    Shield,
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
import Cookies from "js-cookie"
import api from "@/lib/api"

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
        localStorage.removeItem("auth_token")
        Cookies.remove("auth_token", { path: "/" })
        document.cookie = "auth_token=; path=/; max-age=0"
        router.push("/login")
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-950 md:flex">
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="flex h-16 items-center gap-3 border-b border-slate-100 px-4">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600">
                        <img src="/logo.png" alt="" className="h-6 w-6 object-contain" />
                    </div>
                    <div>
                        <p className="text-sm font-black">Principal Portal</p>
                        <p className="text-xs font-semibold text-slate-500">Ribathul Quran</p>
                    </div>
                </div>
                <nav className="space-y-1 p-3">
                    {NAV.map((item) => {
                        const active = item.href === "/principal" ? pathname === item.href : pathname.startsWith(item.href)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 p-3">
                    <button suppressHydrationWarning onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <LogOut className="h-4 w-4" />
                        Logout
                    </button>
                </div>
            </aside>

            {open && <button suppressHydrationWarning aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setOpen(false)} />}

            <main className="min-w-0 flex-1 md:pl-64">
                <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
                    <div className="flex min-h-16 items-center gap-3 px-4 md:px-6">
                        <button suppressHydrationWarning onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 md:hidden">
                            <Menu className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-indigo-700">
                                <Shield className="h-3.5 w-3.5" />
                                Oversight Mode
                            </div>
                            <h1 className="truncate text-lg font-black md:text-xl">{title}</h1>
                            <p className="hidden text-xs font-medium text-slate-500 sm:block">{subtitle}</p>
                        </div>
                        <button suppressHydrationWarning className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 text-slate-500">
                            <Bell className="h-4 w-4" />
                        </button>
                    </div>
                    <DateControls range={range} />
                </header>

                <div className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 md:px-6 md:pb-8">
                    {children}
                </div>

                <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden">
                    {NAV.map((item) => {
                        const active = item.href === "/principal" ? pathname === item.href : pathname.startsWith(item.href)
                        return (
                            <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 py-2 text-[11px] font-bold ${active ? "text-indigo-600" : "text-slate-500"}`}>
                                <item.icon className="h-5 w-5" />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </main>
        </div>
    )
}

function DateControls({ range }: { range: ReturnType<typeof usePrincipalRange> }) {
    return (
        <div className="border-t border-slate-100 px-4 py-2 md:px-6">
            <div className="flex flex-wrap items-center gap-2">
                {(["week", "month", "year", "custom"] as RangeMode[]).map((mode) => (
                    <button
                        suppressHydrationWarning
                        key={mode}
                        onClick={() => range.setPreset(mode)}
                        className={`h-8 rounded-lg px-3 text-xs font-black capitalize ${range.rangeMode === mode ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}
                    >
                        {mode === "year" ? "Jun-Apr" : mode}
                    </button>
                ))}
                <div className="ml-0 flex items-center gap-2 md:ml-auto">
                    <input suppressHydrationWarning type="date" value={range.startDate} onChange={(e) => { range.setStartDate(e.target.value); range.setRangeMode("custom") }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold" />
                    <input suppressHydrationWarning type="date" value={range.endDate} onChange={(e) => { range.setEndDate(e.target.value); range.setRangeMode("custom") }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold" />
                </div>
            </div>
        </div>
    )
}

export function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="h-5 w-5" />
            </div>
            <div>
                <h2 className="text-lg font-black">{title}</h2>
                <p className="text-sm font-medium text-slate-500">{subtitle}</p>
            </div>
        </div>
    )
}

export function StatCard({ icon: Icon, label, value, sub, tone = "indigo" }: { icon: React.ElementType; label: string; value: string | number; sub: string; tone?: "indigo" | "emerald" | "amber" | "rose" | "sky" }) {
    const tones = {
        indigo: "bg-indigo-50 text-indigo-600",
        emerald: "bg-emerald-50 text-emerald-600",
        amber: "bg-amber-50 text-amber-600",
        rose: "bg-rose-50 text-rose-600",
        sky: "bg-sky-50 text-sky-600",
    }
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-5 grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>
                <Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-black">{value}</p>
            <p className="text-sm font-black text-slate-700">{label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{sub}</p>
        </div>
    )
}

export function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="font-black text-slate-700">{title}</p>
            <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p>
        </div>
    )
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
    return (
        <div className="grid min-h-48 place-items-center rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {label}
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
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {actions.map((action) => (
                <button suppressHydrationWarning key={action.label} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-black text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50">
                    <action.icon className="h-4 w-4 text-indigo-600" />
                    {action.label}
                </button>
            ))}
        </div>
    )
}

export function StudentSearchInput({ value, onChange, placeholder = "Search by name, admission no, roll no" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
    return (
        <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
                suppressHydrationWarning
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
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
    return (
        <Link href={`/principal/students/${student.adm_no}`} className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
            <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 flex-none place-items-center rounded-lg bg-indigo-100 text-sm font-black text-indigo-700">
                    {student.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate font-black text-slate-900">{student.name}</p>
                            <p className="text-xs font-semibold text-slate-500">
                                {student.adm_no} {student.roll_no ? `- Roll ${student.roll_no}` : ""} - {student.standard || "Class not set"}
                            </p>
                        </div>
                        <button
                            suppressHydrationWarning
                            type="button"
                            onClick={(event) => { event.preventDefault(); onToggleFavorite() }}
                            className={`grid h-8 w-8 place-items-center rounded-lg border ${favorite ? "border-amber-200 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-400"}`}
                            aria-label="Toggle favorite"
                        >
                            <Star className={`h-4 w-4 ${favorite ? "fill-current" : ""}`} />
                        </button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <MiniMetric label="Attendance" value={attendance == null ? "-" : `${attendance}%`} />
                        <MiniMetric label="Hifz" value={progress == null ? "-" : `${progress}%`} />
                        <MiniMetric label="Status" value={student.status || "active"} />
                    </div>
                </div>
            </div>
        </Link>
    )
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg bg-slate-50 px-2 py-2">
            <p className="font-black text-slate-800">{value}</p>
            <p className="mt-0.5 truncate font-semibold text-slate-500">{label}</p>
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
        <div className="h-72 rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="newPages" name="New Pages" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="recent" name="Recent Revision" fill="#10b981" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="juz" name="Juz Revision" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}

export function TrendChart({ data }: { data: { label: string; value: number }[] }) {
    if (!data.length) return <EmptyState title="No trend data" subtitle="The selected period has no chartable records yet." />
    return (
        <div className="h-72 rounded-lg border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    )
}

export function AttentionBadge({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-black text-rose-700">
            <AlertTriangle className="h-3 w-3" />
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
