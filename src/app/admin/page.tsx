"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    Users, ArrowUpRight, XCircle, UserCheck, FileText, Clock,
    TrendingUp, BookOpen, Landmark, CalendarDays, MoreHorizontal,
    Plus, Download, Play, GraduationCap, CheckCircle2,
} from "lucide-react"
import api from "@/lib/api"
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"

// ── Week data for chart ──────────────────────────────────────────────────────
// Donezo shows 2 bars per day with varying shades
const chartData = [
    { day: 'S', curr: 45,  prev: 60 },
    { day: 'M', curr: 80,  prev: 110 },
    { day: 'T', curr: 120, prev: 140 },
    { day: 'W', curr: 155, prev: 130 },
    { day: 'T', curr: 110, prev: 130 },
    { day: 'F', curr: 75,  prev: 90 },
    { day: 'S', curr: 35,  prev: 50 },
]

// ── Quick nav links (right card) ─────────────────────────────────────────────
const quickLinks = [
    { href: "/admin/students",            label: "Manage Students",    desc: "View & edit records",    color: "#7de0a8" },
    { href: "/admin/staff",               label: "Staff Records",      desc: "Mentor management",      color: "#6baad6" },
    { href: "/admin/finance/dashboard",   label: "Fee Dashboard",      desc: "Payment overview",       color: "#f5c04a" },
    { href: "/admin/hifz/tracking",       label: "Hifz Tracking",      desc: "Memorisation progress",  color: "#e87b7b" },
    { href: "/admin/hifz/monthly-report", label: "Monthly Report",     desc: "Generate & export",      color: "#b07fdc" },
]

// ── Pending tasks ────────────────────────────────────────────────────────────
const tasks = [
    { label: "Approve leave requests",   status: "Pending",     color: "#f5c04a" },
    { label: "Update class schedules",   status: "In Progress", color: "#6baad6" },
    { label: "Review fee submissions",   status: "In Progress", color: "#6baad6" },
    { label: "Publish Hifz results",     status: "Pending",     color: "#f5c04a" },
    { label: "Staff attendance review",  status: "Completed",   color: "#3dbf82" },
]

// ── Donezo-style white card ──────────────────────────────────────────────────
function Card({ children, className = "", hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
    return (
        <div className={`bg-white rounded-2xl border border-[#e8ede9] ${hover ? 'hover:shadow-md transition-shadow' : ''} ${className}`}>
            {children}
        </div>
    )
}

// ── Stat card — first one is dark green like Donezo ─────────────────────────
function StatCard({
    label, value, sub, dark = false, href,
}: {
    label: string; value: string | number; sub?: string; dark?: boolean; href: string
}) {
    return (
        <Link href={href}>
            <div className={`rounded-2xl p-5 flex flex-col justify-between h-full min-h-[130px] hover:shadow-lg transition-all duration-200 cursor-pointer border ${
                dark
                    ? "border-transparent text-white"
                    : "bg-white border-[#e8ede9] text-[#1a1a1a]"
            }`}
            style={dark ? { background: 'linear-gradient(160deg, #1a3d2a 0%, #264f37 50%, #2d6b45 100%)' } : undefined}
            >
                <div className="flex items-center justify-between">
                    <p className={`text-[12px] font-semibold ${dark ? "text-white/60" : "text-[#9ca3af]"}`}>{label}</p>
                    <div className={`h-7 w-7 rounded-full border flex items-center justify-center ${dark ? "border-white/20 text-white/50 hover:bg-white/10" : "border-[#e8ede9] text-[#9ca3af] hover:bg-[#f5f9f6]"} transition-colors`}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </div>
                </div>
                <div>
                    <p className={`text-[32px] font-black leading-none ${dark ? "text-white" : "text-[#1a1a1a]"}`}>{value}</p>
                    {sub && (
                        <p className={`text-[10px] font-semibold mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${dark ? "bg-white/10 text-[#7de0a8]" : "bg-[#eaf4ee] text-[#2d6b45]"}`}>
                            <CheckCircle2 className="h-3 w-3" /> {sub}
                        </p>
                    )}
                </div>
            </div>
        </Link>
    )
}

const tooltipStyle = {
    contentStyle: { background: '#fff', border: '1px solid #e8ede9', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', fontSize: '12px', fontWeight: 700 },
    cursor: { fill: 'rgba(26,61,42,0.03)' },
}

// ── Custom bar shape with rounded caps (Donezo style) ────────────────────────
function RoundedBar(props: any) {
    const { x, y, width, height, fill } = props
    if (!height || height <= 0) return null
    const r = Math.min(8, width / 2)
    return (
        <g>
            <rect x={x} y={y} width={width} height={height} rx={r} ry={r} fill={fill} />
        </g>
    )
}

export default function AdminDashboardPage() {
    const [stats, setStats] = useState({ students: 0, active: 0, complete: 0, dropout: 0 })
    const [loading, setLoading] = useState(true)
    const [dateInfo, setDateInfo] = useState({ dayStr: '', dateStr: '' })

    useEffect(() => {
        const today = new Date()
        setDateInfo({
            dayStr: today.toLocaleDateString('en-US', { weekday: 'long' }),
            dateStr: today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        })
    }, [])

    useEffect(() => {
        async function load() {
            setLoading(true)
            try {
                const res = await api.get('/students', { params: { status: 'all' } })
                if (res.data.success) {
                    const d: any[] = res.data.students || []
                    let students = d.length, active = 0, complete = 0, dropout = 0
                    d.forEach((s: any) => {
                        const st = (s.status || 'active').toLowerCase()
                        if (st.includes('drop')) dropout++
                        else if (st.includes('complet')) complete++
                        else active++
                    })
                    setStats({ students, active, complete, dropout })
                }
            } catch {}
            setLoading(false)
        }
        load()
    }, [])

    const n = (v: number) => loading ? '—' : v

    return (
        <div className="space-y-6 pb-10 text-[#1a1a1a]">

            {/* ── Page header — Donezo style ──────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-[28px] font-black text-[#1a1a1a] leading-tight">Dashboard</h1>
                    <p className="text-[13px] text-[#9ca3af] mt-1">{dateInfo.dayStr}, {dateInfo.dateStr} · Welcome back to Ma'din Admin Portal.</p>
                </div>
                <div className="flex items-center gap-2.5">
                    <Link href="/admin/students/create"
                        className="inline-flex items-center gap-2 bg-[#1a3d2a] hover:bg-[#2d6b45] text-white text-[13px] font-bold px-5 py-2.5 rounded-xl shadow-md shadow-[#1a3d2a]/20 transition-all hover:scale-105 active:scale-95">
                        <Plus className="h-4 w-4" /> Add Student
                    </Link>
                    <Link href="/admin/hifz/monthly-report"
                        className="inline-flex items-center gap-2 border border-[#e8ede9] bg-white text-[#1a1a1a] text-[13px] font-bold px-5 py-2.5 rounded-xl hover:border-[#2d6b45]/40 hover:text-[#1a3d2a] transition-all">
                        <Download className="h-4 w-4" /> Export Report
                    </Link>
                </div>
            </div>

            {/* ── Stat cards — first card dark green ─────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Students"  value={n(stats.students)} dark href="/admin/students" />
                <StatCard label="Active Students" value={n(stats.active)}   href="/admin/students?status=active" />
                <StatCard label="Graduates"        value={n(stats.complete)} href="/admin/alumni" />
                <StatCard label="Dropouts"         value={n(stats.dropout)}  href="/admin/students?status=dropout" />
            </div>

            {/* ── Main 3-col grid ─────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* ── Chart + Tasks (2/3) ─────────────────────────────────── */}
                <div className="lg:col-span-2 space-y-4">

                    {/* Chart card */}
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-[15px] font-bold text-[#1a1a1a]">Student Analytics</h3>
                                <p className="text-[11px] text-[#9ca3af] mt-0.5">Weekly attendance performance</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="px-3 py-1.5 rounded-lg bg-[#1a3d2a] text-white text-[11px] font-bold">All Class</button>
                                <button className="px-3 py-1.5 rounded-lg bg-[#f7f9f7] border border-[#e8ede9] text-[#9ca3af] text-[11px] font-bold hover:bg-[#eaf4ee] transition">English</button>
                                <button className="h-7 w-7 flex items-center justify-center rounded-lg bg-[#f7f9f7] border border-[#e8ede9] text-[#9ca3af]">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} barGap={3} barCategoryGap="32%">
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 700, fill: '#9ca3af' }} />
                                    <YAxis hide />
                                    <Tooltip {...tooltipStyle} />
                                    <Bar dataKey="prev" name="Previous" shape={<RoundedBar />} fill="#c8e6d4" />
                                    <Bar dataKey="curr" name="Current" shape={<RoundedBar />} fill="#1a3d2a" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Team tasks — like Donezo's Team Collaboration card */}
                    <Card className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-[15px] font-bold text-[#1a1a1a]">Pending Tasks</h3>
                            <button className="text-[11px] font-bold text-[#2d6b45] border border-[#c8e6d4] bg-[#eaf4ee] px-3 py-1.5 rounded-lg hover:bg-[#d4f0df] transition">
                                + Add Task
                            </button>
                        </div>
                        <div className="space-y-3">
                            {tasks.map((t, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-[#f5f5f5] last:border-0">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold" style={{ background: t.color }}>
                                            {t.label[0]}
                                        </div>
                                        <p className="text-[12px] font-semibold text-[#333]">{t.label}</p>
                                    </div>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                                        background: t.status === 'Completed' ? '#eaf4ee' : t.status === 'In Progress' ? '#e8f4fd' : '#fefce8',
                                        color: t.status === 'Completed' ? '#2d6b45' : t.status === 'In Progress' ? '#2563eb' : '#a16207',
                                    }}>{t.status}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* ── Right sidebar col (1/3) ────────────────────────────── */}
                <div className="space-y-4">
                    {/* Reminders card — dark green CTA like Donezo */}
                    <Card className="p-5">
                        <h3 className="text-[13px] font-bold text-[#9ca3af] uppercase tracking-widest mb-3">Reminders</h3>
                        <div className="space-y-3">
                            <div className="p-3 rounded-xl bg-[#f7f9f7] border border-[#e8ede9]">
                                <p className="text-[13px] font-bold text-[#1a1a1a]">Staff Meeting</p>
                                <p className="text-[11px] text-[#9ca3af] mt-0.5">Today · 10:00 am – 11:30 am</p>
                                <button className="mt-3 w-full flex items-center justify-center gap-2 bg-[#1a3d2a] hover:bg-[#2d6b45] text-white text-[11px] font-bold py-2 rounded-lg transition-colors">
                                    <Play className="h-3 w-3" /> Start Meeting
                                </button>
                            </div>
                            <div className="p-3 rounded-xl bg-[#f7f9f7] border border-[#e8ede9]">
                                <p className="text-[13px] font-bold text-[#1a1a1a]">Fee Submission Deadline</p>
                                <p className="text-[11px] text-[#9ca3af] mt-0.5">Mar 25, 2026</p>
                            </div>
                        </div>
                    </Card>

                    {/* Quick Links card — like Donezo's Project list */}
                    <Card className="p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[13px] font-bold text-[#9ca3af] uppercase tracking-widest">Quick Access</h3>
                            <button className="text-[10px] font-bold border border-[#e8ede9] px-2.5 py-1 rounded-lg text-[#9ca3af] hover:border-[#2d6b45]/40 hover:text-[#1a3d2a] transition">+ New</button>
                        </div>
                        <div className="space-y-1">
                            {quickLinks.map(({ href, label, desc, color }) => (
                                <Link key={href} href={href}
                                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f7f9f7] transition-colors group">
                                    <div className="h-6 w-6 rounded-lg shrink-0 flex items-center justify-center" style={{ background: color + '30' }}>
                                        <div className="h-2 w-2 rounded-full" style={{ background: color }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold text-[#1a1a1a] group-hover:text-[#1a3d2a] truncate transition-colors">{label}</p>
                                        <p className="text-[10px] text-[#9ca3af] truncate">{desc}</p>
                                    </div>
                                    <ArrowUpRight className="h-3.5 w-3.5 text-[#e8ede9] group-hover:text-[#2d6b45] shrink-0 transition-colors" />
                                </Link>
                            ))}
                        </div>
                    </Card>

                    {/* Time / Progress tracker — Donezo dark green card */}
                    <div className="rounded-2xl p-5 text-white relative overflow-hidden"
                        style={{ background: 'linear-gradient(140deg, #1a3d2a 0%, #2d6b45 100%)' }}>
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                        <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest">Academic Progress</p>
                        <div className="mt-3 flex items-end gap-2">
                            <span className="text-[36px] font-black leading-none">41%</span>
                            <span className="text-[13px] text-white/60 pb-1">of year done</span>
                        </div>
                        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-[#7de0a8] rounded-full" style={{ width: '41%' }} />
                        </div>
                        <div className="mt-3 flex gap-3 text-[10px] font-bold text-white/50">
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#7de0a8]" />Completed</span>
                            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white/30" />Remaining</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
