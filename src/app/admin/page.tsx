"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
    Users, BookOpen,
    CalendarDays, ChevronLeft, ChevronRight,
    Bell, FileText, DollarSign, BarChart2,
    CheckCircle2, Clock, AlertCircle,
    UserCheck, CalendarCheck, TrendingUp,
    MoreHorizontal, GraduationCap, X, Plus,
    Edit2, Trash2, Loader2, UserCog
} from "lucide-react"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { cn } from "@/lib/utils"
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts"
import EventModal from "@/components/shared/EventModal"

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString() }

const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]
const WEEK = ["Su","Mo","Tu","We","Th","Fr","Sa"]

// ── Mini calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ events = [] }: { events?: any[] }) {
    const today = new Date()
    const [year, setYear] = useState(today.getFullYear())
    const [month, setMonth] = useState(today.getMonth())

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
    const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

    // Map events to date strings for quick lookup [Year-Month-Date] -> 2024-6-15
    const eventDates = events.map(e => {
        const d = new Date(e.start_date)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })

    return (
        <div>
            <div className="flex items-center justify-between mb-4 mt-2">
                <button onClick={prev} className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </button>
                <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">{MONTHS[month]} {year}</span>
                <button onClick={next} className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                </button>
            </div>
            <div className="grid grid-cols-7 mb-2">
                {WEEK.map(d => (
                    <div key={d} className="text-center text-[12px] font-bold text-slate-800 dark:text-slate-200 py-1">{d}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
                {cells.map((day, i) => {
                    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                    const hasEvent = day ? eventDates.includes(`${year}-${month}-${day}`) : false

                    return (
                        <div key={i} className="flex flex-col items-center justify-center relative h-10">
                            {day ? (
                                <>
                                    <span className={cn(
                                        "h-8 w-8 flex items-center justify-center text-[13px] font-bold rounded-lg transition-all",
                                        isToday ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                                    )}>
                                        {day}
                                    </span>
                                    {hasEvent && <div className={cn("h-1 w-1 rounded-full absolute bottom-0.5", isToday ? "bg-white" : "bg-blue-500")} />}
                                </>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
    label, value, active, inactive, percent, icon: Icon, iconBg, iconColor, badgeStyle, activeLabel, inactiveLabel
}: {
    label: string
    value: number
    active: number
    inactive: number
    percent: string
    icon: React.ElementType
    iconBg: string
    iconColor: string
    badgeStyle: string
    activeLabel?: string
    inactiveLabel?: string
}) {
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-slate-200/60 dark:border-slate-700 flex flex-col justify-between group h-full">
            <div className="flex items-start justify-between mb-4">
                {/* Image / Icon container (left) */}
                <div className={`h-[68px] w-[68px] rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg} transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className={`h-8 w-8 ${iconColor}`} />
                </div>

                {/* Content (right aligned) */}
                <div className="flex flex-col items-end pt-1">
                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${badgeStyle}`}>
                        <TrendingUp className="h-3 w-3" /> {percent}
                    </span>
                    <span className="text-[32px] font-black text-slate-800 dark:text-white mt-1.5 leading-none">
                        {fmt(value)}
                    </span>
                    <p className="text-[14px] font-semibold text-slate-500 dark:text-slate-400 mt-1">{label}</p>
                </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-700 w-full mb-3" />

            <div className="flex items-center justify-between text-[13px] font-semibold text-slate-500 dark:text-slate-400">
                <div>
                    {activeLabel || 'Active'} : <span className="text-slate-800 dark:text-slate-200 pl-1">{fmt(active)}</span>
                </div>
                <div>
                    {inactiveLabel || 'Inactive'} : <span className="text-slate-800 dark:text-slate-200 pl-1">{fmt(inactive).padStart(2, '0')}</span>
                </div>
            </div>
        </div>
    )
}


function QuickLink({ href, label, icon: Icon, bg, iconBg, onClick }: {
    href?: string; label: string; icon: React.ElementType; bg: string; iconBg: string; onClick?: () => void;
}) {
    if (onClick) {
        return (
            <button onClick={onClick} className={`flex flex-col items-center justify-center py-5 rounded-xl border border-transparent dark:border-white/10 ${bg} hover:shadow-lg hover:scale-105 flex-1 min-w-[30%] transition-all duration-200`}>
                <div className={`h-[42px] w-[42px] rounded-full flex items-center justify-center ${iconBg} text-white shadow-sm mb-3 transition-transform`}>
                    <Icon className="h-5 w-5" />
                </div>
                <span className="text-[13px] font-bold text-slate-700 dark:text-gray-900">{label}</span>
            </button>
        )
    }
    return (
        <Link href={href!} className={`flex flex-col items-center justify-center py-5 rounded-xl border border-transparent dark:border-white/10 ${bg} hover:shadow-lg hover:scale-105 flex-1 min-w-[30%] transition-all duration-200`}>
            <div className={`h-[42px] w-[42px] rounded-full flex items-center justify-center ${iconBg} text-white shadow-sm mb-3`}>
                <Icon className="h-5 w-5" />
            </div>
            <span className="text-[13px] font-bold text-slate-700 dark:text-gray-900">{label}</span>
        </Link>
    )
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true)
    const [students, setStudents] = useState({ total: 0, onCampus: 0, outCampus: 0 })
    const [staff, setStaff] = useState({ total: 0, active: 0, inactive: 0 })
    const [alumni, setAlumni] = useState({ total: 0, completed: 0, dropout: 0 })
    const [events, setEvents] = useState<any[]>([])
    const [showEventModal, setShowEventModal] = useState(false)
    const [isSavingEvent, setIsSavingEvent] = useState(false)
    const [editingEventId, setEditingEventId] = useState<string | null>(null)
    const [attStats, setAttStats] = useState({
        students: { present: 0, absent: 0, late: 0, total: 0 },
        mentors: { present: 0, absent: 0, late: 0, total: 0 }
    })
    const [attTab, setAttTab] = useState<'Students' | 'Mentors'>('Students')
    const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('today')
    const [examPopupOpen, setExamPopupOpen] = useState(false)
    const [reportsPopupOpen, setReportsPopupOpen] = useState(false)
    const [pendingDelegationsCount, setPendingDelegationsCount] = useState(0)

    const defaultEventState = {
        title: "", category: "Celebration", event_for: "All",
        target_roles: [] as string[],
        start_date: "", end_date: "",
        start_time: "09:00", end_time: "10:00", message: ""
    }
    const [newEvent, setNewEvent] = useState(defaultEventState)
    const today = new Date()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            // Was fetching the entire /students payload (with comprehensive_details
            // JSON blob) just to count rows. Now uses a tiny aggregation endpoint.
            // /leaves/outside-students is no longer needed — counts include it.
            const [countsRes, staffRes, evtRes, delRes] = await Promise.all([
                cachedGet("/students/counts", undefined, 60_000),
                cachedGet("/staff", undefined, 60_000),
                cachedGet("/events", undefined, 60_000),
                // count_only=true skips the 3-table JOIN — we only need the
                // badge number on the dashboard, not the full request list.
                api.get("/delegations/admin/all", { params: { count_only: 'true' } }),
            ])
            if (evtRes?.data?.success) {
                setEvents(evtRes.data.events || [])
            }
            if (delRes?.data?.success) {
                setPendingDelegationsCount(delRes.data.pending_count || 0)
            }

            if (countsRes.data.success) {
                const c = countsRes.data.counts
                setStudents({ total: c.active, onCampus: c.on_campus, outCampus: c.out_campus })
                setAlumni({ total: c.alumni, completed: c.completed, dropout: c.dropout })
            }

            if (staffRes.data.success) {
                const d: any[] = staffRes.data.staff || []
                const active = d.filter((s: any) => s.is_active !== false).length
                setStaff({ total: d.length, active, inactive: d.length - active })
            }
        } catch {}
        setLoading(false)
    }, [])

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault()
        if (isSavingEvent) return
        setIsSavingEvent(true)
        try {
            let res;
            if (editingEventId) {
                res = await api.put(`/events/${editingEventId}`, newEvent)
            } else {
                res = await api.post('/events', newEvent)
            }
            if (res.data.success) {
                setShowEventModal(false)
                setNewEvent(defaultEventState)
                setEditingEventId(null)
                load()
            }
        } catch (error: any) {
            alert(error.response?.data?.error || "Error saving event")
        } finally {
            setIsSavingEvent(false)
        }
    }

    const handleDeleteEvent = async (id: string) => {
        if (!confirm("Are you sure you want to delete this event?")) return
        try {
            await api.delete(`/events/${id}`)
            load()
        } catch (error: any) {
            alert(error.response?.data?.error || "Failed to delete event")
        }
    }

    const openEditModal = (ev: any) => {
        setNewEvent({
            title: ev.title || "",
            category: ev.category || "Celebration",
            event_for: ev.event_for || "All",
            target_roles: Array.isArray(ev.target_roles) ? ev.target_roles : (JSON.parse(ev.target_roles || "[]") || []),
            start_date: new Date(ev.start_date || "").toISOString().split("T")[0],
            end_date: new Date(ev.end_date || "").toISOString().split("T")[0],
            start_time: ev.start_time || "09:00",
            end_time: ev.end_time || "10:00",
            message: ev.message || ""
        })
        setEditingEventId(ev.id)
        setShowEventModal(true)
    }

    const handleCloseModal = () => {
        setShowEventModal(false)
        setNewEvent(defaultEventState)
        setEditingEventId(null)
    }

    const getEventStyles = (cat: string) => {
        const t = (cat || "").toLowerCase()
        if (t === 'celebration') return { border: 'border-cyan-400', icon: CalendarDays }
        if (t === 'meeting') return { border: 'border-blue-600', icon: Users }
        if (t === 'training') return { border: 'border-purple-500', icon: BookOpen }
        if (t === 'holidays') return { border: 'border-pink-500', icon: CalendarCheck }
        return { border: 'border-slate-400', icon: Bell }
    }

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        const fetchAttendance = async () => {
            try {
                const dates = (() => {
                    const t = new Date();
                    const e = t.toISOString().split('T')[0];
                    let s = e;
                    if (timeframe === 'week') {
                        const d = new Date(t);
                        d.setDate(d.getDate() - d.getDay()); // Sunday as start of week.
                        s = d.toISOString().split('T')[0];
                    } else if (timeframe === 'month') {
                        const d = new Date(t.getFullYear(), t.getMonth(), 1);
                        s = d.toISOString().split('T')[0];
                    }
                    return { s, e };
                })();
                const res = await api.get("/attendance/daily-stats", { params: { start_date: dates.s, end_date: dates.e } });
                if (res.data.success) {
                    setAttStats({
                        students: res.data.students || { present: 0, absent: 0, late: 0, total: 0 },
                        mentors: res.data.mentors || { present: 0, absent: 0, late: 0, total: 0 }
                    })
                }
            } catch(e) {}
        }
        fetchAttendance()
    }, [timeframe])

    // Mock data for display
    const attData = [{ name: "Present", value: 98.8 }, { name: "Absent",  value: 1.2 }]
    const PIE_COLORS = ["#3b82f6", "#e5e7eb"]

    return (
        <div className="space-y-6 pb-12 w-full max-w-[1600px] mx-auto">

            {/* Title Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[24px] font-black text-slate-800 dark:text-white">Admin Dashboard</h1>
                    <p className="text-[13px] text-slate-500 font-medium">Dashboard / Admin Dashboard</p>
                </div>
                <div className="flex items-center gap-3">
                    <Link href="/admin/students/create"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors">
                        + Add New Student
                    </Link>
                    <Link href="/admin/finance/dashboard"
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[14px] font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors">
                        Fees Details
                    </Link>
                </div>
            </div>

            {/* Welcome Banner - Exact Match */}
            <div className="relative rounded-2xl overflow-hidden bg-[#21293B] px-8 py-7 text-white shadow-sm flex items-center justify-between flex-wrap gap-4">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none select-none overflow-hidden flex items-center justify-end pr-8">
                    {/* Abstract circles / shapes mimicking the reference design */}
                    <div className="h-40 w-40 rounded-full border-[12px] border-[#2A344A] opacity-50 absolute -right-8" />
                    <div className="h-20 w-20 rounded-full bg-[#2A344A] opacity-50 absolute right-16 top-2" />
                </div>
                
                <div className="z-10">
                    <h2 className="text-[28px] font-bold tracking-tight">
                        Welcome Back, Admin <span className="ml-1 inline-block animate-wave origin-bottom-right">👋</span>
                    </h2>
                    <p className="text-[14px] text-slate-400 font-medium mt-1">Have a good day at work</p>
                </div>
                
                <div className="z-10 flex items-center gap-2 text-[13px] font-medium text-slate-300 bg-white/5 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/10">
                    <CalendarDays className="h-4 w-4" />
                    Updated Recently on {today.toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" })}
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    label="Total Students" value={loading ? 0 : students.total} active={loading ? 0 : students.onCampus} inactive={loading ? 0 : students.outCampus}
                    activeLabel="On Campus" inactiveLabel="Out Campus"
                    percent="1.2%" icon={Users} iconBg="bg-pink-50" iconColor="text-pink-500" badgeStyle="bg-green-50 text-green-600"
                />
                <StatCard 
                    label="Total Staff" value={loading ? 0 : staff.total} active={loading ? 0 : staff.active} inactive={loading ? 0 : staff.inactive}
                    percent="1.2%" icon={UserCheck} iconBg="bg-blue-50" iconColor="text-blue-500" badgeStyle="bg-blue-50 text-blue-600"
                />
                <StatCard 
                    label="Total Alumni" value={loading ? 0 : alumni.total} active={loading ? 0 : alumni.completed} inactive={loading ? 0 : alumni.dropout}
                    activeLabel="Completed" inactiveLabel="Dropout"
                    percent="1.2%" icon={GraduationCap} iconBg="bg-orange-50" iconColor="text-orange-500" badgeStyle="bg-orange-50 text-orange-600"
                />
                <StatCard 
                    label="Fee Collection" value={0} active={0} inactive={0}
                    activeLabel="Cleared" inactiveLabel="Pending"
                    percent="1.2%" icon={DollarSign} iconBg="bg-green-50" iconColor="text-green-500" badgeStyle="bg-green-50 text-green-600"
                />
            </div>

            {/* Main Content Grid (3 Columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column */}
                <div className="space-y-6">
                    {/* Schedules inside a bordered card */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white">Schedules</h3>
                            <button onClick={() => { setNewEvent(defaultEventState); setEditingEventId(null); setShowEventModal(true) }} className="text-[13px] font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                <Plus className="h-4 w-4" /> Add New
                            </button>
                        </div>
                        <MiniCalendar events={events} />

                        {/* Upcoming Events Area */}
                        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-700">
                            <h4 className="text-[14px] font-extrabold text-[#1F2937] dark:text-white mb-4">Upcoming Events</h4>
                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                {events.length === 0 ? (
                                    <p className="text-[13px] text-slate-500">No upcoming events.</p>
                                ) : (
                                    events.map((ev, i) => {
                                        const { border, icon: EvIcon } = getEventStyles(ev.category)
                                        return (
                                            <div key={i} className={cn("border-l-[3px] pl-4 py-1 relative", border)}>
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h5 className="text-[14px] font-bold text-slate-800 dark:text-slate-200">{ev.title}</h5>
                                                        <p className="text-[12px] text-slate-500 flex items-center gap-1 mt-1">
                                                            <EvIcon className="h-3.5 w-3.5" /> {new Date(ev.start_date).toLocaleDateString("en-US", { day: 'numeric', month: 'long', year: 'numeric' })}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 mt-2 font-medium uppercase">{ev.start_time.substring(0,5)} - {ev.end_time.substring(0,5)}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <button onClick={() => openEditModal(ev)} className="text-slate-400 hover:text-blue-600 transition-colors">
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                        <button onClick={() => handleDeleteEvent(ev.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Middle Column */}
                <div className="space-y-6">
                    {/* Attendance Card */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white">Attendance</h3>
                            <div className="relative">
                                <select 
                                    className="appearance-none border border-slate-200 rounded-lg pl-8 pr-6 py-1.5 text-[12px] font-medium text-slate-600 bg-white outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                    value={timeframe}
                                    onChange={(e) => setTimeframe(e.target.value as any)}
                                >
                                    <option value="today">Today</option>
                                    <option value="week">This Week</option>
                                    <option value="month">This Month</option>
                                </select>
                                <CalendarDays className="h-3.5 w-3.5 absolute left-2.5 top-[6px] text-slate-500 pointer-events-none" />
                                <ChevronRight className="h-3 w-3 rotate-90 absolute right-2.5 top-[9px] text-slate-500 pointer-events-none" />
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 dark:border-slate-700 gap-6 mb-5">
                            {["Students", "Mentors"].map((tab) => (
                                <button key={tab} onClick={() => setAttTab(tab as any)} className={`text-[14px] font-bold pb-2.5 transition-colors border-b-[3px] ${
                                    attTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                                }`}>{tab}</button>
                            ))}
                        </div>

                        {/* Present/Absent Tabs Block */}
                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-[#F8F9FA] dark:bg-slate-700/50 rounded-lg py-3 text-center">
                                <h4 className="text-[18px] font-black text-slate-800 dark:text-white">{loading ? "-" : String(attTab === 'Students' ? attStats.students.present : attStats.mentors.present).padStart(2, '0')}</h4>
                                <p className="text-[12px] font-semibold text-slate-500">Present</p>
                            </div>
                            <div className="bg-[#F8F9FA] dark:bg-slate-700/50 rounded-lg py-3 text-center">
                                <h4 className="text-[18px] font-black text-slate-800 dark:text-white">{loading ? "-" : String(attTab === 'Students' ? attStats.students.absent : attStats.mentors.absent).padStart(2, '0')}</h4>
                                <p className="text-[12px] font-semibold text-slate-500">Absent</p>
                            </div>
                            <div className="bg-[#F8F9FA] dark:bg-slate-700/50 rounded-lg py-3 text-center">
                                <h4 className="text-[18px] font-black text-slate-800 dark:text-white">{loading ? "-" : String(attTab === 'Students' ? attStats.students.late : attStats.mentors.late).padStart(2, '0')}</h4>
                                <p className="text-[12px] font-semibold text-slate-500">Late</p>
                            </div>
                        </div>

                        {/* Donut Chart */}
                        {(() => {
                            const curStats = attTab === 'Students' ? attStats.students : attStats.mentors;
                            const tVal = curStats.total || 0;
                            // Make it look smooth by providing a grey circle if everything is 0
                            const pieData = tVal === 0 
                                ? [{ name: "No Data", value: 1 }] 
                                : [
                                    { name: "Present", value: Math.max((curStats.present / tVal) * 100, 2) }, // minimum 2% sliver to be visible
                                    { name: "Absent", value: Math.max((curStats.absent / tVal) * 100, 0) },
                                    { name: "Late", value: Math.max((curStats.late / tVal) * 100, 0) }
                                  ];
                            
                            const pctText = tVal === 0 ? "0%" : `${((curStats.present / tVal) * 100).toFixed(1)}%`;
                            const activeColors = tVal === 0 ? ["#e5e7eb"] : ["#3b82f6", "#ef4444", "#f59e0b"]; // gray vs blue, red, orange

                            return (
                                <div className="relative h-48 w-full flex items-center justify-center mb-6">
                                    <ResponsiveContainer width={180} height={180}>
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value" stroke="none">
                                                {pieData.map((_, i) => <Cell key={i} fill={activeColors[i]} />)}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex items-center justify-center font-black text-[18px] text-white">
                                        <span className="text-slate-800 dark:text-white font-bold text-lg">{pctText}</span>
                                    </div>
                                </div>
                            )
                        })()}

                        <div className="flex justify-center">
                            <Link href="/admin/student-attendance" className="border border-slate-200 bg-[#F8F9FA] text-slate-700 text-[13px] font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-100">
                                <CalendarDays className="h-4 w-4" /> View All
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    {/* Quick Links Blocks */}
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 p-6 shadow-sm">
                        <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white mb-5">Quick Links</h3>
                        
                        <div className="flex flex-wrap gap-4">
                            <QuickLink href="/admin/calendar"           label="Calendar"    icon={CalendarDays} bg="bg-[#E8F8F0]" iconBg="bg-[#22C55E]" />
                            <QuickLink label="Exam Result"              onClick={() => setExamPopupOpen(true)} icon={BarChart2}    bg="bg-[#EBF2FF]" iconBg="bg-[#3B82F6]" />
                            <QuickLink href="/admin/student-attendance" label="Attendance"  icon={UserCheck}    bg="bg-[#FFF8E1]" iconBg="bg-[#F59E0B]" />
                            
                            <QuickLink href="/admin/finance/dashboard"  label="Fees"        icon={DollarSign}   bg="bg-[#E0F7FA]" iconBg="bg-[#06B6D4]" />
                            <QuickLink label="Reports"                 onClick={() => setReportsPopupOpen(true)} icon={FileText}     bg="bg-[#E0F2FE]" iconBg="bg-[#0EA5E9]" />
                            
                            <Link href="/admin/delegations" className="flex flex-col items-center justify-center py-5 rounded-xl bg-purple-50 hover:shadow flex-1 min-w-[30%] transition-all relative">
                                {pendingDelegationsCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                                        {pendingDelegationsCount}
                                    </span>
                                )}
                                <div className="h-[42px] w-[42px] rounded-full flex items-center justify-center bg-purple-600 text-white shadow-sm mb-3 transition-transform hover:scale-110">
                                    <Bell className="h-5 w-5" />
                                </div>
                                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">Requests</span>
                            </Link>
                        </div>
                    </div>

                </div>

            </div>

            {/* ── Event Modal ──────────────────────────────────────────────────────── */}
            <EventModal
                isOpen={showEventModal}
                onClose={handleCloseModal}
                onSaveSuccess={() => load()}
                editingEventId={editingEventId}
                initialData={newEvent}
            />

            {/* Bottom Rectangle Action Tiles as shown in Screenshot 2647 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 gap-6">
                {[
                    { href: "/admin/student-attendance", label: "View Attendance",    icon: CalendarDays, bg: "bg-[#FFF9E5]", iconBg: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
                    { href: "/admin/calendar",           label: "New Events",         icon: Bell,         bg: "bg-[#E8F8F0]", iconBg: "bg-[#22C55E]", text: "text-[#22C55E]" },
                    { href: "/admin/finance/dashboard",  label: "Finance & Accounts", icon: UserCheck,    bg: "bg-[#E0F7FA]", iconBg: "bg-[#06B6D4]", text: "text-[#06B6D4]" },
                ].map((tile, i) => (
                    <Link key={i} href={tile.href} className={`${tile.bg} rounded-xl p-5 flex items-center justify-between group`}>
                        <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-lg ${tile.iconBg} flex items-center justify-center shadow-sm`}>
                                <tile.icon className="h-6 w-6 text-white" />
                            </div>
                            <span className="text-[14px] font-bold text-slate-800">{tile.label}</span>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center group-hover:bg-slate-50 transition-colors">
                            <ChevronRight className={`h-4 w-4 ${tile.text}`} />
                        </div>
                    </Link>
                ))}
            </div>

            {/* ── Exam Router Modal ──────────────────────────────────────────────────────── */}
            {examPopupOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[24px] shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden">
                        <div className="p-6 text-center border-b border-slate-100 dark:border-slate-800 relative">
                            <div className="h-16 w-16 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <BarChart2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-[20px] font-black text-slate-800 dark:text-white">Select Section</h2>
                            <p className="text-[14px] text-slate-500 font-medium mt-1">Choose which academic section's exams you want to manage.</p>
                            <button onClick={() => setExamPopupOpen(false)} className="absolute top-4 right-4 h-8 w-8 bg-slate-100 text-slate-500 hover:text-slate-800 rounded-full flex items-center justify-center transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                            <Link href="/admin/madrassa/exams" className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 hover:shadow-md rounded-xl p-4 flex items-center justify-between group transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                                        <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">Madrassa</h4>
                                        <p className="text-[12px] text-slate-500 font-medium font-medium">Manage madrassa exams</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                            </Link>
                            
                            <Link href="/admin/hifz/exams" className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 hover:shadow-md rounded-xl p-4 flex items-center justify-between group transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                        <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">Hifz</h4>
                                        <p className="text-[12px] text-slate-500 font-medium font-medium">Manage hifz exams</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                            </Link>

                            <Link href="/admin/school/exams" className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-blue-500 hover:shadow-md rounded-xl p-4 flex items-center justify-between group transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-rose-50 dark:bg-rose-900/30 rounded-lg flex items-center justify-center">
                                        <Users className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">School</h4>
                                        <p className="text-[12px] text-slate-500 font-medium font-medium">Manage school exams</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}
            
            {/* ── Reports Router Modal ──────────────────────────────────────────────────────── */}
            {reportsPopupOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[24px] shadow-2xl border border-slate-100 dark:border-slate-800 flex flex-col overflow-hidden">
                        <div className="p-6 text-center border-b border-slate-100 dark:border-slate-800 relative">
                            <div className="h-16 w-16 bg-cyan-50 dark:bg-cyan-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FileText className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
                            </div>
                            <h2 className="text-[20px] font-black text-slate-800 dark:text-white">Generate Reports</h2>
                            <p className="text-[14px] text-slate-500 font-medium mt-1">Select which type of comprehensive report to view and download.</p>
                            <button onClick={() => setReportsPopupOpen(false)} className="absolute top-4 right-4 h-8 w-8 bg-slate-100 text-slate-500 hover:text-slate-800 rounded-full flex items-center justify-center transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-3 bg-slate-50/50 dark:bg-slate-900/50">
                            
                            <Link href="/admin/reports/students" className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-cyan-500 hover:shadow-md rounded-xl p-4 flex items-center justify-between group transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                                        <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">Students</h4>
                                        <p className="text-[12px] text-slate-500 font-medium font-medium">Detailed student records</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-600 transition-colors" />
                            </Link>

                            <Link href="/admin/reports/mentors" className="w-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-cyan-500 hover:shadow-md rounded-xl p-4 flex items-center justify-between group transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                                        <UserCog className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="text-[15px] font-bold text-slate-800 dark:text-white">Mentors</h4>
                                        <p className="text-[12px] text-slate-500 font-medium font-medium">Mentor performance & leaves</p>
                                    </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-cyan-600 transition-colors" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
