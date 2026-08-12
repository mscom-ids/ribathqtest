"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
    Users, BookOpen,
    CalendarDays, ChevronLeft, ChevronRight,
    Bell, FileText, DollarSign, BarChart2,
    UserCheck, CalendarCheck,
    GraduationCap, X, Plus,
    Edit2, Trash2, UserCog, ShieldCheck
} from "lucide-react"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { cn } from "@/lib/utils"
import {
    Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"
import EventModal from "@/components/shared/EventModal"

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString() }

const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
]
const WEEK = ["Su","Mo","Tu","We","Th","Fr","Sa"]
const DASHBOARD_EVENTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_EVENTS === "true"
const DASHBOARD_DELEGATIONS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DASHBOARD_DELEGATIONS === "true"

// ── Mini calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({ events = [] }: { events?: any[] }) {
    const [today, setToday] = useState<Date | null>(null)
    const [year, setYear] = useState<number | null>(null)
    const [month, setMonth] = useState<number | null>(null)

    useEffect(() => {
        const localToday = new Date()
        setToday(localToday)
        setYear(localToday.getFullYear())
        setMonth(localToday.getMonth())
    }, [])

    if (!today || year === null || month === null) {
        return <div className="h-[270px] animate-pulse rounded-md bg-slate-50 dark:bg-slate-800/50" />
    }

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const prev = () => { if (month === 0) { setMonth(11); setYear(year - 1) } else setMonth(month - 1) }
    const next = () => { if (month === 11) { setMonth(0); setYear(year + 1) } else setMonth(month + 1) }

    const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

    // Map events to date strings for quick lookup [Year-Month-Date] -> 2024-6-15
    const eventDates = events.map(e => {
        const d = new Date(e.start_date)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })

    return (
        <div>
            <div className="mb-3 mt-1 flex items-center justify-between">
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
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day, i) => {
                    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                    const hasEvent = day ? eventDates.includes(`${year}-${month}-${day}`) : false

                    return (
                        <div key={i} className="relative flex h-9 flex-col items-center justify-center">
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

function DashboardUpdatedDate() {
    const [label, setLabel] = useState("Updated recently")

    useEffect(() => {
        setLabel(`Updated Recently on ${new Date().toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "numeric",
        })}`)
    }, [])

    return <>{label}</>
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
    label, value, active, inactive, icon: Icon, iconBg, iconColor, activeLabel, inactiveLabel
}: {
    label: string
    value: number
    active: number
    inactive: number
    icon: React.ElementType
    iconBg: string
    iconColor: string
    activeLabel?: string
    inactiveLabel?: string
}) {
    return (
        <div className="group flex h-full flex-col justify-between rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${iconBg} transition-transform duration-300 group-hover:scale-105`}>
                    <Icon className={`h-6 w-6 ${iconColor}`} />
                </div>

                <div className="flex min-w-0 flex-col items-end">
                    <span className="text-[28px] font-black leading-none text-slate-900 dark:text-white">
                        {fmt(value)}
                    </span>
                    <p className="mt-1 text-right text-[12px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
                </div>
            </div>

            <div className="mb-2.5 w-full border-t border-slate-100 dark:border-slate-700" />

            <div className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                <div className="truncate">
                    {activeLabel || 'Active'} : <span className="text-slate-800 dark:text-slate-200 pl-1">{fmt(active)}</span>
                </div>
                <div className="truncate text-right">
                    {inactiveLabel || 'Inactive'} : <span className="text-slate-800 dark:text-slate-200 pl-1">{fmt(inactive).padStart(2, '0')}</span>
                </div>
            </div>
        </div>
    )
}


function QuickLink({ href, label, icon: Icon, bg, iconBg, onClick }: {
    href?: string; label: string; icon: React.ElementType; bg: string; iconBg: string; onClick?: () => void;
}) {
    const inner = (
        <>
            <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${iconBg} text-white shadow-sm transition-transform group-hover:scale-105`}>
                <Icon className="h-4 w-4" />
            </div>
            <span className="min-w-0 flex-1 text-left text-[13px] font-bold text-slate-700 dark:text-slate-200">{label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
        </>
    )
    const cls = `group flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 dark:border-white/10 ${bg} hover:shadow-md transition-all duration-200`
    if (onClick) {
        return <button onClick={onClick} className={cls}>{inner}</button>
    }
    return <Link href={href!} className={cls}>{inner}</Link>

}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
    const [loading, setLoading] = useState(true)
    const [students, setStudents] = useState({ total: 0, onCampus: 0, outCampus: 0 })
    const [staff, setStaff] = useState({ total: 0, active: 0, inactive: 0 })
    const [alumni, setAlumni] = useState({ total: 0, completed: 0, dropout: 0 })
    const [hifzMilestones, setHifzMilestones] = useState(() => [0, 5, 10, 15, 20, 25, 30].map(milestone => ({ milestone, count: 0 })))
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
    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await cachedGet("/dashboard/admin", undefined, 60_000)
            if (res.data?.success) {
                const summary = res.data.summary;
                if (summary.students) {
                    setStudents({ 
                        total: summary.students.active, 
                        onCampus: summary.students.on_campus, 
                        outCampus: summary.students.out_campus 
                    })
                    setAlumni({ 
                        total: summary.students.alumni, 
                        completed: summary.students.completed, 
                        dropout: summary.students.dropout 
                    })
                }
                if (summary.staff) {
                    setStaff({ 
                        total: summary.staff.total, 
                        active: summary.staff.active, 
                        inactive: summary.staff.inactive 
                    })
                }
                if (Array.isArray(summary.hifz_milestones)) {
                    setHifzMilestones([0, 5, 10, 15, 20, 25, 30].map(milestone => {
                        const item = summary.hifz_milestones.find((entry: any) => Number(entry.milestone) === milestone)
                        return { milestone, count: Number(item?.count || 0) }
                    }))
                }
                
                setEvents(summary.events || [])
                setPendingDelegationsCount(summary.pending_delegations || 0)
            }
        } catch {
            // Keep the dashboard usable when the summary API is temporarily unavailable.
        }
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
                    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const t = new Date();
                    const e = fmt(t);
                    let s = e;
                    if (timeframe === 'week') {
                        const d = new Date(t);
                        d.setDate(d.getDate() - d.getDay()); // Sunday as start of week.
                        s = fmt(d);
                    } else if (timeframe === 'month') {
                        const d = new Date(t.getFullYear(), t.getMonth(), 1);
                        s = fmt(d);
                    }
                    return { s, e };
                })();
                const res = await cachedGet("/attendance/daily-stats", { start_date: dates.s, end_date: dates.e }, 30_000);
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

    const hifzChartData = hifzMilestones.map(({ milestone, count }) => ({
        label: milestone === 30 ? "Hafiz (30)" : `${milestone}-${milestone + 4} Juz`,
        students: count,
        milestone,
    }))
    const totalHifzStudents = hifzChartData.reduce((sum, item) => sum + item.students, 0)
    const completedHifzStudents = hifzChartData.find(item => item.milestone === 30)?.students || 0
    const HIFZ_COLORS = ["#60a5fa", "#3b82f6", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea", "#059669"]

    return (
        <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-8">

            <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 px-5 py-4 text-white shadow-sm sm:px-6">
                <div className="pointer-events-none absolute inset-0 opacity-15" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "76px 100%" }} />
                <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-1/4 select-none items-center justify-end overflow-hidden pr-8">
                    <div className="absolute -right-8 h-28 w-28 rounded-full border-[10px] border-white/20" />
                    <div className="absolute right-10 top-1 h-12 w-12 rounded-full bg-white/10" />
                </div>
                
                <div className="z-10">
                    <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                        Welcome Back, Admin <span className="ml-1 inline-block animate-wave origin-bottom-right">👋</span>
                    </h2>
                    <p className="mt-0.5 text-[13px] font-medium text-blue-100">Your institution's performance and operations for today.</p>
                </div>
                
                <div className="z-10 flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-blue-50 backdrop-blur-sm">
                    <CalendarDays className="h-4 w-4" />
                    <DashboardUpdatedDate />
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Total Students" value={loading ? 0 : students.total} active={loading ? 0 : students.onCampus} inactive={loading ? 0 : students.outCampus}
                    activeLabel="On Campus" inactiveLabel="Out Campus"
                    icon={Users} iconBg="bg-pink-50" iconColor="text-pink-500"
                />
                <StatCard
                    label="Total Staff" value={loading ? 0 : staff.total} active={loading ? 0 : staff.active} inactive={loading ? 0 : staff.inactive}
                    icon={UserCheck} iconBg="bg-blue-50" iconColor="text-blue-500"
                />
                <StatCard
                    label="Total Alumni" value={loading ? 0 : alumni.total} active={loading ? 0 : alumni.completed} inactive={loading ? 0 : alumni.dropout}
                    activeLabel="Completed" inactiveLabel="Dropout"
                    icon={GraduationCap} iconBg="bg-orange-50" iconColor="text-orange-500"
                />
                <StatCard
                    label="Fee Collection" value={0} active={0} inactive={0}
                    activeLabel="Cleared" inactiveLabel="Pending"
                    icon={DollarSign} iconBg="bg-green-50" iconColor="text-green-500"
                />
            </div>

            {/* Balanced dashboard rows: Attendance + Hifz, then Schedule + Quick Links */}
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">

                {/* Left Column */}
                <div className="h-full xl:order-3 xl:col-span-8">
                    {/* Schedules inside a bordered card */}
                    <div className="h-full rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white">Schedules</h3>
                            <button onClick={() => { setNewEvent(defaultEventState); setEditingEventId(null); setShowEventModal(true) }} className="text-[13px] font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                <Plus className="h-4 w-4" /> Add New
                            </button>
                        </div>
                        <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(230px,.85fr)]">
                            <div className="min-w-0 rounded-xl bg-slate-50/70 px-4 py-2 dark:bg-slate-900/50">
                                <MiniCalendar events={events} />
                            </div>

                        {/* Upcoming Events Area */}
                        <div className="border-t border-slate-100 pt-4 dark:border-slate-700 md:border-l md:border-t-0 md:pl-5 md:pt-1">
                            <h4 className="text-[14px] font-extrabold text-[#1F2937] dark:text-white mb-4">Upcoming Events</h4>
                            <div className="max-h-[280px] space-y-4 overflow-y-auto pr-2">
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
                </div>

                {/* Middle Column */}
                <div className="h-full xl:order-1 xl:col-span-4">
                    {/* Attendance Card */}
                    <div className="h-full rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
                <div className="contents">
                    {/* Quick Links Blocks */}
                    <div className="h-full rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 xl:order-4 xl:col-span-4">
                        <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white">Quick Links</h3>
                        <p className="mb-4 mt-0.5 text-xs text-slate-500">Frequently used admin actions</p>
                        
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                            <QuickLink href="/admin/calendar"           label="Calendar"    icon={CalendarDays} bg="bg-[#E8F8F0]" iconBg="bg-[#22C55E]" />
                            <QuickLink label="Exam Result"              onClick={() => setExamPopupOpen(true)} icon={BarChart2}    bg="bg-[#EBF2FF]" iconBg="bg-[#3B82F6]" />
                            <QuickLink href="/admin/student-attendance" label="Attendance"  icon={UserCheck}    bg="bg-[#FFF8E1]" iconBg="bg-[#F59E0B]" />
                            <QuickLink href="/admin/finance/dashboard"  label="Fees"        icon={DollarSign}   bg="bg-[#E0F7FA]" iconBg="bg-[#06B6D4]" />
                            <QuickLink label="Reports"                 onClick={() => setReportsPopupOpen(true)} icon={FileText}     bg="bg-[#E0F2FE]" iconBg="bg-[#0EA5E9]" />
                            <QuickLink href="/admin/mentor-access"      label="Mentor Locks" icon={ShieldCheck}  bg="bg-[#EEF2FF]" iconBg="bg-[#6366F1]" />

                            <Link href="/admin/delegations" className="group relative flex items-center gap-3 rounded-xl bg-purple-50 px-3 py-3 transition-all duration-200 hover:shadow-md">
                                {pendingDelegationsCount > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                                        {pendingDelegationsCount}
                                    </span>
                                )}
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white shadow-sm transition-transform group-hover:scale-105">
                                    <Bell className="h-4 w-4" />
                                </div>
                                <span className="flex-1 text-[13px] font-bold text-slate-700 dark:text-slate-200">Requests</span>
                                <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                            </Link>
                        </div>
                    </div>

                    <div className="h-full min-w-0 rounded-xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 xl:order-2 xl:col-span-8">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-[16px] font-extrabold text-[#1F2937] dark:text-white">Hifz Progress Distribution</h3>
                                <p className="mt-0.5 text-xs text-slate-500">Active students grouped by completed Juz.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-blue-50 px-3 py-2 text-right dark:bg-blue-950/30">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Active Hifz</p>
                                    <p className="text-lg font-black leading-none text-blue-700 dark:text-blue-300">{loading ? "-" : totalHifzStudents}</p>
                                </div>
                                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right dark:bg-emerald-950/30">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Hafiz</p>
                                    <p className="text-lg font-black leading-none text-emerald-700 dark:text-emerald-300">{loading ? "-" : completedHifzStudents}</p>
                                </div>
                            </div>
                        </div>
                        <div className="relative h-[250px] min-w-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hifzChartData} layout="vertical" margin={{ top: 8, right: 14, left: 2, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="label" width={76} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: "#f8fafc" }} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px rgba(15,23,42,.08)" }} />
                                    <Bar dataKey="students" name="Students" radius={[0, 6, 6, 0]} maxBarSize={18}>
                                        {hifzChartData.map((item, index) => <Cell key={item.label} fill={HIFZ_COLORS[index]} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            {!loading && totalHifzStudents === 0 && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <div className="rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">No Hifz progress recorded yet</p>
                                        <p className="mt-0.5 text-xs text-slate-500">The chart will fill as students complete Juz.</p>
                                    </div>
                                </div>
                            )}
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
