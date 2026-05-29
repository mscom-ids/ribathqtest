"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
    BarChart3,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    DoorOpen,
    GraduationCap,
    LayoutDashboard,
    Loader2,
    LogOut,
    Search,
    UserRound,
    Users,
    X,
    TrendingUp,
    Bell,
    Shield,
} from "lucide-react"
import {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"
import Cookies from "js-cookie"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import api from "@/lib/api"
import { resolveBackendUrl } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type Student = {
    adm_no: string
    name: string
    standard?: string | null
    batch_year?: string | null
    photo_url?: string | null
    status?: string | null
    hifz_mentor?: { name?: string } | string | null
    school_mentor?: { name?: string } | string | null
    madrasa_mentor?: { name?: string } | string | null
    hifz_mentor_id?: string | null
    school_mentor_id?: string | null
    madrasa_mentor_id?: string | null
}

type AttendanceTotals = {
    effectiveClasses?: number
    plannedClasses?: number
    attendedClasses?: number
    notAttendedClasses?: number
    presentClasses?: number
    absentClasses?: number
    lateClasses?: number
    leaveClasses?: number
    attendanceLabel?: string
}

type HifzLog = {
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

type StudentProgress = {
    student: Student
    attendance_totals: AttendanceTotals | null
    period_logs: HifzLog[]
    hifz_logs_agg: { mode: string; entry_count: number; pages_recited?: number; verses_recited?: number }[]
    revision_days: number
}

type ExamSummary = {
    id: string
    title: string
    department?: string
    start_date?: string
    total: number
    max: number
    percentage: number
    subjects: { name: string; marks: number; max: number; remarks?: string | null }[]
}

type MentorReport = {
    id: string
    name: string
    role?: string
    attendance?: {
        marking_percentage?: number
        marked_classes?: number
        required_classes?: number
        not_marked_classes?: number
    }
}

type OutsideStudent = {
    student_id?: string
    adm_no?: string
    name?: string
    student_name?: string
    leave_type?: string
    reason_category?: string
    end_datetime?: string
}

type LeaveRecord = {
    id: string
    is_group?: boolean
    reason_category?: string
    remarks?: string
    status?: string
    start_datetime?: string
    end_datetime?: string
    leave_type?: string
    companion_name?: string
    companion_relationship?: string
    student?: { name?: string; adm_no?: string; standard?: string }
}

type ViewKey = "overview" | "student" | "reports" | "leaves"
type RangeMode = "week" | "month" | "year" | "custom"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateKey(date: Date) {
    return date.toISOString().slice(0, 10)
}

function formatDate(value?: string | null) {
    if (!value) return "–"
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
    return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

function getRange(mode: RangeMode) {
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

function mentorName(value: Student["hifz_mentor"]) {
    if (!value) return "Unassigned"
    if (typeof value === "string") return value
    return value.name || "Unassigned"
}

function percent(part = 0, total = 0) {
    if (!total) return 0
    return Math.round((part / total) * 100)
}

function pagesFromLog(log: HifzLog) {
    const start = Number(log.start_page || 0)
    const end = Number(log.end_page || 0)
    if (start && end) return Math.max(0, end - start + 1)
    return start || end ? 1 : 0
}

function logDetail(log: HifzLog) {
    if (log.mode?.startsWith("Juz")) return `Juz ${log.juz_number || "–"} ${log.juz_portion || ""}`.trim()
    if (log.surah_name && log.start_v && log.end_v) return `${log.surah_name} ${log.start_v}–${log.end_v}`
    if (log.start_page || log.end_page) return `Pages ${log.start_page || "–"}–${log.end_page || log.start_page || "–"}`
    return "Recorded"
}

function weekLabel(dateValue: string, rangeStart: string) {
    const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`)
    const start = new Date(`${rangeStart}T00:00:00`)
    const diff = Math.max(0, Math.floor((date.getTime() - start.getTime()) / 86400000))
    return `W${Math.floor(diff / 7) + 1}`
}

function getModeColor(mode: string) {
    if (mode === "New Verses") return { bg: "bg-indigo-100 text-indigo-700", dot: "#6366f1" }
    if (mode === "Recent Revision") return { bg: "bg-emerald-100 text-emerald-700", dot: "#10b981" }
    if (mode?.startsWith("Juz")) return { bg: "bg-amber-100 text-amber-700", dot: "#f59e0b" }
    return { bg: "bg-slate-100 text-slate-600", dot: "#94a3b8" }
}

// ─── Circular Progress ────────────────────────────────────────────────────────

function CircularProgress({ value, size = 120, stroke = 10 }: { value: number; size?: number; stroke?: number }) {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const offset = circ - (value / 100) * circ
    const color = value >= 75 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444"

    return (
        <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease" }}
            />
        </svg>
    )
}

// ─── Nav Items ────────────────────────────────────────────────────────────────

const navItems: { key: ViewKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "student", label: "Student", icon: UserRound },
    { key: "reports", label: "Reports", icon: BarChart3 },
    { key: "leaves", label: "Leaves", icon: DoorOpen },
]

// ─── Custom Tooltip for Bar Chart ─────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs">
            <p className="font-bold text-slate-700 mb-1">{label}</p>
            {payload.map((p) => (
                <p key={p.name} style={{ color: p.color }} className="font-semibold">
                    {p.name}: {p.value}
                </p>
            ))}
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrincipalPortal() {
    const router = useRouter()
    const initialRange = useMemo(() => getRange("month"), [])
    const [view, setView] = useState<ViewKey>("overview")
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [rangeMode, setRangeMode] = useState<RangeMode>("month")
    const [startDate, setStartDate] = useState(initialRange.start)
    const [endDate, setEndDate] = useState(initialRange.end)
    const [students, setStudents] = useState<Student[]>([])
    const [selectedId, setSelectedId] = useState("")
    const [search, setSearch] = useState("")
    const [showDropdown, setShowDropdown] = useState(false)
    const [progress, setProgress] = useState<StudentProgress | null>(null)
    const [exams, setExams] = useState<ExamSummary[]>([])
    const [mentors, setMentors] = useState<MentorReport[]>([])
    const [outsideStudents, setOutsideStudents] = useState<OutsideStudent[]>([])
    const [staff, setStaff] = useState<{ id: string; name: string }[]>([])
    const [loading, setLoading] = useState(true)
    const [detailLoading, setDetailLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const searchRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // ── Leaves tab state ──────────────────────────────────────────────────────
    const [leaveStudentId, setLeaveStudentId] = useState("")
    const [leaveSearch, setLeaveSearch] = useState("")
    const [leaveShowDropdown, setLeaveShowDropdown] = useState(false)
    const [leaveHistory, setLeaveHistory] = useState<LeaveRecord[]>([])
    const [leaveHistoryLoading, setLeaveHistoryLoading] = useState(false)
    const leaveSearchRef = useRef<HTMLInputElement>(null)
    const leaveDropdownRef = useRef<HTMLDivElement>(null)

    const leaveSelectedStudent = useMemo(
        () => students.find((s) => s.adm_no === leaveStudentId) ?? null,
        [leaveStudentId, students]
    )

    const leaveFilteredStudents = useMemo(() => {
        const q = leaveSearch.trim().toLowerCase()
        if (!q) return students
        return students.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.adm_no.toLowerCase().includes(q) ||
                String(s.standard || "").toLowerCase().includes(q)
        )
    }, [leaveSearch, students])

    const selectedStudent = useMemo(() => {
        // Prefer progress.student (full API response) for mentor data;
        // fall back to light list entry for name/class during loading.
        const listStudent = students.find((s) => s.adm_no === selectedId) ?? null
        const progressStudent = progress?.student?.adm_no === selectedId ? progress.student : null
        if (!listStudent && !progressStudent) return null
        // Merge: list fields first, then override with richer progress fields
        return { ...listStudent, ...progressStudent } as Student
    }, [progress?.student, selectedId, students])

    const filteredStudents = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return students
        return students.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.adm_no.toLowerCase().includes(q) ||
                String(s.standard || "").toLowerCase().includes(q)
        )
    }, [search, students])

    const attendance = progress?.attendance_totals
    const attendancePercent = percent(attendance?.attendedClasses, attendance?.effectiveClasses)

    const hifzChartData = useMemo(() => {
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
    }, [progress?.period_logs, startDate])

    const hifzTotals = useMemo(() => {
        return (progress?.period_logs || []).reduce(
            (acc, log) => {
                if (log.mode === "New Verses") acc.newPages += pagesFromLog(log)
                else if (log.mode === "Recent Revision") acc.recent += 1
                else if (log.mode?.startsWith("Juz")) acc.juz += 1
                return acc
            },
            { newPages: 0, recent: 0, juz: 0 }
        )
    }, [progress?.period_logs])

    async function loadInitial() {
        setLoading(true)
        setError(null)
        try {
            const [studentsRes, leaveRes, mentorRes, staffRes] = await Promise.allSettled([
                api.get("/students", { params: { light: "true", status: "active", limit: 500, offset: 0, sort: "name" } }),
                api.get("/leaves/outside-students"),
                api.get("/reports/mentors", { params: { start_date: startDate, end_date: endDate } }),
                api.get("/staff"),
            ])
            if (studentsRes.status === "fulfilled" && studentsRes.value.data?.success) {
                const rows = studentsRes.value.data.students || []
                setStudents(rows)
                if (!selectedId && rows[0]) setSelectedId(rows[0].adm_no)
            }
            if (leaveRes.status === "fulfilled") {
                setOutsideStudents(leaveRes.value.data?.students || leaveRes.value.data?.data || [])
            }
            if (mentorRes.status === "fulfilled") {
                setMentors(mentorRes.value.data?.data || [])
            }
            if (staffRes.status === "fulfilled" && staffRes.value.data?.success) {
                setStaff(staffRes.value.data.staff || [])
            }
        } catch {
            setError("Unable to load principal portal")
        } finally {
            setLoading(false)
        }
    }

    const resolveMentorName = (mentorId: string | null | undefined) => {
        if (!mentorId) return "Unassigned"
        const found = staff.find((s) => s.id === mentorId)
        return found ? found.name : "Unassigned"
    }

    const getHifzMentor = () => {
        if (selectedStudent?.hifz_mentor_id) {
            const resolved = resolveMentorName(selectedStudent.hifz_mentor_id)
            if (resolved !== "Unassigned") return resolved
        }
        const val = selectedStudent?.hifz_mentor
        if (!val) return "Unassigned"
        if (typeof val === "string") return val
        return val.name || "Unassigned"
    }

    const getSchoolMentor = () => {
        if (selectedStudent?.school_mentor_id) {
            const resolved = resolveMentorName(selectedStudent.school_mentor_id)
            if (resolved !== "Unassigned") return resolved
        }
        const val = selectedStudent?.school_mentor
        if (!val) return "Unassigned"
        if (typeof val === "string") return val
        return val.name || "Unassigned"
    }

    const getMadrasaMentor = () => {
        if (selectedStudent?.madrasa_mentor_id) {
            const resolved = resolveMentorName(selectedStudent.madrasa_mentor_id)
            if (resolved !== "Unassigned") return resolved
        }
        const val = selectedStudent?.madrasa_mentor
        if (!val) return "Unassigned"
        if (typeof val === "string") return val
        return val.name || "Unassigned"
    }

    function scrollToSection(id: string) {
        setView(id as ViewKey)
        const el = document.getElementById(id)
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" })
        }
    }

    async function loadStudentDetails(studentId: string) {
        if (!studentId) return
        setDetailLoading(true)
        setError(null)
        try {
            const reportRes = await api.get("/reports/student-progress", {
                params: { student_id: studentId, type: "Range", start_date: startDate, end_date: endDate },
            })
            if (reportRes.data?.success) setProgress(reportRes.data.data)

            const examsRes = await api.get("/exams")
            const examRows = (examsRes.data?.exams || []).slice(0, 8)
            const summaries = await Promise.all(
                examRows.map(async (exam: { id: string; title: string; department?: string; start_date?: string }) => {
                    const [details, marks] = await Promise.all([
                        api.get(`/exams/${exam.id}`),
                        api.get(`/exams/${exam.id}/marks`),
                    ])
                    const subjectById = new Map<string, { name: string; max_marks: number }>()
                    for (const subject of details.data?.subjects || []) {
                        subjectById.set(subject.id, { name: subject.name, max_marks: Number(subject.max_marks || 0) })
                    }
                    const subjectMarks: { name: string; marks: number; max: number; remarks?: string | null }[] = (
                        marks.data?.marks || []
                    )
                        .filter((m: { student_id: string }) => m.student_id === studentId)
                        .map((m: { subject_id: string; marks_obtained: number; remarks?: string | null }) => {
                            const sub = subjectById.get(m.subject_id)
                            return { name: sub?.name || "Subject", marks: Number(m.marks_obtained || 0), max: Number(sub?.max_marks || 0), remarks: m.remarks }
                        })
                    const total = subjectMarks.reduce((s, i) => s + i.marks, 0)
                    const max = subjectMarks.reduce((s, i) => s + i.max, 0)
                    return {
                        id: exam.id, title: exam.title, department: exam.department, start_date: exam.start_date,
                        total, max, percentage: max ? Math.round((total / max) * 100) : 0, subjects: subjectMarks,
                    }
                })
            )
            setExams(summaries.filter((e) => e.subjects.length > 0))
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unable to load student details"
            setError(message)
        } finally {
            setDetailLoading(false)
        }
    }

    useEffect(() => { loadInitial() }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (selectedId) loadStudentDetails(selectedId)
    }, [selectedId, startDate, endDate]) // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll tracking observer to dynamically highlight current section in navigation
    useEffect(() => {
        const handleScroll = () => {
            const sections = ["overview", "student", "leaves", "reports"]
            let current = "overview"
            for (const section of sections) {
                const el = document.getElementById(section)
                if (el) {
                    const rect = el.getBoundingClientRect()
                    if (rect.top <= 180) {
                        current = section
                    }
                }
            }
            setView(current as ViewKey)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    // Close student dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [])

    // Close leave dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                leaveDropdownRef.current &&
                !leaveDropdownRef.current.contains(e.target as Node)
            ) {
                setLeaveShowDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClick)
        return () => document.removeEventListener("mousedown", handleClick)
    }, [])

    async function loadStudentLeaveHistory(admNo: string) {
        if (!admNo) return
        setLeaveHistoryLoading(true)
        try {
            const res = await api.get("/leaves/personal", {
                params: { student_id: admNo, limit: 100 }
            })
            const all: LeaveRecord[] = res.data?.leaves || []
            // Filter client-side by adm_no in case backend doesn't support student_id param
            setLeaveHistory(all.filter(l =>
                !l.student || l.student.adm_no === admNo
            ))
        } catch {
            setLeaveHistory([])
        } finally {
            setLeaveHistoryLoading(false)
        }
    }

    function selectLeaveStudent(admNo: string) {
        setLeaveStudentId(admNo)
        setLeaveShowDropdown(false)
        setLeaveSearch("")
        loadStudentLeaveHistory(admNo)
    }

    function setPreset(mode: RangeMode) {
        setRangeMode(mode)
        if (mode === "custom") return
        const next = getRange(mode)
        setStartDate(next.start)
        setEndDate(next.end)
    }

    function selectStudent(adm_no: string) {
        setSelectedId(adm_no)
        setShowDropdown(false)
        setSearch("")
        scrollToSection("student")
    }

    async function logout() {
        try { await api.post("/auth/logout") } catch {}
        localStorage.removeItem("auth_token")
        Cookies.remove("auth_token", { path: "/" })
        document.cookie = "auth_token=; path=/; max-age=0"
        router.push("/login")
    }

    // ── Loading state ────────────────────────────────────────────────────────

    if (loading) {
        return (
            <main className="min-h-screen bg-slate-950 grid place-items-center">
                <div className="flex flex-col items-center gap-4 text-white">
                    <div className="relative">
                        <div className="h-16 w-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.4)]">
                            <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
                        </div>
                        <div className="absolute -inset-2 rounded-3xl border border-indigo-500/30 animate-ping" />
                    </div>
                    <div className="text-center">
                        <p className="font-black text-lg">Principal Portal</p>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workspace...
                        </p>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* ── Left Sidebar — minimal, light, hidden on mobile ───────────── */}
            <aside
                style={{ width: sidebarOpen ? 200 : 60 }}
                className="hidden md:flex fixed inset-y-0 left-0 z-50 flex-col bg-white border-r border-slate-200 transition-all duration-300 ease-in-out"
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-3.5 py-4 border-b border-slate-100 min-h-[60px]">
                    <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                        <img src="/logo.png" alt="" className="h-4 w-4 object-contain" />
                    </div>
                    {sidebarOpen && (
                        <div className="overflow-hidden">
                            <p className="text-xs font-black text-slate-800 leading-tight whitespace-nowrap">Principal</p>
                            <p className="text-[10px] text-slate-400 font-medium whitespace-nowrap">Ribathul Quran</p>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 py-3 px-2 space-y-0.5">
                    {navItems.map((item) => {
                        const active = view === item.key
                        return (
                            <button
                                key={item.key}
                                onClick={() => scrollToSection(item.key)}
                                title={item.label}
                                className={`
                                    group relative flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2
                                    transition-all duration-150 text-sm font-semibold
                                    ${active
                                        ? "bg-slate-100 text-slate-900 border-l-2 border-indigo-600 rounded-l-none"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    }
                                `}
                            >
                                <item.icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-indigo-600" : "text-slate-400"}`} />
                                {sidebarOpen && <span className="whitespace-nowrap text-sm">{item.label}</span>}
                                {!sidebarOpen && (
                                    <span className="absolute left-full ml-2.5 px-2 py-1 rounded-md bg-slate-900 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                                        {item.label}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </nav>

                {/* Bottom: toggle + logout */}
                <div className="border-t border-slate-100 p-2 space-y-0.5">
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all text-sm"
                    >
                        <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform duration-300 ${sidebarOpen ? "rotate-180" : ""}`} />
                        {sidebarOpen && <span className="text-sm font-medium">Collapse</span>}
                    </button>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all text-sm"
                        title="Logout"
                    >
                        <LogOut className="h-4 w-4 flex-shrink-0" />
                        {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
                    </button>
                </div>
            </aside>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main
                className={`flex-1 min-h-screen flex flex-col transition-all duration-300 pl-0 md:pl-[60px] ${sidebarOpen ? "md:pl-[200px]" : ""}`}
            >

                {/* ── Top Header ──────────────────────────────────────────────── */}
                <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 px-4 md:px-6 py-3 flex items-center justify-between gap-3">
                    {/* Left: brand chip */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Mobile-only logo */}
                        <div className="flex md:hidden items-center justify-center h-8 w-8 rounded-xl bg-indigo-600">
                            <img src="/logo.png" alt="" className="h-5 w-5 object-contain" />
                        </div>
                        <div className="hidden sm:flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1.5">
                            <Shield className="h-3.5 w-3.5 text-indigo-600" />
                            <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">Oversight Mode</span>
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <button className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
                            <Bell className="h-5 w-5" />
                        </button>
                    </div>
                </header>

                {/* ── Content ──────────────────────────────────────────────────── */}
                <div className="flex-1 px-6 py-6 space-y-6 max-w-[1400px] w-full mx-auto">

                    {/* Hero Banner */}
                    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-6 md:p-8 text-white shadow-[0_20px_60px_rgba(15,23,42,0.3)]">
                        {/* Decorative elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                        <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-violet-600/15 rounded-full blur-3xl translate-y-1/2 pointer-events-none" />

                        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-5">
                            <div>
                                <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-bold tracking-widest uppercase text-indigo-200 mb-3">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Institution Overview
                                </div>
                                <h1 className="text-3xl md:text-4xl font-black leading-tight">
                                    Principal Workspace
                                </h1>
                                <p className="mt-2 text-slate-300 text-sm max-w-lg leading-relaxed">
                                    Student details, mentor reports, attendance, Hifz recitation, exams, and leave presence — all in one view.
                                </p>
                            </div>

                            {/* Date Range Controls */}
                            <div className="bg-white/10 border border-white/15 backdrop-blur-sm rounded-2xl p-3 flex-shrink-0">
                                <div className="grid grid-cols-4 gap-1 mb-2">
                                    {(["week", "month", "year", "custom"] as RangeMode[]).map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => setPreset(m)}
                                            className={`rounded-xl px-2.5 py-1.5 text-xs font-bold capitalize transition-all ${rangeMode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-300 hover:bg-white/15"}`}
                                        >
                                            {m === "year" ? "Jun–Apr" : m}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setRangeMode("custom") }}
                                        className="h-8 rounded-xl bg-white/90 text-slate-900 px-2 text-xs font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-400" />
                                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setRangeMode("custom") }}
                                        className="h-8 rounded-xl bg-white/90 text-slate-900 px-2 text-xs font-bold border-0 outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 flex items-center gap-2">
                            <X className="h-4 w-4" /> {error}
                        </div>
                    )}

                    {/* ── Section Tab Bar ────────────────────────────────────── */}
                    <div className="sticky top-[60px] z-30 flex gap-1.5 flex-wrap bg-slate-50/80 backdrop-blur-md py-3 border-b border-slate-200/50">
                        {navItems.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => scrollToSection(item.key)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                                    view === item.key
                                        ? "bg-slate-900 text-white shadow-sm"
                                        : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
                                }`}
                            >
                                <item.icon className="h-3.5 w-3.5" />
                                {item.label}
                            </button>
                        ))}
                    </div>

                    {/* ── OVERVIEW Section ────────────────────────────────────── */}
                    <div id="overview" className="scroll-mt-28 space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                icon={Users} label="Active Students" value={students.length}
                                gradient="from-blue-500 to-indigo-600" glow="rgba(99,102,241,0.3)"
                                sub="Total enrolled"
                            />
                            <StatCard
                                icon={DoorOpen} label="On Leave" value={outsideStudents.length}
                                gradient="from-amber-500 to-orange-500" glow="rgba(245,158,11,0.3)"
                                sub="Currently outside"
                            />
                            <StatCard
                                icon={TrendingUp} label="Attendance" value={`${attendancePercent}%`}
                                gradient="from-emerald-500 to-teal-500" glow="rgba(10,185,129,0.3)"
                                sub={`${attendance?.attendedClasses || 0}/${attendance?.effectiveClasses || 0} classes`}
                            />
                            <StatCard
                                icon={BookOpen} label="Hifz Logs" value={progress?.period_logs?.length || 0}
                                gradient="from-violet-500 to-purple-600" glow="rgba(139,92,246,0.3)"
                                sub="In selected range"
                            />
                        </div>
                    </div>

                    {/* ── Student Section ──────────────────────────────────────── */}
                    <div id="student" className="scroll-mt-28 space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                                    <UserRound className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-slate-800">Student Profile & Academic details</h2>
                                    <p className="text-xs text-slate-500 font-medium">Search a student to view their Hifz progress and exam marks</p>
                                </div>
                            </div>
                            
                            {/* Inline Student Search Combobox */}
                            <div className="relative w-full sm:max-w-xs" ref={dropdownRef}>
                                <button
                                    onClick={() => { setShowDropdown(true); setTimeout(() => searchRef.current?.focus(), 50) }}
                                    className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-indigo-300 px-3.5 py-2.5 text-left transition-all shadow-sm"
                                >
                                    {selectedStudent ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="h-6 w-6 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 font-black text-indigo-700 text-[10px]">
                                                {selectedStudent.name.slice(0, 2).toUpperCase()}
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 truncate">{selectedStudent.name}</p>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <Search className="h-4 w-4" />
                                            <span className="text-sm font-medium">Search student...</span>
                                        </div>
                                    )}
                                    <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                </button>
                                
                                {showDropdown && (
                                    <div className="absolute top-full right-0 left-0 sm:left-auto sm:w-80 mt-2 bg-white rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-50 overflow-hidden">
                                        <div className="p-2 border-b border-slate-100">
                                            <div className="relative">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                                <input
                                                    ref={searchRef}
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Name, adm no, class..."
                                                    className="w-full pl-8 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-medium"
                                                />
                                                {search && (
                                                    <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                        <X className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="max-h-56 overflow-y-auto">
                                            {filteredStudents.slice(0, 60).length === 0 ? (
                                                <div className="py-8 text-center text-sm text-slate-400 font-medium">No students found</div>
                                            ) : (
                                                filteredStudents.slice(0, 60).map((s) => (
                                                    <button
                                                        key={s.adm_no}
                                                        onClick={() => selectStudent(s.adm_no)}
                                                        className={`flex w-full items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors ${selectedId === s.adm_no ? "bg-indigo-50" : ""}`}
                                                    >
                                                        <Avatar className="h-8 w-8 flex-shrink-0">
                                                            <AvatarImage src={resolveBackendUrl(s.photo_url || undefined)} />
                                                            <AvatarFallback className="text-xs font-black bg-indigo-100 text-indigo-700">
                                                                {s.name.slice(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                                                            <p className="text-xs text-slate-500">{s.adm_no} · {s.standard || "–"}</p>
                                                        </div>
                                                        {selectedId === s.adm_no && (
                                                            <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                                                        )}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedStudent ? (
                            <div className="space-y-5">
                                {/* Student Profile Card */}
                                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 flex flex-col md:flex-row md:items-center gap-5">
                                    <div className="relative flex-shrink-0">
                                        <Avatar className="h-20 w-20 ring-4 ring-indigo-100 shadow-lg">
                                            <AvatarImage src={resolveBackendUrl(selectedStudent.photo_url || undefined)} />
                                            <AvatarFallback className="text-2xl font-black bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
                                                {selectedStudent.name.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        {detailLoading && (
                                            <div className="absolute inset-0 rounded-full flex items-center justify-center bg-white/70">
                                                <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div>
                                                <h2 className="text-xl font-black text-slate-900">{selectedStudent.name}</h2>
                                                <p className="text-sm font-semibold text-slate-500 mt-0.5">
                                                    {selectedStudent.adm_no} &middot; {selectedStudent.standard || "No class"} &middot; Batch {selectedStudent.batch_year || "–"}
                                                </p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-black ${
                                                (selectedStudent.status || "active") === "active"
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-slate-100 text-slate-600"
                                            }`}>
                                                {selectedStudent.status || "Active"}
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <MentorChip label="Hifz" value={getHifzMentor()} color="indigo" />
                                            <MentorChip label="School" value={getSchoolMentor()} color="emerald" />
                                            <MentorChip label="Madrasa" value={getMadrasaMentor()} color="amber" />
                                        </div>
                                    </div>
                                </div>

                            {/* Hifz + Attendance Row */}
                            <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
                                {/* Hifz Chart */}
                                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
                                                <BarChart3 className="h-4 w-4 text-violet-600" />
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-800">Hifz Recordings</p>
                                                <p className="text-xs text-slate-500 font-medium">By week · {formatDate(startDate)} – {formatDate(endDate)}</p>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Mini stats */}
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <MiniStat label="New Pages" value={hifzTotals.newPages} color="indigo" />
                                        <MiniStat label="Recent Rev." value={hifzTotals.recent} color="emerald" />
                                        <MiniStat label="Juz Rev." value={hifzTotals.juz} color="amber" />
                                    </div>
                                    <div className="h-56">
                                        {hifzChartData.length ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={hifzChartData} barGap={4}>
                                                    <defs>
                                                        <linearGradient id="gIndigo" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#6366f1" />
                                                            <stop offset="100%" stopColor="#818cf8" />
                                                        </linearGradient>
                                                        <linearGradient id="gEmerald" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#10b981" />
                                                            <stop offset="100%" stopColor="#34d399" />
                                                        </linearGradient>
                                                        <linearGradient id="gAmber" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#f59e0b" />
                                                            <stop offset="100%" stopColor="#fcd34d" />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="label" fontSize={11} tick={{ fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} />
                                                    <YAxis allowDecimals={false} fontSize={11} tick={{ fill: "#94a3b8", fontWeight: 700 }} axisLine={false} tickLine={false} width={30} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Bar dataKey="newPages" name="New Pages" fill="url(#gIndigo)" radius={[6, 6, 0, 0]} maxBarSize={20} />
                                                    <Bar dataKey="recent" name="Recent Revision" fill="url(#gEmerald)" radius={[6, 6, 0, 0]} maxBarSize={20} />
                                                    <Bar dataKey="juz" name="Juz Revision" fill="url(#gAmber)" radius={[6, 6, 0, 0]} maxBarSize={20} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <EmptyState text="No Hifz recordings in this date range." />
                                        )}
                                    </div>
                                </div>

                                {/* Attendance Ring */}
                                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <CalendarDays className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-800">Attendance</p>
                                            <p className="text-xs text-slate-500 font-medium">{attendance?.attendanceLabel || "This period"}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center py-2">
                                        <div className="relative">
                                            <CircularProgress value={attendancePercent} size={130} stroke={11} />
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-3xl font-black text-slate-900">{attendancePercent}%</span>
                                                <span className="text-[11px] text-slate-500 font-bold mt-0.5">Attendance</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-4">
                                        <AttCard label="Present" value={attendance?.presentClasses || 0} color="bg-emerald-500" />
                                        <AttCard label="Absent" value={attendance?.absentClasses || 0} color="bg-red-500" />
                                        <AttCard label="Late" value={attendance?.lateClasses || 0} color="bg-amber-500" />
                                        <AttCard label="Leave" value={attendance?.leaveClasses || 0} color="bg-blue-500" />
                                    </div>
                                </div>
                            </div>

                            {/* Recitation Records + Exam Marks */}
                            <div className="grid gap-5 xl:grid-cols-2">
                                {/* Recitation Timeline */}
                                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                                            <BookOpen className="h-4 w-4 text-blue-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-800">Recitation Records</p>
                                            <p className="text-xs text-slate-500 font-medium">Recent sessions</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        {(progress?.period_logs || []).slice(0, 8).length ? (
                                            (progress?.period_logs || []).slice(0, 8).map((log, i) => {
                                                const colors = getModeColor(log.mode)
                                                return (
                                                    <div key={log.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors group">
                                                        <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                                            <div className="h-2 w-2 rounded-full" style={{ background: colors.dot }} />
                                                            {i < 7 && <div className="w-px h-6 bg-slate-100" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${colors.bg}`}>
                                                                    {log.mode}
                                                                </span>
                                                                <span className="text-xs text-slate-400 font-medium">{formatDate(log.entry_date)}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-600 font-semibold mt-0.5 truncate">{logDetail(log)}</p>
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <EmptyState text="No recitation records for this range." />
                                        )}
                                    </div>
                                </div>

                                {/* Exam Marks */}
                                <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
                                            <GraduationCap className="h-4 w-4 text-amber-600" />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-800">Exam Results</p>
                                            <p className="text-xs text-slate-500 font-medium">All recorded exams</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                                        {exams.length ? (
                                            exams.map((exam) => {
                                                const pct = exam.percentage
                                                const pctColor = pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-600"
                                                const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"
                                                return (
                                                    <div key={exam.id} className="rounded-2xl border border-slate-100 p-3 hover:border-indigo-200 transition-colors">
                                                        <div className="flex items-start justify-between gap-2 mb-2">
                                                            <div className="min-w-0">
                                                                <p className="font-black text-slate-800 text-sm truncate">{exam.title}</p>
                                                                <p className="text-xs text-slate-500 font-medium">{exam.department || "Exam"} · {formatDate(exam.start_date)}</p>
                                                            </div>
                                                            <div className="flex-shrink-0 text-right">
                                                                <p className={`text-lg font-black ${pctColor}`}>{pct}%</p>
                                                                <p className="text-[10px] text-slate-400 font-bold">{exam.total}/{exam.max}</p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {exam.subjects.map((sub) => (
                                                                <div key={sub.name}>
                                                                    <div className="flex justify-between text-xs mb-0.5">
                                                                        <span className="font-semibold text-slate-600 truncate">{sub.name}</span>
                                                                        <span className="font-black text-slate-700 flex-shrink-0 ml-2">{sub.marks}/{sub.max}</span>
                                                                    </div>
                                                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                                        <div className={`h-full rounded-full ${barColor} transition-all duration-700`}
                                                                            style={{ width: `${sub.max ? Math.round((sub.marks / sub.max) * 100) : 0}%` }} />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <EmptyState text="No exam marks found for this student." />
                                        )}
                                    </div>
                                </div>
                            </div>
                            </div>
                        ) : (
                            <EmptyState text="Please search and select a student above to view details." />
                        )}
                    </div>

                    {/* ── Mentor Reports ───────────────────────────────────────── */}
                    <div id="reports" className="scroll-mt-28 space-y-5">
                        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                                        <ClipboardList className="h-4 w-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800">Mentor Reports</p>
                                        <p className="text-xs text-slate-500 font-medium">{formatDate(startDate)} – {formatDate(endDate)}</p>
                                    </div>
                                </div>
                                <div className="hidden sm:flex items-center gap-3 text-xs font-bold">
                                    <span className="flex items-center gap-1 text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ≥80%</span>
                                    <span className="flex items-center gap-1 text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-500" /> 60–79%</span>
                                    <span className="flex items-center gap-1 text-red-600"><span className="h-2 w-2 rounded-full bg-red-500" /> &lt;60%</span>
                                </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {[...mentors]
                                    .sort((a, b) => (b.attendance?.marking_percentage || 0) - (a.attendance?.marking_percentage || 0))
                                    .slice(0, 9)
                                    .map((mentor) => {
                                        const pct = mentor.attendance?.marking_percentage || 0
                                        const { ring, bar, badge } = pct >= 80
                                            ? { ring: "ring-emerald-200", bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" }
                                            : pct >= 60
                                                ? { ring: "ring-amber-200", bar: "bg-amber-500", badge: "bg-amber-100 text-amber-700" }
                                                : { ring: "ring-red-200", bar: "bg-red-500", badge: "bg-red-100 text-red-700" }
                                        return (
                                            <div key={mentor.id} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all">
                                                <div className={`h-11 w-11 flex-shrink-0 rounded-2xl ring-2 ${ring} flex items-center justify-center bg-slate-100 font-black text-slate-700 text-sm`}>
                                                    {mentor.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <p className="font-black text-sm text-slate-800 truncate">{mentor.name}</p>
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-black flex-shrink-0 ${badge}`}>{pct}%</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 font-semibold capitalize mb-1.5">{mentor.role || "Mentor"}</p>
                                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${bar} transition-all duration-700`}
                                                            style={{ width: `${Math.min(100, pct)}%` }} />
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                                                        {mentor.attendance?.marked_classes || 0}/{mentor.attendance?.required_classes || 0} classes marked
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                            </div>
                            {!mentors.length && <EmptyState text="No mentor data for this date range." />}
                        </div>
                    </div>

                    {/* ── Leaves Section ───────────────────────────────────────── */}
                    <div id="leaves" className="scroll-mt-28 space-y-5">

                            {/* Student Leave History Panel */}
                            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                {/* Header */}
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                                        <UserRound className="h-4 w-4 text-indigo-600" />
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800">Student Leave History</p>
                                        <p className="text-xs text-slate-500 font-medium">Search a student to view all their leave records</p>
                                    </div>
                                </div>

                                {/* Student Search Selector */}
                                <div className="relative mb-5" ref={leaveDropdownRef}>
                                    <button
                                        onClick={() => { setLeaveShowDropdown(true); setTimeout(() => leaveSearchRef.current?.focus(), 50) }}
                                        className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-indigo-300 px-4 py-3 text-left transition-all shadow-sm"
                                    >
                                        {leaveSelectedStudent ? (
                                            <>
                                                <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 font-black text-indigo-700 text-sm">
                                                    {leaveSelectedStudent.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-slate-800 truncate">{leaveSelectedStudent.name}</p>
                                                    <p className="text-[11px] text-slate-500 font-medium">{leaveSelectedStudent.adm_no} · {leaveSelectedStudent.standard || "–"}</p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                                <span className="text-sm text-slate-400 font-medium">Search student by name, adm no, or class…</span>
                                            </>
                                        )}
                                        <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                    </button>

                                    {leaveShowDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] z-50 overflow-hidden">
                                            <div className="p-2 border-b border-slate-100">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                                    <input
                                                        ref={leaveSearchRef}
                                                        value={leaveSearch}
                                                        onChange={(e) => setLeaveSearch(e.target.value)}
                                                        placeholder="Name, adm no, class…"
                                                        className="w-full pl-8 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-medium"
                                                    />
                                                    {leaveSearch && (
                                                        <button onClick={() => setLeaveSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="max-h-56 overflow-y-auto">
                                                {leaveFilteredStudents.length === 0 ? (
                                                    <div className="py-6 text-center text-sm text-slate-400 font-medium">No students found</div>
                                                ) : leaveFilteredStudents.slice(0, 60).map((s) => (
                                                    <button
                                                        key={s.adm_no}
                                                        onClick={() => selectLeaveStudent(s.adm_no)}
                                                        className={`flex w-full items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors ${leaveStudentId === s.adm_no ? "bg-indigo-50" : ""}`}
                                                    >
                                                        <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0 font-black text-slate-600 text-xs">
                                                            {s.name.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                                                            <p className="text-xs text-slate-500">{s.adm_no} · {s.standard || "–"}</p>
                                                        </div>
                                                        {leaveStudentId === s.adm_no && <CheckCircle2 className="h-4 w-4 text-indigo-600 flex-shrink-0" />}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-400 font-medium text-right">
                                                {leaveFilteredStudents.length} student{leaveFilteredStudents.length !== 1 ? "s" : ""}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Leave History Results */}
                                {!leaveStudentId && (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                                        <DoorOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                                        <p className="text-sm font-semibold text-slate-400">Select a student above to view their leave history</p>
                                    </div>
                                )}

                                {leaveStudentId && leaveHistoryLoading && (
                                    <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span className="text-sm font-medium">Loading leave history…</span>
                                    </div>
                                )}

                                {leaveStudentId && !leaveHistoryLoading && leaveHistory.length === 0 && (
                                    <EmptyState text="No leave records found for this student." />
                                )}

                                {leaveStudentId && !leaveHistoryLoading && leaveHistory.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-slate-500 mb-3">{leaveHistory.length} leave record{leaveHistory.length !== 1 ? "s" : ""} found</p>
                                        {leaveHistory.map((leave) => {
                                            const statusStyles: Record<string, string> = {
                                                outside: "bg-blue-100 text-blue-700",
                                                returned: "bg-emerald-100 text-emerald-700",
                                                pending: "bg-amber-100 text-amber-700",
                                            }
                                            const badge = statusStyles[leave.status || ""] || "bg-slate-100 text-slate-600"
                                            return (
                                                <div key={leave.id} className="flex items-start gap-3 p-4 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                                                    {/* Status dot */}
                                                    <div className={`mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                                                        leave.status === "outside" ? "bg-blue-500" :
                                                        leave.status === "returned" ? "bg-emerald-500" : "bg-amber-500"
                                                    }`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2 flex-wrap">
                                                            <p className="font-black text-sm text-slate-800">
                                                                {leave.reason_category || "Personal Leave"}
                                                            </p>
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black capitalize flex-shrink-0 ${badge}`}>
                                                                {leave.status || "pending"}
                                                            </span>
                                                        </div>
                                                        {leave.remarks && (
                                                            <p className="text-xs text-slate-500 italic mt-0.5">"{leave.remarks}"</p>
                                                        )}
                                                        <div className="flex items-center gap-4 mt-2 flex-wrap">
                                                            {leave.start_datetime && (
                                                                <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                                                    <CalendarDays className="h-3 w-3" />
                                                                    {formatDate(leave.start_datetime)}
                                                                    {leave.end_datetime && ` → ${formatDate(leave.end_datetime)}`}
                                                                </div>
                                                            )}
                                                            {leave.companion_name && (
                                                                <span className="text-[11px] text-slate-400 font-medium">
                                                                    With {leave.companion_name} ({leave.companion_relationship || "–"})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Currently on Leave Campus Panel */}
                            <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5">
                                <div className="flex items-center gap-2 mb-5">
                                    <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
                                        <DoorOpen className="h-4 w-4 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-800">Currently on Leave</p>
                                        <p className="text-xs text-slate-500 font-medium">{outsideStudents.length} student{outsideStudents.length !== 1 ? "s" : ""} outside campus right now</p>
                                    </div>
                                </div>
                                {outsideStudents.length ? (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                        {outsideStudents.map((s, i) => (
                                            <div key={`${s.student_id || s.adm_no || i}`}
                                                className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 hover:border-amber-200 hover:shadow-sm transition-all">
                                                <div className="h-10 w-10 flex-shrink-0 rounded-2xl bg-amber-100 flex items-center justify-center font-black text-amber-700 text-sm">
                                                    {(s.name || s.student_name || "S").slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-black text-sm text-slate-800 truncate">{s.name || s.student_name || s.student_id || "Student"}</p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold">
                                                            {s.leave_type || "Leave"}
                                                        </span>
                                                        {s.reason_category && (
                                                            <span className="text-[11px] text-slate-400 font-semibold">{s.reason_category}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {s.end_datetime && (
                                                    <div className="flex-shrink-0 text-right">
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Return</p>
                                                        <p className="text-xs font-black text-slate-700">{formatDate(s.end_datetime)}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState text="No students are currently marked outside campus." />
                                )}
                            </div>
                        </div>


                    {/* bottom spacing for mobile nav */}
                    <div className="h-24 md:h-4" />
                </div>
            </main>

            {/* ── Mobile Bottom Nav ────────────────────────────────── */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur-xl pb-safe shadow-[0_-10px_30px_rgba(15,23,42,0.1)] md:hidden">
                <div className="grid grid-cols-4">
                    {navItems.map((item) => (
                        <button
                            key={item.key}
                            onClick={() => scrollToSection(item.key)}
                            className={`flex flex-col items-center justify-center gap-1 py-3 transition-all ${
                                view === item.key
                                    ? "text-slate-900 font-bold"
                                    : "text-slate-400"
                            }`}
                        >
                            <div className={`flex items-center justify-center h-8 w-8 rounded-xl transition-all ${
                                view === item.key ? "bg-slate-100" : ""
                            }`}>
                                <item.icon className="h-5 w-5" />
                            </div>
                            <span className="text-[10px] font-semibold">{item.label}</span>
                        </button>
                    ))}
                </div>
            </nav>
        </div>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
    icon: Icon, label, value, gradient, glow, sub,
}: {
    icon: React.ElementType
    label: string
    value: string | number
    gradient: string
    glow: string
    sub?: string
}) {
    return (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
            <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} mb-4 shadow-lg`}
                style={{ boxShadow: `0 8px 24px ${glow}` }}>
                <Icon className="h-5 w-5 text-white" />
            </div>
            <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
            <p className="text-sm font-bold text-slate-500 mt-1">{label}</p>
            {sub && <p className="text-xs text-slate-400 font-medium mt-0.5">{sub}</p>}
        </div>
    )
}

function MentorChip({ label, value, color }: { label: string; value: string; color: "indigo" | "emerald" | "amber" }) {
    const styles = {
        indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
        emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
        amber: "bg-amber-50 text-amber-700 border-amber-200",
    }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${styles[color]}`}>
            <span className="font-black">{label}:</span> {value}
        </span>
    )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: "indigo" | "emerald" | "amber" }) {
    const bg = { indigo: "bg-indigo-50", emerald: "bg-emerald-50", amber: "bg-amber-50" }
    const txt = { indigo: "text-indigo-700", emerald: "text-emerald-700", amber: "text-amber-700" }
    return (
        <div className={`rounded-2xl p-3 ${bg[color]}`}>
            <p className={`text-xl font-black ${txt[color]}`}>{value}</p>
            <p className="text-xs font-bold text-slate-500 mt-0.5">{label}</p>
        </div>
    )
}

function AttCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-slate-50 border border-slate-100">
            <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${color}`} />
            <div>
                <p className="text-base font-black text-slate-800">{value}</p>
                <p className="text-[11px] font-bold text-slate-400">{label}</p>
            </div>
        </div>
    )
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400">
            {text}
        </div>
    )
}
