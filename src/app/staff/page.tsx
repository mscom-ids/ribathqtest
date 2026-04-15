"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format, getDay } from "date-fns"
import {
    BookOpen, ChevronRight, Clock, Users, CalendarDays,
    TrendingUp, Award, Bell, User, Search, Camera, Loader2, BarChart2,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { StudentProfileView } from "@/components/admin/student-profile/student-profile-view"
import { AssignStudentsModal } from "@/components/staff/AssignStudentsModal"
import { HifzProgressModal } from "@/components/staff/HifzProgressModal"

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

// ─── Helper: greeting ─────────────────────────────────────────────────────────
function getGreeting(h: number) {
    if (h < 12) return "Good Morning"
    if (h < 17) return "Good Afternoon"
    return "Good Evening"
}

// ─── Helper: SVG Donut ───────────────────────────────────────────────────────
function DonutRing({
    pct, size = 96, stroke = 12, color = "#3b82f6", bg = "#e2e8f0",
}: {
    pct: number; size?: number; stroke?: number; color?: string; bg?: string
}) {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const dash = (pct / 100) * circ
    return (
        <svg width={size} height={size} className="rotate-[-90deg]">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
            <circle
                cx={size / 2} cy={size / 2} r={r} fill="none"
                stroke={color} strokeWidth={stroke}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                className="transition-all duration-700"
            />
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
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
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

    useEffect(() => {
        setMounted(true)
        const now = new Date()
        setCurrentTime(now)
        setTodayStr(format(now, "yyyy-MM-dd"))
        setTodayLabel(format(now, "EEEE, MMMM d, yyyy"))
    }, [])

    // Clock tick
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000)
        return () => clearInterval(timer)
    }, [])

    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return undefined
        return url.startsWith("http") ? url : `http://localhost:5000${url}`
    }

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
                window.location.reload()
            }
        } catch (error) {
            console.error("Failed to upload photo:", error)
        }
    }

    // Load my assigned students + sessions (only once todayStr is ready)
    useEffect(() => {
        if (!todayStr) return
        async function load() {
            setLoading(true)
            try {
                const profileRes = await api.get("/staff/me")
                if (!profileRes.data.success) { router.push("/login"); return }
                setStaffName(profileRes.data.staff.name || "")
                setStaffId(profileRes.data.staff.id || "")
                setStaffPhoto(profileRes.data.staff.photo_url || "")

                const [studRes, sessRes] = await Promise.all([
                    api.get("/staff/me/students", { params: { date: todayStr } }),
                    api.get("/attendance/schedules-for-date", { params: { date: todayStr } }),
                ])
                if (studRes.data.success) setMyStudents(studRes.data.students || [])
                if (sessRes.data.data) setSessions(sessRes.data.data.map((s: any) => ({
                    ...s,
                    name: s.name || `${s.class_type} Class`,
                })))
            } catch (err: any) {
                console.error("[STAFF PAGE] Load error:", err)
                router.push("/login")
            }
            setLoading(false)
        }
        load()
    }, [router, todayStr])

    // Lazy-load all students when switching to "All Students" mode
    useEffect(() => {
        if (studentMode !== "all" || allStudentsLoaded) return
        async function loadAll() {
            try {
                const res = await api.get("/students")
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

    const presentCount = myStudents.filter(s => s.today_stats?.attendance === "Present" || s.today_stats?.attendance === "present").length
    const absentCount = myStudents.filter(s => s.today_stats?.attendance === "Absent").length
    const leaveCount = myStudents.filter(s => s.today_stats?.attendance === "Leave" || s.today_stats?.attendance === "Outside").length
    const entryCount = myStudents.filter(s => s.today_stats && (s.today_stats.hifz > 0 || s.today_stats.revision > 0)).length
    const attendancePct = myStudents.length > 0 ? Math.round((presentCount / myStudents.length) * 100) : 0
    const entryPct = myStudents.length > 0 ? Math.round((entryCount / myStudents.length) * 100) : 0

    // Feature 1: Session-Based Attendance
    const totalRecords = myStudents.length * todaySessions.length
    let totalPresentMarks = 0
    let totalAbsentMarks = 0
    let totalOutsideMarks = 0
    myStudents.forEach(s => {
        if (s.today_stats?.session_marks) {
            s.today_stats.session_marks.forEach((m: any) => {
                if (m.status === 'Present') totalPresentMarks++;
                else if (m.status === 'Absent') totalAbsentMarks++;
                else if (m.status === 'Leave' || m.status === 'Outside') totalOutsideMarks++;
            });
        }
    })
    const sessionAttendancePct = totalRecords > 0 ? Math.round((totalPresentMarks / totalRecords) * 100) : 0

    // Feature 2: Last Session Attendance (Live Status)
    const currentTimeString = format(currentTime || new Date(), "HH:mm:ss")
    let activeSession = null
    for (let i = 0; i < todaySessions.length; i++) {
        if ((todaySessions[i].start_time || "") <= currentTimeString) {
            activeSession = todaySessions[i]
        }
    }
    const targetSessionObj = activeSession
    
    let lastPresent = 0
    let lastAbsent = 0
    let lastOutside = 0
    if (targetSessionObj) {
        myStudents.forEach(s => {
            const mark = s.today_stats?.session_marks?.find((m: any) => m.schedule_id === targetSessionObj.id)
            if (mark) {
                if (mark.status === 'Present') lastPresent++;
                else if (mark.status === 'Absent') lastAbsent++;
                else if (mark.status === 'Leave' || mark.status === 'Outside') lastOutside++;
            }
        })
    }

    const topPerformers = useMemo(() => [...myStudents]
        .filter(s => s.today_stats && (s.today_stats.hifz > 0 || s.today_stats.revision > 0))
        .sort((a, b) => ((b.today_stats?.hifz || 0) + (b.today_stats?.revision || 0)) - ((a.today_stats?.hifz || 0) + (a.today_stats?.revision || 0)))
        .slice(0, 3),
        [myStudents]
    )

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

    // ── Student detail view ───────────────────────────────────────
    if (selectedStudent) {
        return (
            <div className="h-full flex flex-col overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <button
                        onClick={() => setSelectedStudent(null)}
                        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                    >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                        Back to Dashboard
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{selectedStudent.name}</span>
                    <div className="ml-auto">
                        <Link href={`/staff/entry/${selectedStudent.adm_no}`}>
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                                <BookOpen className="h-3.5 w-3.5" />
                                Daily Entry
                            </Button>
                        </Link>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 dark:bg-[#020617]">
                    <StudentProfileView student={selectedStudent} isAdmin={false} />
                </div>
            </div>
        )
    }

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

    return (
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-[#020617]" suppressHydrationWarning>
            <div className="w-full px-4 lg:px-6 py-4 lg:py-6 space-y-5">

                {/* ── Welcome Banner ────────────────────────────────── */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-xl">
                    <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5" />
                    <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/5" />
                    <div className="absolute top-4 right-24 w-20 h-20 rounded-full bg-white/5" />

                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 md:p-8">
                        <div className="space-y-2">
                            <p className="text-blue-200 text-sm font-medium tracking-wide uppercase">Mentor Portal</p>
                            <h1 className="text-2xl md:text-3xl font-bold">
                                {getGreeting(greetingHour)}, Mentor 👋
                            </h1>
                            <p className="text-blue-100 text-sm">{todayLabel}</p>
                            {(currentSession || nextSessionLabel) && (
                                <div className="flex items-center gap-2 mt-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1.5 w-fit text-sm">
                                    <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                                    {currentSession
                                        ? `Now: ${currentSession.name} (${currentSession.start_time?.slice(0, 5)} – ${currentSession.end_time?.slice(0, 5)})`
                                        : nextSessionLabel}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{myStudents.length}</div>
                                <div className="text-blue-200 text-xs">Students</div>
                            </div>
                            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{todaySessions.length}</div>
                                <div className="text-blue-200 text-xs">Sessions</div>
                            </div>
                            <div className="bg-emerald-500/30 backdrop-blur-sm rounded-xl px-4 py-3 text-center min-w-[80px]">
                                <div className="text-2xl font-bold">{presentCount}</div>
                                <div className="text-emerald-200 text-xs">Present</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Profile card + Stat rings (mobile: stacked, desktop: side card) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

                    {/* Left column: profile + rings */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Profile Card */}
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-white p-5 shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/5 -translate-y-8 translate-x-8" />
                            <div className="relative">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="relative group">
                                        <Avatar className="h-14 w-14 rounded-xl ring-2 ring-white/10">
                                            <AvatarImage src={getPhotoUrl(staffPhoto)} className="object-cover" />
                                            <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 rounded-xl flex items-center justify-center text-lg font-bold text-white">
                                                {staffName ? staffName.substring(0, 2).toUpperCase() : "ST"}
                                            </AvatarFallback>
                                        </Avatar>
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity backdrop-blur-sm">
                                            <Camera className="h-5 w-5 text-white" />
                                            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                        </label>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-base">{staffName || "Mentor"}</h3>
                                        <p className="text-slate-400 text-xs mt-0.5">Mentor · Hifz Teacher</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <Users className="h-3.5 w-3.5 text-emerald-400" />
                                        <span>{myStudents.length} assigned students</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <CalendarDays className="h-3.5 w-3.5 text-blue-400" />
                                        <span>{todaySessions.length} sessions today</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Today's Entries */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Today's Entries</h3>
                                <TrendingUp className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative flex items-center justify-center">
                                    <DonutRing pct={entryPct} />
                                    <div className="absolute text-lg font-bold">{entryPct}%</div>
                                </div>
                                <div className="space-y-1 flex-1">
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Recorded: <b className="dark:text-white">{entryCount}</b></div>
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Pending: <b className="dark:text-white">{myStudents.length - entryCount}</b></div>
                                </div>
                            </div>
                        </div>

                        {/* Student Attendance (Daily Presence) */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Student Attendance <span className="text-xs text-slate-400 font-normal">(Daily Presence)</span></h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative flex items-center justify-center">
                                    <DonutRing pct={attendancePct} color="#10b981" />
                                    <div className="absolute text-lg font-bold">{attendancePct}%</div>
                                </div>
                                <div className="space-y-1 flex-1">
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Present (Any): <b className="dark:text-white">{presentCount}</b></div>
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Absent: <b className="dark:text-white">{absentCount}</b></div>
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Outside: <b className="dark:text-white">{leaveCount}</b></div>
                                </div>
                            </div>
                        </div>

                        {/* Session Attendance */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Session Attendance</h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="relative flex items-center justify-center">
                                    <DonutRing pct={sessionAttendancePct} color="#3b82f6" />
                                    <div className="absolute text-lg font-bold">{sessionAttendancePct}%</div>
                                </div>
                                <div className="space-y-1 flex-1">
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Present: <b className="dark:text-white">{totalPresentMarks}</b> <span className="text-slate-400">/ {totalRecords}</span></div>
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Absent: <b className="dark:text-white">{totalAbsentMarks}</b></div>
                                    <div className="text-xs text-slate-500 dark:text-gray-300">Outside: <b className="dark:text-white">{totalOutsideMarks}</b></div>
                                </div>
                            </div>
                        </div>

                        {/* Last Session Attendance */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Last Session Attendance</h3>
                            </div>
                            {targetSessionObj ? (
                                <div>
                                    <p className="text-xs font-semibold mb-2 text-slate-700 dark:text-slate-300">{targetSessionObj.name} <span className="font-normal text-slate-500 ml-1">({targetSessionObj.start_time?.slice(0, 5)} - {targetSessionObj.end_time?.slice(0, 5)})</span></p>
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                        <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 p-2 rounded-lg text-center border border-emerald-100 dark:border-emerald-800/30">
                                            <div className="text-lg font-bold">{lastPresent}</div>
                                            <div className="text-[10px] uppercase font-bold tracking-wider">Present</div>
                                        </div>
                                        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 p-2 rounded-lg text-center border border-rose-100 dark:border-rose-800/30">
                                            <div className="text-lg font-bold">{lastAbsent}</div>
                                            <div className="text-[10px] uppercase font-bold tracking-wider">Absent</div>
                                        </div>
                                        <div className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 p-2 rounded-lg text-center border border-orange-100 dark:border-orange-800/30">
                                            <div className="text-lg font-bold">{lastOutside}</div>
                                            <div className="text-[10px] uppercase font-bold tracking-wider">Outside</div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-2 text-center border border-dashed rounded-lg border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Pending (No session started)</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Middle column: sessions + quick actions + student list */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Today's Sessions */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Today's Sessions</h3>
                            {todaySessions.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">No sessions scheduled for today.</p>
                            ) : (
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {todaySessions.map((s) => (
                                        <Link href={`/staff/attendance?session=${s.id}`} key={s.id} className="block shrink-0">
                                            <div className="w-44 rounded-xl border border-slate-200 dark:border-gray-700 p-3 bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                <p className="font-semibold text-sm truncate dark:text-white">{s.name}</p>
                                                <div className="text-[11px] text-slate-500 dark:text-gray-400 mt-1">{s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}</div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Quick Actions */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <Link href="/staff/attendance" className="p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-blue-50 dark:bg-[#0f172a] text-center transition-colors hover:bg-blue-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1">
                                <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                <span className="text-xs font-semibold text-slate-900 dark:text-gray-300">Attendance</span>
                            </Link>
                            <Link href="/staff/leaves" className="p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-amber-50 dark:bg-[#0f172a] text-center transition-colors hover:bg-amber-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1">
                                <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                <span className="text-xs font-semibold text-slate-900 dark:text-gray-300">Leaves</span>
                            </Link>
                            <Link href="/staff/finance" className="p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-emerald-50 dark:bg-[#0f172a] text-center transition-colors hover:bg-emerald-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1">
                                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs font-semibold text-slate-900 dark:text-gray-300">Finance</span>
                            </Link>
                            {/* Assign modal — only rendered after mount to avoid hydration mismatch */}
                            {mounted && (
                                <AssignStudentsModal
                                    currentStaffId={staffId}
                                    students={myStudents}
                                    trigger={
                                        <div className="p-4 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-[#0f172a] text-center cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 flex flex-col items-center justify-center gap-1">
                                            <Users className="h-5 w-5 text-slate-600 dark:text-gray-300" />
                                            <span className="text-xs font-semibold text-slate-900 dark:text-gray-300">Assign</span>
                                        </div>
                                    }
                                />
                            )}
                        </div>

                        {/* Student List — My Students / All Students toggle */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100 dark:border-gray-700">
                                {/* Mode toggle */}
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
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
                                <div className="relative w-44 sm:w-52">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input
                                        placeholder="Search…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-8 h-8 text-xs"
                                    />
                                </div>
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
                                        return (
                                            <div key={student.adm_no} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">

                                                {/* ── Mobile card (hidden on md+) ─────────────────── */}
                                                <div className="md:hidden px-4 py-3.5 space-y-2.5">
                                                    {/* Row 1: Avatar + Name/Meta */}
                                                    <div className="flex items-start gap-3">
                                                        <Avatar className="h-11 w-11 shrink-0 mt-0.5">
                                                            <AvatarImage src={getPhotoUrl(student.photo_url)} />
                                                            <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm">
                                                                {student.name.substring(0, 2).toUpperCase()}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex-1 min-w-0">
                                                            <button
                                                                onClick={() => setSelectedStudent(student)}
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
                                                            {isOnLeave && (
                                                                <span className="inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 tracking-wide">
                                                                    OUTSIDE
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Action button + icon buttons */}
                                                    <div className="flex items-center gap-2 pl-14">
                                                        {student.is_delegated ? (
                                                            <Button size="sm" disabled className="flex-1 h-8 text-[11px] bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-gray-500">
                                                                <Clock className="h-3.5 w-3.5 mr-1" /> Delegated
                                                            </Button>
                                                        ) : isOnLeave ? (
                                                            <Button size="sm" disabled className="flex-1 h-8 text-[11px] bg-orange-50 text-orange-400 dark:bg-orange-900/20 dark:text-orange-500 cursor-not-allowed border border-orange-200 dark:border-orange-800/50">
                                                                Currently Outside
                                                            </Button>
                                                        ) : (
                                                            <Link href={`/staff/entry/${student.adm_no}`} className="flex-1">
                                                                <Button size="sm" className="w-full h-8 text-[12px] font-semibold bg-green-600 hover:bg-green-700 active:bg-green-800 text-white">
                                                                    <BookOpen className="h-3.5 w-3.5 mr-1" /> Record
                                                                </Button>
                                                            </Link>
                                                        )}
                                                        <button
                                                            title="View Hifz Progress"
                                                            onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })}
                                                            className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#3d5ee1] hover:bg-[#e8ebfd] dark:hover:bg-[#1e2a5c] transition-colors shrink-0"
                                                        >
                                                            <BarChart2 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setSelectedStudent(student)}
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
                                                            onClick={() => setSelectedStudent(student)}
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
                                                        {isOnLeave && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 font-semibold">
                                                                OUTSIDE
                                                            </span>
                                                        )}
                                                        {student.is_delegated ? (
                                                            <Button size="sm" disabled className="h-7 text-[10px] bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-gray-500">
                                                                <Clock className="h-3 w-3" /> Delegated
                                                            </Button>
                                                        ) : isOnLeave ? (
                                                            <Button size="sm" disabled className="h-7 text-[10px] bg-orange-100 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400 cursor-not-allowed">
                                                                Outside
                                                            </Button>
                                                        ) : (
                                                            <Link href={`/staff/entry/${student.adm_no}`}>
                                                                <Button size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white">
                                                                    <BookOpen className="h-3 w-3" /> Record
                                                                </Button>
                                                            </Link>
                                                        )}
                                                        <button
                                                            title="View Hifz Progress"
                                                            onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard, photo_url: student.photo_url })}
                                                            className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e8ebfd] text-slate-400 hover:text-[#3d5ee1] transition-colors"
                                                        >
                                                            <BarChart2 className="h-4 w-4" />
                                                        </button>
                                                        <button onClick={() => setSelectedStudent(student)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
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
                                                                <button
                                                                    title="View Hifz Progress"
                                                                    onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })}
                                                                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-[#3d5ee1] hover:bg-[#e8ebfd] transition-colors"
                                                                >
                                                                    <BarChart2 className="h-4 w-4" />
                                                                </button>
                                                                <Link href={`/staff/entry/${student.adm_no}`}>
                                                                    <Button size="sm" className="h-8 text-[11px] bg-green-600 hover:bg-green-700 text-white px-3">
                                                                        <BookOpen className="h-3 w-3 mr-1" /> Record
                                                                    </Button>
                                                                </Link>
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
                                                                <button
                                                                    title="View Hifz Progress"
                                                                    onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })}
                                                                    className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[#e8ebfd] text-slate-400 hover:text-[#3d5ee1] transition-colors"
                                                                >
                                                                    <BarChart2 className="h-4 w-4" />
                                                                </button>
                                                                <Link href={`/staff/entry/${student.adm_no}`}>
                                                                    <Button size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white">
                                                                        <BookOpen className="h-3 w-3" /> Record
                                                                    </Button>
                                                                </Link>
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

                    {/* Right column: top performers + quick actions list */}
                    <div className="lg:col-span-1 space-y-4">
                        {/* Top Performers */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm p-5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm dark:text-white">Top Performers</h3>
                                <Award className="h-4 w-4 text-amber-500" />
                            </div>
                            {topPerformers.length === 0 ? (
                                <div className="text-center py-6 text-sm text-slate-400">
                                    No entries recorded yet today
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {topPerformers.map((stu, i) => (
                                        <div key={stu.adm_no} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs
                                                    ${i === 0 ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400" :
                                                      i === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" :
                                                      "bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"}`}
                                                >
                                                    #{i + 1}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-slate-900 dark:text-white truncate max-w-[110px]">{stu.name}</p>
                                                    <p className="text-[10px] text-slate-500 dark:text-gray-400">{stu.standard}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                                                    {(stu.today_stats?.hifz || 0) + (stu.today_stats?.revision || 0)}
                                                </p>
                                                <p className="text-[10px] text-slate-400">lines</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Quick Actions list */}
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                            <h3 className="font-semibold text-sm mb-4 text-slate-900 dark:text-white">Quick Actions</h3>
                            <div className="space-y-1">
                                {[
                                    { href: "/staff/attendance", label: "Mark Attendance", icon: CalendarDays },
                                    { href: "/staff/leaves",    label: "Manage Leaves",   icon: Bell },
                                    { href: "/staff/reports",   label: "Reports",          icon: TrendingUp },
                                ].map(item => (
                                    <Link key={item.href} href={item.href}>
                                        <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <item.icon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                                                <span className="text-sm font-medium text-slate-900 dark:text-gray-300">{item.label}</span>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-slate-300 dark:text-gray-500" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Hifz Progress Modal */}
            <HifzProgressModal
                open={!!chartStudent}
                onClose={() => setChartStudent(null)}
                student={chartStudent}
            />
        </div>
    )
}
