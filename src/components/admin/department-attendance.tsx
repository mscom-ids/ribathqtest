"use client"

import { useState, useEffect, useCallback } from "react"
import { Calendar, X, CheckCircle2, XCircle, RefreshCw, Clock, Users, User, ChevronLeft, ChevronRight, Lock, ChevronDown, AlertCircle } from "lucide-react"
import api from "@/lib/api"
import Cookies from "js-cookie"
import { cn } from "@/lib/utils"

type StudentMark = { adm_no: string; name: string; standard: string; photo_url?: string; status: string; is_on_leave?: boolean; attendance_status?: string }
type StaffMember = { id: string; name: string; role: string; photo_url?: string }

function toLocalDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Use JS standard getDay() values (0=Sun, 1=Mon ... 6=Sat)
// which matches how attendance_schedules.day_of_week values are stored
function getDayOfWeek(d: Date) {
    return d.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
}

export function DepartmentAttendance({ department }: { department: "hifz" | "school" | "madrassa" }) {
    const [loading, setLoading] = useState(true)
    const [schedules, setSchedules] = useState<any[]>([])
    const [dashboardData, setDashboardData] = useState<any>({ marks: [], cancellations: [] })

    const [userRole, setUserRole] = useState("")
    const [userId, setUserId] = useState("")

    // Date navigation
    const [viewDate, setViewDate] = useState<Date>(new Date())

    // Mentor selector
    const [staffList, setStaffList] = useState<StaffMember[]>([])
    const [selectedMentorId, setSelectedMentorId] = useState<string>("all")
    const [isMentorDropdownOpen, setIsMentorDropdownOpen] = useState(false)
    const [mentorSchedules, setMentorSchedules] = useState<string[]>([])
    const [mentorStandards, setMentorStandards] = useState<string[]>([])

    // Roster modal
    const [rosterModal, setRosterModal] = useState<{ isOpen: boolean, schedule: any, dateStr: string, students: StudentMark[], mentorId: string } | null>(null)

    // Academic year
    const [academicYears, setAcademicYears] = useState<any[]>([])
    const [selectedYearId, setSelectedYearId] = useState("")

    useEffect(() => {
        const token = Cookies.get('auth_token')
        if (token) {
            try {
                const p = JSON.parse(atob(token.split('.')[1]))
                setUserRole(p.role)
                setUserId(p.id)
            } catch {}
        }
        fetchFilters()
        fetchStaff()
    }, [])

    const fetchFilters = async () => {
        try {
            const res = await api.get('/classes/academic-years')
            if (res.data.success) {
                setAcademicYears(res.data.data)
                const current = res.data.data.find((y: any) => y.is_current)
                if (current) setSelectedYearId(current.id)
                else if (res.data.data.length > 0) setSelectedYearId(res.data.data[0].id)
            }
        } catch (e) { console.error("Failed to load academic years", e) }
    }

    const fetchStaff = async () => {
        try {
            const res = await api.get('/staff')
            const data = res.data.data || res.data.staff || res.data || []
            setStaffList(Array.isArray(data) ? data : [])
        } catch (e) { console.error("Failed to load staff", e) }
    }

    const effectiveMaxDays = ['admin', 'principal', 'vice_principal'].includes(userRole) ? 30 : 3

    const fetchData = useCallback(async () => {
        if (!selectedYearId) return
        setLoading(true)
        try {
            const dateStr = toLocalDateStr(viewDate)
            const [schedRes, dashRes] = await Promise.all([
                api.get(`/attendance/schedules?academic_year_id=${selectedYearId}`),
                api.get(`/attendance/dashboard?start_date=${dateStr}&end_date=${dateStr}`)
            ])
            if (schedRes.data.success) {
                // Filter schedules by department (class_type) natively upon fetch
                const deptSchedules = schedRes.data.data.filter((s:any) => s.class_type.toLowerCase() === department)
                setSchedules(deptSchedules)
            }
            if (dashRes.data.success) setDashboardData(dashRes.data)
        } catch (e) { console.error("Failed to load attendance data", e) }
        setLoading(false)
    }, [selectedYearId, viewDate, department])

    useEffect(() => {
        if (selectedYearId) fetchData()
    }, [fetchData])

    useEffect(() => {
        const fetchMentorSchedules = async () => {
            if (selectedMentorId === 'all' || !selectedYearId) {
                setMentorSchedules([])
                setMentorStandards([])
                return
            }
            try {
                const res = await api.get(`/attendance/mentor-schedules?mentor_id=${selectedMentorId}&academic_year_id=${selectedYearId}`)
                if (res.data.success) {
                    setMentorSchedules(res.data.schedule_ids || [])
                    setMentorStandards(res.data.mentor_standards || [])
                }
            } catch (e) { console.error("Failed to load mentor schedules", e) }
        }
        fetchMentorSchedules()
    }, [selectedMentorId, selectedYearId])

    // ── Date navigation ─────────────────────────────────────────────────────────
    const todayNorm = new Date(); todayNorm.setHours(0,0,0,0)
    const viewNorm = new Date(viewDate); viewNorm.setHours(0,0,0,0)
    const diffFromToday = Math.round((todayNorm.getTime() - viewNorm.getTime()) / 86400000)
    const canGoPrev = diffFromToday < effectiveMaxDays
    const canGoNext = diffFromToday > 0
    const shiftDate = (days: number) => {
        const next = new Date(viewDate)
        next.setDate(next.getDate() + days)
        setViewDate(next)
    }

    const viewDateStr = toLocalDateStr(viewDate)
    const viewDayOfWeek = getDayOfWeek(viewDate)
    const isToday = diffFromToday === 0
    const isYesterday = diffFromToday === 1
    const now = new Date()

    // ── Mentor context ──────────────────────────────────────────────────────────
    const selectedMentor = staffList.find(s => s.id === selectedMentorId) || null
    
    // Filter schedules: only show schedules matching the selected mentor's students
    let daySchedules = schedules.filter(s => s.day_of_week === viewDayOfWeek)
    if (selectedMentorId !== 'all') {
        daySchedules = daySchedules.filter(s => mentorSchedules.includes(s.id))
    }

    // ── Slot status ─────────────────────────────────────────────────────────────
    const getSlotStatus = (sched: any) => {
        const cancelled = dashboardData.cancellations?.find(
            (c: any) => c.schedule_id === sched.id && c.date?.split('T')[0] === viewDateStr
        )
        if (cancelled) return { state: 'cancelled' as const }

        const marked = dashboardData.marks?.find(
            (m: any) => m.schedule_id === sched.id && m.date?.split('T')[0] === viewDateStr
        )
        if (marked) return { state: 'completed' as const }

        if (diffFromToday > effectiveMaxDays) return { state: 'locked' as const }

        if (diffFromToday === 0) {
            const classStart = new Date(`${viewDateStr}T${sched.start_time}`)
            if (now < classStart) return { state: 'upcoming' as const, startTime: formatTime(sched.start_time) }
        }

        return { state: 'active' as const }
    }

    // ── Roster ──────────────────────────────────────────────────────────────────
    const openRoster = async (sched: any) => {
        try {
            const mentorParam = selectedMentorId !== 'all' ? `&mentor_id=${selectedMentorId}` : ''
            const res = await api.get(`/attendance/students?schedule_id=${sched.id}&date=${viewDateStr}${mentorParam}`)
            if (res.data.success) {
                const students: StudentMark[] = res.data.students.map((st: any) => ({
                    ...st,
                    status: st.is_on_leave ? 'outside' : 'present',
                    is_on_leave: st.is_on_leave || false,
                    attendance_status: st.attendance_status || (st.is_on_leave ? 'outside' : 'pending')
                }))
                setRosterModal({ isOpen: true, schedule: sched, dateStr: viewDateStr, students, mentorId: selectedMentorId })
            }
        } catch (e: any) {
            alert(e.response?.data?.error || "Error fetching students")
        }
    }

    const toggleStudent = (idx: number) => {
        if (!rosterModal) return
        // Don't allow toggling if student is on leave
        if (rosterModal.students[idx].is_on_leave) return
        const updated = [...rosterModal.students]
        const cur = updated[idx].status
        if (cur === 'present') updated[idx].status = 'late'
        else if (cur === 'late') updated[idx].status = 'absent'
        else updated[idx].status = 'present'
        setRosterModal({ ...rosterModal, students: updated })
    }

    const submitRoster = async () => {
        if (!rosterModal) return
        try {
            const payload: any = {
                schedule_id: rosterModal.schedule.id,
                date: rosterModal.dateStr,
                // Only include students NOT on leave
                student_marks: rosterModal.students
                    .filter(s => !s.is_on_leave)
                    .map(s => ({ student_id: s.adm_no, status: s.status }))
            }
            // If admin is marking on behalf of a specific mentor, attribute the mark to them
            if (rosterModal.mentorId && rosterModal.mentorId !== 'all') {
                payload.on_behalf_of = rosterModal.mentorId
            }
            const res = await api.post('/attendance/mark', payload)
            if (res.data.success) { setRosterModal(null); fetchData() }
        } catch (e: any) {
            alert(e.response?.data?.error || "Error submitting attendance")
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────
    function formatTime(t: string | undefined) {
        if (!t) return ""
        const [h, m] = t.split(':')
        let hour = parseInt(h)
        const ampm = hour >= 12 ? 'PM' : 'AM'
        hour = hour % 12 || 12
        return `${hour < 10 ? '0' + hour : hour}:${m} ${ampm}`
    }

    const getClassColor = (type: string) => {
        const t = (type || "").toLowerCase()
        if (t === 'hifz') return { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' }
        if (t === 'madrassa') return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' }
        return { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' }
    }

    const statusBadgeStyle = (status: string, isOnLeave: boolean = false) => {
        if (isOnLeave) return "bg-purple-500/10 text-purple-600 border-purple-500/30"
        if (status === 'present') return "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/30"
        if (status === 'late') return "bg-amber-500/10 text-amber-600 border-amber-500/30"
        return "bg-rose-500/10 text-rose-500 border-rose-500/30"
    }
    const statusIcon = (status: string, isOnLeave: boolean = false) => {
        if (isOnLeave) return <AlertCircle className="w-3.5 h-3.5" />
        if (status === 'present') return <CheckCircle2 className="w-3.5 h-3.5" />
        if (status === 'late') return <Clock className="w-3.5 h-3.5" />
        return <XCircle className="w-3.5 h-3.5" />
    }

    const totalCount = daySchedules.length
    const completedCount = daySchedules.filter(s => getSlotStatus(s).state === 'completed').length
    const cancelledCount = daySchedules.filter(s => getSlotStatus(s).state === 'cancelled').length
    const pendingCount = daySchedules.filter(s => ['active', 'upcoming'].includes(getSlotStatus(s).state)).length

    const dateLabel = isToday ? "Today" : isYesterday ? "Yesterday" : viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

    const departmentTitle = department === 'madrassa' ? 'Madrassa' : department === 'hifz' ? 'Hifz' : 'School';

    return (
        <div className="space-y-5 pb-12 w-full max-w-[1500px] mx-auto min-h-screen">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                    <h1 className="text-[20px] font-bold text-slate-800 dark:text-white">{departmentTitle} Attendance</h1>
                    <p className="text-[13px] text-slate-500 font-medium">Dashboard / Academics / <span className="capitalize">{departmentTitle}</span> / <span className="text-slate-700 dark:text-slate-300">Attendance</span></p>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded text-[13px] text-slate-600 font-medium bg-white dark:bg-slate-800 shadow-sm">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span>Academic Year:</span>
                        <select className="bg-transparent border-none outline-none font-bold text-slate-700 dark:text-slate-200 cursor-pointer" value={selectedYearId} onChange={e => setSelectedYearId(e.target.value)}>
                            {academicYears.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
                        </select>
                    </div>
                    <button onClick={fetchData} className="px-3 h-[38px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 transition text-slate-500">
                        <RefreshCw className="h-[15px] w-[15px]" />
                    </button>
                </div>
            </div>

            {/* ── Mentor Selector + Date Navigator (Side by Side) ─────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">

                    {/* ── Mentor Dropdown ── */}
                    <div className="relative sm:w-[260px] shrink-0">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Mentor / Staff</label>
                        <button
                            onClick={() => setIsMentorDropdownOpen(v => !v)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 transition"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                {selectedMentor ? (
                                    <>
                                        <div className="w-6 h-6 rounded-full bg-[#4f46e5]/20 flex items-center justify-center shrink-0 text-[10px] font-black text-[#4f46e5]">
                                            {selectedMentor.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="truncate">{selectedMentor.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <Users className="h-4 w-4 text-slate-400 shrink-0" />
                                        <span className="text-slate-500">All Mentors</span>
                                    </>
                                )}
                            </div>
                            <ChevronDown className={cn("h-4 w-4 text-slate-400 shrink-0 transition-transform", isMentorDropdownOpen && "rotate-180")} />
                        </button>

                        {/* Dropdown list */}
                        {isMentorDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-30 overflow-hidden">
                                <div className="max-h-[260px] overflow-y-auto">
                                    {/* All option */}
                                    <button
                                        onClick={() => { setSelectedMentorId('all'); setIsMentorDropdownOpen(false) }}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left",
                                            selectedMentorId === 'all' && "bg-[#4f46e5]/5 text-[#4f46e5] font-bold"
                                        )}
                                    >
                                        <Users className="h-4 w-4 text-slate-400" />
                                        <span>All Mentors</span>
                                        {selectedMentorId === 'all' && <CheckCircle2 className="h-4 w-4 ml-auto text-[#4f46e5]" />}
                                    </button>
                                    <div className="border-t border-slate-100 dark:border-slate-800" />
                                    {staffList.map(staff => (
                                        <button
                                            key={staff.id}
                                            onClick={() => { setSelectedMentorId(staff.id); setIsMentorDropdownOpen(false) }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800 transition text-left",
                                                selectedMentorId === staff.id && "bg-[#4f46e5]/5 text-[#4f46e5] font-bold"
                                            )}
                                        >
                                            <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0 flex items-center justify-center text-[11px] font-black text-slate-600">
                                                {staff.photo_url
                                                    ? <img src={staff.photo_url} className="w-full h-full object-cover" alt="" />
                                                    : staff.name.charAt(0).toUpperCase()
                                                }
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{staff.name}</p>
                                                {staff.role && <p className="text-[11px] text-slate-400 capitalize">{staff.role}</p>}
                                            </div>
                                            {selectedMentorId === staff.id && <CheckCircle2 className="h-4 w-4 ml-auto text-[#4f46e5] shrink-0" />}
                                        </button>
                                    ))}
                                    {staffList.length === 0 && (
                                        <p className="text-[13px] text-slate-400 text-center py-4">No staff found</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="hidden sm:block w-px bg-slate-100 dark:bg-slate-800 self-stretch" />

                    {/* ── Date Navigator ── */}
                    <div className="flex-1 flex flex-col gap-1.5">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</label>
                        <div className="flex items-center gap-2">
                            {/* Prev */}
                            <button
                                onClick={() => shiftDate(-1)}
                                disabled={!canGoPrev}
                                className={cn(
                                    "h-10 w-10 flex items-center justify-center rounded-lg border shrink-0 transition",
                                    canGoPrev
                                        ? "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700"
                                        : "border-slate-100 dark:border-slate-800 text-slate-300 cursor-not-allowed"
                                )}
                            >
                                <ChevronLeft className="h-5 w-5" />
                            </button>

                            {/* Date display */}
                            <div className="flex-1 flex items-center justify-center gap-3">
                                <div className="text-center">
                                    <p className="text-[17px] font-black text-slate-800 dark:text-white">{dateLabel}</p>
                                    <p className="text-[11px] text-slate-500">{viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                                </div>
                                <input
                                    type="date"
                                    value={viewDateStr}
                                    max={toLocalDateStr(new Date())}
                                    min={(() => { const d = new Date(); d.setDate(d.getDate() - effectiveMaxDays); return toLocalDateStr(d) })()}
                                    onChange={e => { if (e.target.value) setViewDate(new Date(e.target.value + 'T00:00:00')) }}
                                    className="appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/30"
                                />
                                {!isToday && (
                                    <button onClick={() => setViewDate(new Date())} className="text-[12px] font-bold text-[#4f46e5] hover:underline whitespace-nowrap">
                                        Today
                                    </button>
                                )}
                            </div>

                            {/* Next */}
                            <button
                                onClick={() => shiftDate(1)}
                                disabled={!canGoNext}
                                className={cn(
                                    "h-10 w-10 flex items-center justify-center rounded-lg border shrink-0 transition",
                                    canGoNext
                                        ? "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700"
                                        : "border-slate-100 dark:border-slate-800 text-slate-300 cursor-not-allowed"
                                )}
                            >
                                <ChevronRight className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Info bar */}
                <div className={cn(
                    "mt-3 rounded-lg px-3 py-2 text-[12px] font-medium flex items-center gap-2",
                    ['admin', 'principal', 'vice_principal'].includes(userRole)
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                )}>
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                        {['admin', 'principal', 'vice_principal'].includes(userRole)
                            ? "Admin access — mark or edit attendance for the past 30 days"
                            : "Mentor access — mark or edit attendance for the past 3 days only"
                        }
                    </span>
                    {selectedMentor && (
                        <span className="ml-auto flex items-center gap-1.5 text-[#4f46e5] font-bold">
                            <User className="h-3.5 w-3.5" />
                            Viewing: {selectedMentor.name}
                        </span>
                    )}
                    {diffFromToday > 0 && (
                        <span className={cn("font-bold", selectedMentor ? "ml-2" : "ml-auto")}>
                            {diffFromToday} day{diffFromToday > 1 ? 's' : ''} ago
                        </span>
                    )}
                </div>
            </div>

            {/* ── Summary Cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "Total Classes", value: totalCount, color: "text-slate-800 dark:text-white", lcolor: "text-slate-400" },
                    { label: "Completed", value: completedCount, color: "text-[#22c55e]", lcolor: "text-[#22c55e]" },
                    { label: "Pending", value: pendingCount, color: "text-amber-500", lcolor: "text-amber-500" },
                    { label: "Cancelled", value: cancelledCount, color: "text-rose-500", lcolor: "text-rose-500" },
                ].map(card => (
                    <div key={card.label} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                        <p className={cn("text-[11px] font-bold uppercase tracking-wider mb-1", card.lcolor)}>{card.label}</p>
                        <p className={cn("text-[28px] font-black", card.color)}>{card.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Class Grid ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-[#1e2433] rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h2 className="text-[16px] font-bold text-slate-800 dark:text-white">
                            Classes — {viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </h2>
                        {selectedMentor && (
                            <p className="text-[12px] text-[#4f46e5] font-semibold mt-0.5">
                                Filtered for: {selectedMentor.name} — students will be filtered to their assigned pupils
                            </p>
                        )}
                    </div>
                    <span className="text-[12px] font-bold text-slate-400">{daySchedules.length} slot{daySchedules.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                    </div>
                ) : daySchedules.length === 0 ? (
                    <div className="text-center py-20">
                        <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-[14px] text-slate-500 font-medium">No classes scheduled for this day</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-5">
                        {daySchedules.map(sched => {
                            const color = getClassColor(sched.class_type)
                            const status = getSlotStatus(sched)
                            const stds = typeof sched.standards === 'string' ? JSON.parse(sched.standards || '[]') : (sched.standards || [])
                            const isCancelled = status.state === 'cancelled'
                            const isCompleted = status.state === 'completed'
                            const isActive = status.state === 'active'
                            const isUpcoming = status.state === 'upcoming'
                            const isLocked = status.state === 'locked'
                            const isClickable = isActive || isCompleted

                            return (
                                <div
                                    key={sched.id}
                                    onClick={() => isClickable && openRoster(sched)}
                                    className={cn(
                                        "rounded-xl border-2 p-4 transition-all relative group overflow-hidden select-none",
                                        color.bg, color.border,
                                        isClickable && "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]",
                                        (isCancelled || isLocked) && "opacity-60 grayscale-[40%]"
                                    )}
                                >
                                    {/* Top row */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex flex-col gap-1.5">
                                            <span className={cn("w-max text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full text-white", color.badge)}>
                                                {sched.class_type}
                                            </span>
                                            {sched.name && <span className="text-[15px] font-bold text-slate-800 dark:text-white leading-tight">{sched.name}</span>}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {isCancelled && <span className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-full border border-rose-200">Cancelled</span>}
                                            {isLocked && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex items-center gap-1"><Lock className="h-2.5 w-2.5"/>Locked</span>}
                                            {isCompleted && <CheckCircle2 className="h-5 w-5 text-[#22c55e]" />}
                                            {isUpcoming && <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">Upcoming</span>}
                                            {isActive && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4f46e5] opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-[#4f46e5]"></span></span>}
                                        </div>
                                    </div>

                                    {/* Time */}
                                    <div className={cn("flex items-center gap-1.5 text-[13px] font-semibold mb-2", color.text, isCancelled && "line-through opacity-50")}>
                                        <Clock className="h-4 w-4" />
                                        {formatTime(sched.start_time)} – {formatTime(sched.end_time)}
                                    </div>

                                    {/* Standards */}
                                    <div className="flex items-start gap-1.5 flex-wrap mt-2">
                                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                                        <div className="flex flex-wrap gap-1">
                                            {(() => {
                                                const displayStds = selectedMentorId !== 'all' && mentorStandards.length > 0
                                                    ? stds.filter((s: string) => mentorStandards.includes(s))
                                                    : stds
                                                return (
                                                    <>
                                                        {displayStds.slice(0, 3).map((std: string, i: number) => (
                                                            <span key={i} className="bg-white/80 dark:bg-black/30 rounded px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-700/50">
                                                                {std}
                                                            </span>
                                                        ))}
                                                        {displayStds.length > 3 && <span className="text-[11px] text-slate-500">+{displayStds.length - 3} more</span>}
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    </div>

                                    {/* Footer hint */}
                                    <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
                                        {isActive && <p className="text-[11px] font-bold text-[#4f46e5] dark:text-[#818cf8]">Click to Mark Attendance →</p>}
                                        {isCompleted && <p className="text-[11px] font-bold text-[#22c55e]">✓ Submitted — Click to Review</p>}
                                        {isUpcoming && (
                                            <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                Starts at {(status as any).startTime} — not available yet
                                            </p>
                                        )}
                                        {isLocked && <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1"><Lock className="h-3 w-3"/>Outside edit window</p>}
                                        {isCancelled && <p className="text-[11px] font-medium text-rose-400">Class cancelled</p>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ── Roster Modal ─────────────────────────────────────────── */}
            {rosterModal?.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setRosterModal(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-2xl shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
                            <button onClick={() => setRosterModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition">
                                <X className="h-5 w-5" />
                            </button>
                            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white mb-1">
                                Mark Attendance — {rosterModal.schedule.name ? <span className="font-extrabold">{rosterModal.schedule.name}</span> : <span className="capitalize">{rosterModal.schedule.class_type}</span>}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                                <span>{formatTime(rosterModal.schedule.start_time)} – {formatTime(rosterModal.schedule.end_time)}</span>
                                <span className="text-slate-300">|</span>
                                <span className="font-bold text-[#4f46e5]">{rosterModal.dateStr}</span>
                                {rosterModal.dateStr !== toLocalDateStr(new Date()) && (
                                    <span className="text-[11px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Past Date</span>
                                )}
                                {selectedMentor && (
                                    <span className="text-[11px] bg-[#4f46e5]/10 text-[#4f46e5] border border-[#4f46e5]/20 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                        <User className="h-3 w-3" /> {selectedMentor.name}
                                    </span>
                                )}
                            </div>

                            {/* Count badges */}
                            <div className="flex gap-2 mt-3 flex-wrap">
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#22c55e]/10 text-[#22c55e]">
                                    Present: {rosterModal.students.filter(s => s.status === 'present' && !s.is_on_leave).length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600">
                                    Late: {rosterModal.students.filter(s => s.status === 'late' && !s.is_on_leave).length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-500">
                                    Absent: {rosterModal.students.filter(s => s.status === 'absent' && !s.is_on_leave).length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-600">
                                    Outside: {rosterModal.students.filter(s => s.is_on_leave).length}
                                </span>
                                <span className="ml-auto px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    Total: {rosterModal.students.length}
                                </span>
                            </div>
                        </div>

                        {/* Student list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {rosterModal.students.length === 0 ? (
                                <div className="text-center py-16">
                                    <Users className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                                    <p className="text-slate-500 text-[14px] font-medium">No students found</p>
                                    <p className="text-slate-400 text-[12px] mt-1">
                                        {selectedMentor
                                            ? `${selectedMentor.name} has no students assigned in these standards`
                                            : "Check if students are enrolled in the matching standards"
                                        }
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Header row */}
                                    <div className="grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        <span>#</span>
                                        <span>Student</span>
                                        <span>Attendance</span>
                                    </div>
                                    {rosterModal.students.map((st, i) => (
                                        <div
                                            key={st.adm_no}
                                            onClick={() => toggleStudent(i)}
                                            className={cn("grid grid-cols-[auto_1fr_auto] gap-3 items-center p-3 border rounded-lg transition",
                                                st.is_on_leave
                                                    ? "border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-900/10 cursor-not-allowed"
                                                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                                            )}
                                        >
                                            <span className="text-[13px] font-bold text-slate-400 w-6 text-center">{i + 1}</span>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                                                    {st.photo_url
                                                        ? <img src={st.photo_url} className="w-full h-full object-cover" alt="" />
                                                        : <User className="h-full w-full p-2 text-slate-400" />
                                                    }
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[14px] font-bold text-slate-700 dark:text-slate-200 truncate">{st.name}</p>
                                                    <p className="text-[12px] text-slate-500">{st.standard} • {st.adm_no}</p>
                                                </div>
                                            </div>
                                            <div className={cn("px-3 py-1.5 rounded-lg text-[12px] font-bold flex items-center gap-1.5 border min-w-[90px] justify-center transition-all", statusBadgeStyle(st.status, st.is_on_leave))}>
                                                {statusIcon(st.status, st.is_on_leave)}
                                                <span className="capitalize">{st.is_on_leave ? 'outside' : st.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-5 border-t border-slate-100 dark:border-slate-800 shrink-0 flex gap-2 justify-end bg-slate-50/50 dark:bg-slate-800/30 rounded-b-xl">
                            <button onClick={() => setRosterModal(null)} className="px-5 py-2.5 rounded-lg text-slate-600 font-bold text-[13px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition">
                                Cancel
                            </button>
                            <button onClick={submitRoster} className="px-6 py-2.5 rounded-lg bg-[#4f46e5] text-white font-bold text-[13px] shadow-sm hover:bg-[#4338ca] transition flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4" /> Submit Attendance
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Close mentor dropdown on outside click */}
            {isMentorDropdownOpen && (
                <div className="fixed inset-0 z-20" onClick={() => setIsMentorDropdownOpen(false)} />
            )}
        </div>
    )
}
