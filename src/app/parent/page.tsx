"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { LucideIcon } from "lucide-react"
import {
    BarChart3,
    BookOpen,
    CalendarCheck,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Download,
    FileText,
    GraduationCap,
    LogOut,
    RefreshCw,
    TrendingUp,
    UserRound,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { ProgressRing } from "@/components/parent/progress-ring"
import { LeaveRequestModal } from "./leave-request-modal"
import api from "@/lib/api"

type StudentProfile = {
    adm_no: string
    name: string
    photo_url?: string | null
    batch_year?: string | null
    standard?: string | null
    hifz_standard?: string | null
    dob?: string | null
    hifz_mentor?: string | null
    school_mentor?: string | null
    madrasa_mentor?: string | null
}

type AttendanceSession = {
    schedule_id: string
    session: string
    effective_total: number
    attended: number
    not_attended: number
    present: number
    late: number
    absent: number
    leave: number
}

type AttendanceSummary = {
    plannedClasses: number
    cancelledClasses: number
    effectiveClasses: number
    totalClasses?: number
    attendedClasses: number
    notAttendedClasses: number
    presentClasses: number
    lateClasses: number
    absentClasses: number
    leaveClasses: number
    attendanceLabel: string
    sessions: AttendanceSession[]
}

type HifzWeek = {
    week: number
    days: {
        date: string
        day: string
        new_verses: string[]
        recent_revision: string[]
        juz_revision: string[]
        new_revision: string[]
        old_revision: string[]
        recorded_by: string[]
    }[]
    summary: HifzSummary
}

type HifzSummary = {
    new_pages: number
    recent_pages: number
    recent_days: number
    juz_revision: number
    new_revision: number
    old_revision: number
    total_recited?: number
    completed_juz?: number
    grade?: string
    percentage?: number
}

type HifzReport = {
    month: string
    is_hafiz?: boolean
    summary: HifzSummary
    weekly: HifzWeek[]
}

type HifzLog = {
    id: string
    student_id: string
    mode: string
    entry_date: string
    surah_name?: string
    start_v?: number
    end_v?: number
    start_page?: number
    end_page?: number
    juz_number?: number
    juz_portion?: string
    juz_part?: string
    usthad_name?: string | null
}

type MonthlyReport = {
    report_month: string
    hifz_pages?: number | string | null
    recent_pages?: number | string | null
    juz_revision?: number | string | null
    total_juz?: number | string | null
    attendance?: string | null
    grade?: string | null
}

type ExamReport = {
    id: string
    title: string
    department?: string
    type?: string
    start_date?: string
    end_date?: string
    total_obtained: number
    total_max: number
    percentage: number
    grade: string
    subjects: {
        subject_id: string
        subject: string
        marks_obtained: number
        max_marks: number
        min_marks: number
        remarks?: string
        percentage: number
    }[]
}

type ParentDashboardData = {
    period: {
        month: string
        start_date: string
        end_date: string
    }
    student: StudentProfile
    attendance: AttendanceSummary | null
    hifz_attendance?: AttendanceSummary | null
    hifz_report?: HifzReport
    hifz_logs: HifzLog[]
    reports: MonthlyReport[]
    exams: ExamReport[]
}

function formatDate(value?: string | null) {
    if (!value) return "-"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
    return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date)
}

function formatMonth(value?: string | null) {
    if (!value) return "-"
    const date = new Date(`${String(value).slice(0, 7)}-01T00:00:00`)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 7)
    return new Intl.DateTimeFormat("en-IN", {
        month: "long",
        year: "numeric",
    }).format(date)
}

function currentMonthKey() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function shiftMonth(monthKey: string, direction: number) {
    const [year, month] = monthKey.split("-").map(Number)
    const date = new Date(year, month - 1 + direction, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatLogDetail(log: HifzLog) {
    if (log.mode?.startsWith("Juz Revision")) {
        return `Juz ${log.juz_number || "-"} ${log.juz_portion || log.juz_part || ""}`.trim()
    }

    if (log.surah_name && log.start_v && log.end_v) {
        return `${log.surah_name}: ${log.start_v}-${log.end_v}`
    }

    if (log.start_page && log.end_page) {
        return `Pages ${log.start_page}-${log.end_page}`
    }

    return "Recorded session"
}

function percentage(part: number, total: number) {
    if (!total) return 0
    return Math.round((part / total) * 100)
}

function valueText(value: string | number | null | undefined, suffix = "") {
    if (value === null || value === undefined || value === "") return "-"
    return `${value}${suffix}`
}

export default function ParentDashboard() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [month, setMonth] = useState(currentMonthKey())
    const [data, setData] = useState<ParentDashboardData | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [tab, setTab] = useState("summary")
    const [leaveOpen, setLeaveOpen] = useState(false)

    async function loadDashboard(options?: { silent?: boolean; nextMonth?: string }) {
        const targetMonth = options?.nextMonth || month
        if (options?.silent) setRefreshing(true)
        else setLoading(true)

        try {
            const res = await api.get("/parent/dashboard", { params: { month: targetMonth } })
            if (!res.data.success) throw new Error(res.data.error || "Unable to load parent portal")
            setData({
                period: res.data.period,
                student: res.data.student,
                attendance: res.data.attendance,
                hifz_attendance: res.data.hifz_attendance,
                hifz_report: res.data.hifz_report,
                hifz_logs: res.data.hifz_logs || [],
                reports: res.data.reports || [],
                exams: res.data.exams || [],
            })
            setError(null)
        } catch (err: unknown) {
            const nextError = err instanceof Error ? err.message : "Unable to load parent portal"
            setError(nextError)
            if (!options?.silent) router.push("/login")
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        loadDashboard()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function changeMonth(direction: number) {
        const nextMonth = shiftMonth(month, direction)
        setMonth(nextMonth)
        await loadDashboard({ silent: true, nextMonth })
    }

    const attendance = data?.attendance
    const totalClasses = attendance?.totalClasses ?? attendance?.effectiveClasses ?? 0
    const attendancePercent = percentage(attendance?.attendedClasses || 0, totalClasses)
    const latestExam = data?.exams?.[0]
    const hifzSummary = data?.hifz_report?.summary
    const progress = ((hifzSummary?.completed_juz || 0) / 30) * 100

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout")
        } catch {
            // Local auth state is cleared below.
        }
        router.push("/login")
    }

    if (loading) {
        return (
            <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900">
                <div className="mx-auto flex min-h-[70vh] max-w-6xl items-center justify-center">
                    <div className="text-center">
                        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-emerald-600" />
                        <p className="text-sm font-medium text-slate-600">Loading parent portal...</p>
                    </div>
                </div>
            </main>
        )
    }

    if (!data) {
        return (
            <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900">
                <div className="mx-auto max-w-md rounded-lg border border-red-200 bg-white p-5 text-center shadow-sm">
                    <h1 className="text-lg font-bold text-red-700">Unable to open portal</h1>
                    <p className="mt-2 text-sm text-slate-600">{error || "Please login again."}</p>
                    <Button className="mt-5" onClick={() => router.push("/login")}>Go to login</Button>
                </div>
            </main>
        )
    }

    const student = data.student

    const navItems: { key: string; label: string; icon: LucideIcon }[] = [
        { key: "summary", label: "Home", icon: BarChart3 },
        { key: "attendance", label: "Attendance", icon: CalendarCheck },
        { key: "hifz", label: "Hifz", icon: BookOpen },
        { key: "exams", label: "Exams", icon: FileText },
        { key: "profile", label: "Profile", icon: UserRound },
    ]

    return (
        <main className="parent-portal min-h-screen overflow-x-hidden bg-[#eef4ff] text-slate-900">
            <style>{printStyles}</style>
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-sky-200/60 blur-3xl" />
                <div className="absolute -right-24 top-52 h-80 w-80 rounded-full bg-violet-200/70 blur-3xl" />
                <div className="absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-100/70 blur-3xl" />
            </div>

            <div className="parent-shell relative mx-auto w-full max-w-7xl px-3 pb-28 pt-3 sm:px-5 lg:px-8 lg:pb-10">
                <header className="no-print mb-4 hidden items-center justify-between rounded-[28px] border border-white/80 bg-white/85 px-5 py-4 shadow-sm shadow-blue-100/70 backdrop-blur lg:flex">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-500">Ribathul Quran</p>
                        <h1 className="text-2xl font-black text-slate-950">Parent Progress Portal</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => changeMonth(-1)} variant="outline" size="icon" className="h-11 w-11 rounded-2xl">
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="flex h-11 min-w-[170px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black">
                            {formatMonth(month)}
                        </div>
                        <Button onClick={() => changeMonth(1)} variant="outline" size="icon" className="h-11 w-11 rounded-2xl">
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button onClick={() => loadDashboard({ silent: true })} disabled={refreshing} variant="outline" className="h-11 gap-2 rounded-2xl">
                            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                            Refresh
                        </Button>
                        <Button onClick={handleLogout} variant="outline" className="h-11 gap-2 rounded-2xl text-red-600">
                            <LogOut className="h-4 w-4" />
                            Logout
                        </Button>
                    </div>
                </header>

                <section className="no-print grid gap-4 lg:grid-cols-[1fr_360px]">
                    <div className="relative overflow-hidden rounded-[34px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-5 text-white shadow-xl shadow-blue-200/70 sm:p-7 lg:min-h-[285px]">
                        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10" />
                        <div className="pointer-events-none absolute -left-16 bottom-0 h-52 w-52 rounded-full bg-sky-300/20" />
                        <div className="relative flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <button onClick={() => router.back()} className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur transition hover:bg-white/25 lg:hidden" aria-label="Back">
                                    <ChevronLeft className="h-5 w-5" />
                                </button>
                                <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-100">Welcome back</p>
                                <h2 className="mt-2 truncate text-3xl font-black leading-tight sm:text-5xl">{student.name}</h2>
                                <p className="mt-3 text-sm font-bold text-blue-100 sm:text-base">
                                    {(student.hifz_standard || student.standard || "Standard not set")} - {student.adm_no}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-blue-100/90">{formatMonth(month)} progress report</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-center gap-3">
                                <Avatar className="h-16 w-16 border-4 border-white/30 shadow-lg sm:h-20 sm:w-20">
                                    <AvatarImage src={student.photo_url || undefined} alt={student.name} />
                                    <AvatarFallback className="bg-white/15 text-xl font-black text-white">
                                        {student.name?.slice(0, 2).toUpperCase() || "ST"}
                                    </AvatarFallback>
                                </Avatar>
                                <button
                                    onClick={() => loadDashboard({ silent: true })}
                                    disabled={refreshing}
                                    aria-label="Refresh"
                                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur transition hover:bg-white/25 lg:hidden"
                                >
                                    <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                                </button>
                            </div>
                        </div>

                        <div className="relative mt-8 grid grid-cols-[112px_1fr] items-center gap-5 sm:grid-cols-[140px_1fr]">
                            <div className="flex justify-center">
                                <ProgressRing percentage={attendancePercent} size={116} strokeWidth={11} color="text-yellow-300" trackColor="text-white/20" labelColor="text-white" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <HeroMini label="Attendance" value={`${attendance?.attendedClasses || 0}/${totalClasses}`} />
                                <HeroMini label="Hifz" value={`${Math.round(progress)}%`} />
                                <HeroMini label="Grade" value={hifzSummary?.grade || "-"} />
                            </div>
                        </div>

                        <div className="relative mt-5 flex items-center justify-between gap-2 rounded-2xl bg-white/12 p-2 backdrop-blur lg:hidden">
                            <button onClick={() => changeMonth(-1)} aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <p className="flex-1 text-center text-sm font-black">{formatMonth(month)}</p>
                            <button onClick={() => changeMonth(1)} aria-label="Next month" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <aside className="hidden rounded-[34px] border border-white/80 bg-white/85 p-5 shadow-sm shadow-blue-100/70 backdrop-blur lg:block">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Quick actions</p>
                        <div className="mt-4 grid gap-3">
                            <ActionButton icon={ClipboardList} label="Request leave" onClick={() => setLeaveOpen(true)} />
                            <ActionButton icon={Download} label="Download report" onClick={() => window.print()} />
                            <ActionButton icon={RefreshCw} label="Refresh progress" onClick={() => loadDashboard({ silent: true })} loading={refreshing} />
                        </div>
                        <div className="mt-5 rounded-[26px] bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white">
                            <p className="text-sm font-black">Current mentor</p>
                            <p className="mt-2 text-xl font-black leading-snug">{student.hifz_mentor || "Unassigned"}</p>
                            <p className="mt-3 text-xs font-semibold text-slate-300">Reports are generated from approved attendance, Hifz, and exam records.</p>
                        </div>
                    </aside>
                </section>

                <Tabs value={tab} onValueChange={setTab} className="no-print mt-5">
                    <div className="hidden rounded-[26px] border border-white/80 bg-white/85 p-2 shadow-sm shadow-blue-100/70 backdrop-blur lg:flex">
                        {navItems.map((item) => {
                            const Icon = item.icon
                            const active = tab === item.key
                            return (
                                <button
                                    key={item.key}
                                    onClick={() => setTab(item.key)}
                                    className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "text-slate-500 hover:bg-blue-50 hover:text-blue-700"}`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="mt-5 rounded-[30px] border border-white/80 bg-white/90 p-3 shadow-sm shadow-blue-100/70 backdrop-blur sm:p-5 lg:p-6">
                        <TabsContent value="summary" className="mt-0 space-y-4">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <MetricCard icon={CalendarCheck} label="Attendance" value={`${attendancePercent}%`} detail={`${attendance?.attendedClasses || 0}/${totalClasses} attended`} tone="sky" />
                                <MetricCard icon={TrendingUp} label="Hifz Grade" value={hifzSummary?.grade || "-"} detail={`${valueText(hifzSummary?.total_recited)} total recited`} tone="emerald" />
                                <MetricCard icon={BookOpen} label="Hifz Progress" value={`${Math.round(progress)}%`} detail={`${hifzSummary?.completed_juz || 0} completed juz`} tone="violet" />
                                <MetricCard icon={FileText} label="Latest Exam" value={latestExam ? `${latestExam.percentage}%` : "-"} detail={latestExam?.title || "No exam marks found"} tone="amber" />
                            </div>
                            <SummaryPanel data={data} attendancePercent={attendancePercent} totalClasses={totalClasses} isHafiz={data.hifz_report?.is_hafiz ?? false} />
                        </TabsContent>

                        <TabsContent value="attendance" className="mt-0 space-y-4">
                            <AttendancePanel attendance={attendance} attendancePercent={attendancePercent} totalClasses={totalClasses} />
                        </TabsContent>

                        <TabsContent value="hifz" className="mt-0 space-y-4">
                            <HifzPanel report={data.hifz_report} logs={data.hifz_logs} monthlyReports={data.reports} />
                        </TabsContent>

                        <TabsContent value="exams" className="mt-0 space-y-4">
                            <ExamsPanel exams={data.exams} />
                        </TabsContent>

                        <TabsContent value="profile" className="mt-0 space-y-4">
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                <InfoTile icon={UserRound} label="DOB" value={formatDate(student.dob)} />
                                <InfoTile icon={GraduationCap} label="Batch" value={student.batch_year || "-"} />
                                <InfoTile icon={BookOpen} label="Hifz Mentor" value={student.hifz_mentor || "Unassigned"} />
                                <InfoTile icon={ClipboardList} label="Month" value={formatMonth(data.period.month)} />
                            </div>

                            <div className="grid gap-2 lg:hidden">
                                <Button onClick={() => setLeaveOpen(true)} variant="outline" className="h-12 justify-start gap-3 rounded-2xl">
                                    <ClipboardList className="h-4 w-4 text-blue-700" />
                                    Request leave
                                </Button>
                                <Button onClick={() => window.print()} className="h-12 justify-start gap-3 rounded-2xl bg-slate-950 text-white hover:bg-slate-800">
                                    <Download className="h-4 w-4" />
                                    Download monthly report PDF
                                </Button>
                                <Button onClick={handleLogout} variant="outline" className="h-12 justify-start gap-3 rounded-2xl text-red-600">
                                    <LogOut className="h-4 w-4" />
                                    Logout
                                </Button>
                            </div>

                            <ReportPanel data={data} attendancePercent={attendancePercent} totalClasses={totalClasses} isHafiz={data.hifz_report?.is_hafiz ?? false} />
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="print-only">
                    <ReportPanel data={data} attendancePercent={attendancePercent} totalClasses={totalClasses} isHafiz={data.hifz_report?.is_hafiz ?? false} />
                </div>
            </div>

            <nav className="no-print fixed bottom-3 left-1/2 z-40 w-[calc(100%-24px)] max-w-[520px] -translate-x-1/2 rounded-[28px] border border-white/80 bg-white/95 px-2 py-2 shadow-2xl shadow-blue-200/70 backdrop-blur lg:hidden">
                <div className="flex items-stretch justify-between">
                    {navItems.map((item) => (
                        <BottomTab key={item.key} active={tab === item.key} onClick={() => setTab(item.key)} icon={item.icon} label={item.label} />
                    ))}
                </div>
            </nav>

            <LeaveRequestModal open={leaveOpen} onOpenChange={setLeaveOpen} studentId={student.adm_no} studentName={student.name} />
        </main>
    )
}

function HeroMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-h-[78px] rounded-2xl bg-white/15 px-3 py-3 text-center backdrop-blur">
            <p className="truncate text-2xl font-black leading-none">{value}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-wide text-blue-100 sm:text-[11px]">{label}</p>
        </div>
    )
}

function ActionButton({ icon: Icon, label, onClick, loading }: {
    icon: LucideIcon
    label: string
    onClick: () => void
    loading?: boolean
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="flex h-14 w-full items-center justify-between rounded-2xl bg-slate-50 px-4 text-sm font-black text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60"
        >
            <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                    <Icon className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </span>
                {label}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
        </button>
    )
}
function BottomTab({ active, onClick, icon: Icon, label }: {
    active: boolean
    onClick: () => void
    icon: LucideIcon
    label: string
}) {
    return (
        <button
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-black transition ${active ? "text-blue-700" : "text-slate-400"}`}
        >
            <span className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-transparent"}`}>
                <Icon className="h-[18px] w-[18px]" />
            </span>
            {label}
        </button>
    )
}

function SummaryPanel({ data, attendancePercent, totalClasses, isHafiz }: {
    data: ParentDashboardData
    attendancePercent: number
    totalClasses: number
    isHafiz: boolean
}) {
    const hifz = data.hifz_report?.summary
    const exam = data.exams[0]

    return (
        <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
            <Card className="rounded-lg border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarCheck className="h-4 w-4 text-sky-600" />
                        This Month Attendance
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-[170px_1fr]">
                    <div className="flex justify-center sm:justify-start">
                        <ProgressRing percentage={attendancePercent} size={150} strokeWidth={12} color="text-slate-900" />
                    </div>
                    <div className="grid gap-3">
                        <CountRow label="Total classes" value={totalClasses} />
                        <CountRow label="Attended" value={data.attendance?.attendedClasses || 0} />
                        <CountRow label="Not attended" value={data.attendance?.notAttendedClasses || 0} />
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                        {isHafiz ? "Monthly Revision Snapshot" : "Monthly Hifz Snapshot"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                    {isHafiz ? (
                        <>
                            <MiniStat label="New revision" value={valueText(hifz?.new_revision, " juz")} />
                            <MiniStat label="Old revision" value={valueText(hifz?.old_revision, " juz")} />
                            <MiniStat label="Grade" value={hifz?.grade || "-"} />
                            <MiniStat label="Total revised" value={valueText(
                                hifz ? Number(((hifz.new_revision || 0) + (hifz.old_revision || 0)).toFixed(2)) : null,
                                " juz"
                            )} />
                        </>
                    ) : (
                        <>
                            <MiniStat label="New verses" value={valueText(hifz?.new_pages, " pages")} />
                            <MiniStat label="Recent revision" value={valueText(hifz?.recent_pages, " pages")} />
                            <MiniStat label="Juz revision" value={valueText(hifz?.juz_revision, " juz")} />
                            <MiniStat label="Grade" value={hifz?.grade || "-"} />
                        </>
                    )}
                </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200 md:col-span-2">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Latest Exam</CardTitle>
                </CardHeader>
                <CardContent>
                    {exam ? (
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-lg font-black text-slate-950">{exam.title}</p>
                                <p className="text-sm text-slate-500">{exam.department || exam.type || "Exam"} - {formatDate(exam.start_date)}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <MiniStat label="Marks" value={`${exam.total_obtained}/${exam.total_max}`} />
                                <MiniStat label="Percent" value={`${exam.percentage}%`} />
                                <MiniStat label="Grade" value={exam.grade} />
                            </div>
                        </div>
                    ) : (
                        <p className="py-6 text-center text-sm text-slate-500">No exam marks found.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

function AttendancePanel({ attendance, attendancePercent, totalClasses }: {
    attendance: AttendanceSummary | null | undefined
    attendancePercent: number
    totalClasses: number
}) {
    return (
        <>
            <Card className="rounded-lg border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarCheck className="h-4 w-4 text-sky-600" />
                        Attendance Report
                    </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-[190px_1fr]">
                    <div className="flex justify-center md:justify-start">
                        <ProgressRing percentage={attendancePercent} size={160} strokeWidth={13} color="text-slate-900" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <CountRow label="Total" value={totalClasses} />
                        <CountRow label="Attended" value={attendance?.attendedClasses || 0} />
                        <CountRow label="Not attended" value={attendance?.notAttendedClasses || 0} />
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-lg border-slate-200">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Class Attendance Percentages</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="min-w-[760px] w-full text-sm">
                            <thead>
                                <tr className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
                                    <th className="px-3 py-3">Class</th>
                                    <th className="px-3 py-3 text-right">Total</th>
                                    <th className="px-3 py-3 text-right">Attended</th>
                                    <th className="px-3 py-3 text-right">Not attended</th>
                                    <th className="px-3 py-3 text-right">Late</th>
                                    <th className="px-3 py-3 text-right">Percent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {attendance?.sessions?.length ? attendance.sessions.map((session) => (
                                    <tr key={session.schedule_id} className="border-b last:border-0">
                                        <td className="px-3 py-3 font-bold text-slate-900">{session.session}</td>
                                        <td className="px-3 py-3 text-right">{session.effective_total}</td>
                                        <td className="px-3 py-3 text-right">{session.attended}</td>
                                        <td className="px-3 py-3 text-right">{session.not_attended}</td>
                                        <td className="px-3 py-3 text-right">{session.late}</td>
                                        <td className="px-3 py-3 text-right font-black">{percentage(session.attended, session.effective_total)}%</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-8 text-center text-slate-500">No attendance records found.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </>
    )
}

type HifzRangeFilter = 'this_week' | 'last_week' | 'this_month' | 'year_summary'

function todayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

function getFilteredWeeks(weekly: HifzWeek[], filter: HifzRangeFilter): HifzWeek[] {
    if (filter === 'this_month' || filter === 'year_summary') return weekly
    const today = todayStr()
    const todayWeekIdx = weekly.findIndex(w => w.days.some(d => d.date === today))
    if (filter === 'this_week') {
        const idx = todayWeekIdx >= 0 ? todayWeekIdx : weekly.length - 1
        return weekly[idx] ? [weekly[idx]] : weekly
    }
    if (filter === 'last_week') {
        const idx = todayWeekIdx > 0 ? todayWeekIdx - 1 : 0
        return weekly[idx] ? [weekly[idx]] : weekly
    }
    return weekly
}

function filterSummary(weekly: HifzWeek[], filter: HifzRangeFilter): HifzSummary {
    const weeks = getFilteredWeeks(weekly, filter)
    return weeks.reduce<HifzSummary>((acc, w) => ({
        new_pages: (acc.new_pages || 0) + (w.summary.new_pages || 0),
        recent_pages: (acc.recent_pages || 0) + (w.summary.recent_pages || 0),
        recent_days: (acc.recent_days || 0) + (w.summary.recent_days || 0),
        juz_revision: (acc.juz_revision || 0) + (w.summary.juz_revision || 0),
        new_revision: (acc.new_revision || 0) + (w.summary.new_revision || 0),
        old_revision: (acc.old_revision || 0) + (w.summary.old_revision || 0),
    }), { new_pages: 0, recent_pages: 0, recent_days: 0, juz_revision: 0, new_revision: 0, old_revision: 0 })
}

function HifzPanel({ report, logs, monthlyReports }: {
    report?: HifzReport
    logs: HifzLog[]
    monthlyReports: MonthlyReport[]
}) {
    const [rangeFilter, setRangeFilter] = useState<HifzRangeFilter>('this_month')
    const isHafiz = report?.is_hafiz ?? false
    const allWeeks = report?.weekly ?? []
    const visibleWeeks = getFilteredWeeks(allWeeks, rangeFilter)
    const activeSummary = rangeFilter === 'this_month'
        ? report?.summary
        : filterSummary(allWeeks, rangeFilter)

    const RANGE_OPTS: { key: HifzRangeFilter; label: string }[] = [
        { key: 'this_week', label: 'This Week' },
        { key: 'last_week', label: 'Last Week' },
        { key: 'this_month', label: 'This Month' },
        { key: 'year_summary', label: 'Year Summary' },
    ]

    return (
        <div className="space-y-5">
            {/* ── Filter bar ── */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm w-full sm:flex sm:w-auto sm:items-center sm:gap-1.5">
                    {RANGE_OPTS.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setRangeFilter(opt.key)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all w-full text-center sm:w-auto ${
                                rangeFilter === opt.key
                                    ? 'bg-indigo-600 text-white shadow'
                                    : 'text-slate-500 hover:bg-slate-100'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                    <Badge variant="outline" className="text-xs">{formatMonth(report?.month)}</Badge>
                    {isHafiz && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                            ✦ Hafiz
                        </span>
                    )}
                </div>
            </div>

            {/* ── Year Summary view ── */}
            {rangeFilter === 'year_summary' ? (
                <Card className="rounded-xl border-slate-200">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Year Summary</CardTitle>
                        <p className="text-xs text-slate-500">Available monthly hifz data</p>
                    </CardHeader>
                    <CardContent>
                        {monthlyReports.length ? (
                            <div className="overflow-x-auto">
                                <table className="min-w-[600px] w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs uppercase text-slate-500">
                                            <th className="px-3 py-2">Month</th>
                                            {isHafiz ? (
                                                <>
                                                    <th className="px-3 py-2 text-right">New Rev (juz)</th>
                                                    <th className="px-3 py-2 text-right">Old Rev (juz)</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="px-3 py-2 text-right">New (pages)</th>
                                                    <th className="px-3 py-2 text-right">Recent (pages)</th>
                                                    <th className="px-3 py-2 text-right">Juz Rev</th>
                                                </>
                                            )}
                                            <th className="px-3 py-2 text-right">Attendance</th>
                                            <th className="px-3 py-2 text-right">Grade</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthlyReports.map((r) => (
                                            <tr key={r.report_month} className="border-b last:border-0 hover:bg-slate-50">
                                                <td className="px-3 py-2.5 font-semibold">{formatMonth(r.report_month)}</td>
                                                {isHafiz ? (
                                                    <>
                                                        <td className="px-3 py-2.5 text-right">{r.juz_revision ?? "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{r.recent_pages ?? "-"}</td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="px-3 py-2.5 text-right text-indigo-700 font-medium">{r.hifz_pages ?? "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{r.recent_pages ?? "-"}</td>
                                                        <td className="px-3 py-2.5 text-right">{r.juz_revision ?? "-"}</td>
                                                    </>
                                                )}
                                                <td className="px-3 py-2.5 text-right">{r.attendance ?? "-"}</td>
                                                <td className="px-3 py-2.5 text-right font-bold">{r.grade ?? "-"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="py-8 text-center text-sm text-slate-500">No historical report data available.</p>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* ── Desktop two-column layout: Stats sidebar + Weekly table ── */}
                    <div className="grid gap-5 md:grid-cols-[260px_1fr] lg:grid-cols-[280px_1fr] items-start">
                        {/* ── Left: stat cards ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-col gap-4">
                            <Card className="rounded-xl border-slate-200">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                                        {rangeFilter === 'this_week' ? 'This Week' : rangeFilter === 'last_week' ? 'Last Week' : 'This Month'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {isHafiz ? (
                                        <>
                                            <StatRow label="New Revision" arabic="مراجعة جديدة" value={valueText(activeSummary?.new_revision, " juz")} color="text-emerald-600" />
                                            <StatRow label="Old Revision" arabic="مراجعة قديمة" value={valueText(activeSummary?.old_revision, " juz")} color="text-amber-600" />
                                            <div className="border-t pt-3">
                                                <StatRow label="Total Revised" value={
                                                    valueText(
                                                        activeSummary ? Number(((activeSummary.new_revision || 0) + (activeSummary.old_revision || 0)).toFixed(2)) : null,
                                                        " juz"
                                                    )
                                                } color="text-slate-900" bold />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <StatRow label="New Verses" arabic="حفظ يومي" value={valueText(activeSummary?.new_pages, " pages")} color="text-indigo-600" />
                                            <StatRow label="Recent Revision" arabic="تسميع" value={valueText(activeSummary?.recent_pages, " pages")} color="text-violet-600" />
                                            <StatRow label="Juz Revision" arabic="مراجعة" value={valueText(activeSummary?.juz_revision, " juz")} color="text-sky-600" />
                                        </>
                                    )}
                                </CardContent>
                            </Card>

                            {report?.summary.grade && (
                                <Card className="rounded-xl border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
                                    <CardContent className="flex flex-col items-center py-5">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Monthly Grade</p>
                                        <p className="mt-1 text-5xl font-black text-indigo-700">{report.summary.grade}</p>
                                        {report.summary.percentage != null && (
                                            <p className="mt-1 text-sm text-slate-500">{report.summary.percentage}%</p>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* ── Right: Weekly breakdown ── */}
                        <div className="space-y-4">
                            {visibleWeeks.length ? visibleWeeks.map((week) => (
                                <div key={week.week} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                                    {/* Week header */}
                                    <div className="flex flex-col gap-1 border-b bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-sm font-bold text-slate-700">Week {week.week}</span>
                                        <span className="text-xs text-slate-400">
                                            {week.days[0]?.date && week.days[week.days.length - 1]?.date &&
                                                `${formatDate(week.days[0].date)} – ${formatDate(week.days[week.days.length - 1].date)}`}
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        {isHafiz ? (
                                            <table className="w-full table-fixed text-xs sm:min-w-[560px] sm:text-sm">
                                                <thead>
                                                    <tr className="border-b bg-slate-50/50 text-left text-xs font-semibold text-slate-500">
                                                        <th className="w-[34%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-44 sm:px-4">Date</th>
                                                        <th className="w-[33%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-auto sm:px-4">
                                                            New Revision <span className="font-normal normal-case text-slate-300">مراجعة جديدة</span>
                                                        </th>
                                                        <th className="w-[33%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-auto sm:px-4">
                                                            Old Revision <span className="font-normal normal-case text-slate-300">مراجعة قديمة</span>
                                                        </th>
                                                        <th className="hidden px-4 py-3 font-semibold uppercase tracking-wide sm:table-cell">Recorded by</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {week.days.map((day) => {
                                                        const hasEntry = day.new_revision.length > 0 || day.old_revision.length > 0
                                                        return (
                                                            <tr key={day.date} className={`border-t transition-colors ${
                                                                hasEntry ? 'hover:bg-slate-50' : 'opacity-50'
                                                            }`}>
                                                                <td className="px-3 py-3 sm:px-4">
                                                                    <span className="font-bold text-slate-800">{formatDate(day.date)}</span>
                                                                    <span className="ml-1.5 text-xs font-medium text-slate-400">{day.day}</span>
                                                                </td>
                                                                <td className="px-3 py-3 text-emerald-700 sm:px-4">{joinEntries(day.new_revision) || <span className="text-slate-300">–</span>}</td>
                                                                <td className="px-3 py-3 text-amber-700 sm:px-4">{joinEntries(day.old_revision) || <span className="text-slate-300">–</span>}</td>
                                                                <td className="hidden px-4 py-3 sm:table-cell">
                                                                    {day.recorded_by?.length ? (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                                            {day.recorded_by.join(', ')}
                                                                        </span>
                                                                    ) : <span className="text-slate-300">–</span>}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                    <tr className="border-t bg-indigo-50 font-bold text-sm">
                                                        <td className="px-3 py-2.5 text-indigo-800 sm:px-4">Week Total</td>
                                                        <td className="px-3 py-2.5 text-emerald-700 sm:px-4">{week.summary.new_revision} juz</td>
                                                        <td className="px-3 py-2.5 text-amber-700 sm:px-4">{week.summary.old_revision} juz</td>
                                                        <td className="hidden px-4 py-2.5 sm:table-cell" />
                                                    </tr>
                                                </tbody>
                                            </table>
                                        ) : (
                                            <table className="w-full table-fixed text-xs sm:min-w-[640px] sm:text-sm">
                                                <thead>
                                                    <tr className="border-b bg-slate-50/50 text-left text-xs font-semibold text-slate-500">
                                                        <th className="w-[30%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-44 sm:px-4">Date</th>
                                                        <th className="w-[23.33%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-auto sm:px-4">
                                                            New Verses <span className="font-normal normal-case text-slate-300">حفظ يومي</span>
                                                        </th>
                                                        <th className="w-[23.33%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-auto sm:px-4">
                                                            Recent Rev <span className="font-normal normal-case text-slate-300">تسميع</span>
                                                        </th>
                                                        <th className="w-[23.33%] px-3 py-3 font-semibold uppercase tracking-wide sm:w-auto sm:px-4">
                                                            Juz Rev <span className="font-normal normal-case text-slate-300">مراجعة</span>
                                                        </th>
                                                        <th className="hidden px-4 py-3 font-semibold uppercase tracking-wide sm:table-cell">Recorded by</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {week.days.map((day) => {
                                                        const hasEntry = day.new_verses.length > 0 || day.recent_revision.length > 0 || day.juz_revision.length > 0
                                                        return (
                                                            <tr key={day.date} className={`border-t transition-colors ${
                                                                hasEntry ? 'hover:bg-slate-50' : 'opacity-50'
                                                            }`}>
                                                                <td className="px-3 py-3 sm:px-4">
                                                                    <span className="font-bold text-slate-800">{formatDate(day.date)}</span>
                                                                    <span className="ml-1.5 text-xs font-medium text-slate-400">{day.day}</span>
                                                                </td>
                                                                <td className="px-3 py-3 text-indigo-700 sm:px-4">{joinEntries(day.new_verses) || <span className="text-slate-300">–</span>}</td>
                                                                <td className="px-3 py-3 text-violet-700 sm:px-4">{joinEntries(day.recent_revision) || <span className="text-slate-300">–</span>}</td>
                                                                <td className="px-3 py-3 text-sky-700 sm:px-4">{joinEntries(day.juz_revision) || <span className="text-slate-300">–</span>}</td>
                                                                <td className="hidden px-4 py-3 sm:table-cell">
                                                                    {day.recorded_by?.length ? (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                                            {day.recorded_by.join(', ')}
                                                                        </span>
                                                                    ) : <span className="text-slate-300">–</span>}
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                    <tr className="border-t bg-indigo-50 font-bold text-sm">
                                                        <td className="px-3 py-2.5 text-indigo-800 sm:px-4">Week Total</td>
                                                        <td className="px-3 py-2.5 text-indigo-700 sm:px-4">{week.summary.new_pages} pages</td>
                                                        <td className="px-3 py-2.5 text-violet-700 sm:px-4">
                                                            {week.summary.recent_pages ? `${week.summary.recent_pages} pages` : `${week.summary.recent_days} days`}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-sky-700 sm:px-4">{week.summary.juz_revision} juz</td>
                                                        <td className="hidden px-4 py-2.5 sm:table-cell" />
                                                    </tr>
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-sm text-slate-400">
                                    No hifz report data for the selected period.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Recent log entries ── */}
                    <Card className="rounded-xl border-slate-200">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Recent Hifz Entries</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {logs.length ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full table-fixed text-xs sm:min-w-[480px] sm:text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-xs uppercase text-slate-400">
                                                <th className="w-[32%] px-3 py-2 font-semibold sm:w-auto">Date</th>
                                                <th className="w-[26%] px-3 py-2 font-semibold sm:w-auto">Mode</th>
                                                <th className="w-[42%] px-3 py-2 font-semibold sm:w-auto">Details</th>
                                                <th className="hidden px-3 py-2 font-semibold sm:table-cell">Recorded by</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logs.slice(0, 10).map((log) => (
                                                <tr key={log.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                                                    <td className="px-3 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{formatDate(log.entry_date)}</td>
                                                    <td className="hidden px-3 py-2.5 sm:table-cell">
                                                        <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                                            {log.mode}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-slate-600">{formatLogDetail(log)}</td>
                                                    <td className="px-3 py-2.5">
                                                        {log.usthad_name ? (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                                {log.usthad_name}
                                                            </span>
                                                        ) : <span className="text-slate-300">–</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="py-8 text-center text-sm text-slate-500">No hifz records found.</p>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}

function StatRow({
    label, arabic, value, color, bold
}: {
    label: string
    arabic?: string
    value: string
    color?: string
    bold?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-2">
            <div>
                <p className={`text-sm font-semibold ${bold ? 'text-slate-900' : 'text-slate-600'}`}>{label}</p>
                {arabic && <p className="text-[10px] text-slate-400" dir="rtl">{arabic}</p>}
            </div>
            <p className={`text-sm font-bold ${color ?? 'text-slate-700'}`}>{value}</p>
        </div>
    )
}

function ExamsPanel({ exams }: { exams: ExamReport[] }) {
    return (
        <Card className="rounded-lg border-slate-200">
            <CardHeader className="pb-3">
                <CardTitle className="text-base">Exam Marks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {exams.length ? exams.map((exam) => (
                    <div key={exam.id} className="overflow-hidden rounded-lg border border-slate-200">
                        <div className="flex flex-col gap-2 bg-slate-950 px-4 py-3 text-white md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="font-black">{exam.title}</p>
                                <p className="text-xs text-slate-300">{exam.department || exam.type || "Exam"} - {formatDate(exam.start_date)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge className="bg-white text-slate-950 hover:bg-white">{exam.total_obtained}/{exam.total_max}</Badge>
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{exam.percentage}%</Badge>
                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{exam.grade}</Badge>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-[760px] w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                                        <th className="px-3 py-2">Subject</th>
                                        <th className="px-3 py-2 text-right">Marks</th>
                                        <th className="px-3 py-2 text-right">Max</th>
                                        <th className="px-3 py-2 text-right">Percent</th>
                                        <th className="px-3 py-2">Remarks</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {exam.subjects.map((subject) => (
                                        <tr key={subject.subject_id} className="border-t">
                                            <td className="px-3 py-2 font-bold">{subject.subject}</td>
                                            <td className="px-3 py-2 text-right">{subject.marks_obtained}</td>
                                            <td className="px-3 py-2 text-right">{subject.max_marks}</td>
                                            <td className="px-3 py-2 text-right font-black">{subject.percentage}%</td>
                                            <td className="px-3 py-2 text-slate-500">{subject.remarks || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )) : (
                    <p className="py-8 text-center text-sm text-slate-500">No exam marks found.</p>
                )}
            </CardContent>
        </Card>
    )
}

function ReportPanel({ data, attendancePercent, totalClasses, isHafiz }: {
    data: ParentDashboardData
    attendancePercent: number
    totalClasses: number
    isHafiz: boolean
}) {
    const hifz = data.hifz_report?.summary
    const latestExam = data.exams[0]

    return (
        <section className="report-page overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="bg-[#17255f] px-6 py-6 text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-black tracking-normal text-yellow-300">Ma&apos;din Ribathul Quran</h2>
                        <p className="mt-1 text-lg font-bold">Parent Progress Report</p>
                    </div>
                    <p className="text-sm text-blue-100">{formatMonth(data.period.month)}</p>
                </div>
            </div>

            <div className="space-y-6 p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                    <ReportField label="Name of Student" value={data.student.name} />
                    <ReportField label="Admission No." value={data.student.adm_no} />
                    <ReportField label="Standard" value={data.student.hifz_standard || data.student.standard || "-"} />
                    <ReportField label="Hifz Mentor" value={data.student.hifz_mentor || "Unassigned"} />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <ReportBox label="Attendance" value={`${attendancePercent}%`} detail={`${data.attendance?.attendedClasses || 0}/${totalClasses} attended`} />
                    <ReportBox label="Hifz Grade" value={hifz?.grade || "-"} detail={`${valueText(hifz?.total_recited)} total recited`} />
                    <ReportBox label="Exam" value={latestExam ? `${latestExam.percentage}%` : "-"} detail={latestExam?.title || "No marks"} />
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-[680px] w-full border text-sm">
                        <thead>
                            <tr className="bg-[#17255f] text-left text-white">
                                <th className="px-3 py-2">Area</th>
                                <th className="px-3 py-2">Result</th>
                                <th className="px-3 py-2">Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            <ReportRow area="Attendance" result={`${attendancePercent}%`} details={`${data.attendance?.attendedClasses || 0} attended, ${data.attendance?.notAttendedClasses || 0} not attended`} />
                            {isHafiz ? (
                                <>
                                    <ReportRow area="New revision" result={valueText(hifz?.new_revision, " juz")} details="Monthly total" />
                                    <ReportRow area="Old revision" result={valueText(hifz?.old_revision, " juz")} details="Monthly total" />
                                </>
                            ) : (
                                <>
                                    <ReportRow area="New verses" result={valueText(hifz?.new_pages, " pages")} details="Monthly total" />
                                    <ReportRow area="Recent revision" result={valueText(hifz?.recent_pages, " pages")} details={`${hifz?.recent_days || 0} days`} />
                                    <ReportRow area="Juz revision" result={valueText(hifz?.juz_revision, " juz")} details={`New ${hifz?.new_revision || 0}, Old ${hifz?.old_revision || 0}`} />
                                </>
                            )}
                            <ReportRow area="Exam marks" result={latestExam ? `${latestExam.total_obtained}/${latestExam.total_max}` : "-"} details={latestExam ? `${latestExam.title}, Grade ${latestExam.grade}` : "No exam marks"} />
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    )
}

function joinEntries(entries: string[]) {
    return entries.length ? entries.join(", ") : <span className="text-slate-300">-</span>
}

function InfoTile({ icon: Icon, label, value }: {
    icon: LucideIcon
    label: string
    value: string
}) {
    return (
        <div className="min-w-0 rounded-[24px] border border-white/80 bg-white p-4 shadow-sm shadow-blue-100/60">
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </div>
            <p className="truncate text-sm font-black text-slate-950">{value}</p>
        </div>
    )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: {
    icon: LucideIcon
    label: string
    value: string
    detail: string
    tone: "sky" | "emerald" | "amber" | "violet"
}) {
    const toneClass = {
        sky: "border-sky-100 bg-gradient-to-br from-sky-50 to-white text-sky-700",
        emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white text-emerald-700",
        amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-white text-amber-700",
        violet: "border-violet-100 bg-gradient-to-br from-violet-50 to-white text-violet-700",
    }[tone]

    return (
        <div className={`min-h-[132px] rounded-[26px] border p-5 shadow-sm shadow-blue-100/60 sm:min-h-[144px] ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm font-bold leading-tight">{label}</p>
                <Icon className="h-5 w-5 shrink-0" />
            </div>
            <p className="mt-4 break-words text-2xl font-black leading-none tracking-normal sm:text-3xl">{value}</p>
            <p className="mt-2 line-clamp-2 text-xs leading-snug opacity-80">{detail}</p>
        </div>
    )
}

function CountRow({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm shadow-blue-50">
            <span className="text-sm font-medium text-slate-600">{label}</span>
            <span className="text-lg font-black text-slate-950">{value}</span>
        </div>
    )
}

function MiniStat({ label, value }: { label: string; value: string | number | ReactNode }) {
    return (
        <div className="rounded-2xl bg-slate-50 px-3 py-3 shadow-sm shadow-blue-50">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
        </div>
    )
}

function ReportField({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid grid-cols-[150px_1fr] overflow-hidden rounded border border-slate-300 text-sm">
            <div className="bg-[#17255f] px-3 py-2 font-bold text-white">{label}</div>
            <div className="px-3 py-2">{value}</div>
        </div>
    )
}

function ReportBox({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="rounded bg-blue-50 p-4">
            <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#17255f]">{value}</p>
            <p className="mt-1 text-xs text-slate-600">{detail}</p>
        </div>
    )
}

function ReportRow({ area, result, details }: { area: string; result: string; details: string }) {
    return (
        <tr className="border-t">
            <td className="px-3 py-2 font-bold">{area}</td>
            <td className="px-3 py-2">{result}</td>
            <td className="px-3 py-2 text-slate-600">{details}</td>
        </tr>
    )
}

const printStyles = `
    .print-only {
        display: none;
    }

    .tab-scroll {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    .tab-scroll::-webkit-scrollbar {
        display: none;
    }

    @media print {
        body {
            background: white !important;
        }

        .no-print {
            display: none !important;
        }

        .print-only {
            display: block !important;
        }

        .parent-portal {
            background: white !important;
            padding: 0 !important;
        }

        .parent-shell {
            max-width: none !important;
            padding-bottom: 0 !important;
        }

        .report-root {
            box-shadow: none !important;
            border: 0 !important;
            margin-bottom: 12px !important;
        }

        .report-page {
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            break-inside: avoid;
        }

        @page {
            size: A4;
            margin: 14mm;
        }
    }
`
