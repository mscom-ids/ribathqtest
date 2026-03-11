"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
    Users,
    GraduationCap,
    CalendarCheck,
    Clock,
    MoreHorizontal,
    Plus,
    School,
    BookOpen,
    ArrowUpRight,
    TrendingUp,
    CheckCircle2,
    XCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { format } from "date-fns"
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts"
import { Calendar } from "@/components/ui/calendar"

// Mock Data for Chart
const activityData = [
    { name: 'Mon', count: 120 },
    { name: 'Tue', count: 132 },
    { name: 'Wed', count: 145 },
    { name: 'Thu', count: 160 },
    { name: 'Fri', count: 155 },
    { name: 'Sat', count: 80 },
    { name: 'Sun', count: 0 },
]

export default function AdminDashboardPage() {
    const [stats, setStats] = useState({
        students: 0,
        active: 0,
        complete: 0,
        dropout: 0,
    })
    const [loading, setLoading] = useState(true)
    const [date, setDate] = useState<Date | undefined>(new Date())

    useEffect(() => {
        async function loadStats() {
            setLoading(true)
            try {
                const res = await api.get('/students', { params: { status: 'all' } })
                if (res.data.success) {
                    const studentData: any[] = res.data.students || []
                    let students = studentData.length, active = 0, complete = 0, dropout = 0;
                    studentData.forEach((s: any) => {
                        const st = (s.status || 'active').toLowerCase()
                        if (st.includes('drop')) dropout++
                        else if (st.includes('complet')) complete++
                        else active++
                    })
                    setStats({ students, active, complete, dropout })
                }
            } catch (err) {
                console.error('Failed to load dashboard stats', err)
            }
            setLoading(false)
        }
        loadStats()
    }, [])

    return (
        <div className="space-y-6 text-slate-200">
            {/* Top Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#1a2234] rounded-2xl p-5 shadow border border-slate-800/50 flex flex-col justify-between">
                    <p className="text-slate-400 text-sm font-medium">Total Students</p>
                    <div className="flex items-center justify-between mt-2">
                        <h3 className="text-3xl font-bold text-white">{loading ? "..." : stats.students}</h3>
                        <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700">
                            <Users className="h-5 w-5 text-slate-300" />
                        </div>
                    </div>
                </div>

                <div className="bg-[#1a2234] rounded-2xl p-5 shadow border border-slate-800/50 flex flex-col justify-between">
                    <p className="text-slate-400 text-sm font-medium">Active</p>
                    <div className="flex items-center justify-between mt-2">
                        <h3 className="text-3xl font-bold text-emerald-400">{loading ? "..." : stats.active}</h3>
                        <div className="h-10 w-10 rounded-full bg-[#131b29] flex items-center justify-center border border-slate-700">
                            <GraduationCap className="h-5 w-5 text-emerald-400" />
                        </div>
                    </div>
                </div>

                <div className="bg-[#1a2234] rounded-2xl p-5 shadow border border-slate-800/50 flex flex-col justify-between">
                    <p className="text-slate-400 text-sm font-medium">Complete</p>
                    <div className="flex items-center justify-between mt-2">
                        <h3 className="text-3xl font-bold text-blue-400">{loading ? "..." : stats.complete}</h3>
                        <div className="h-10 w-10 rounded-full bg-[#131b29] flex items-center justify-center border border-slate-700">
                            <CheckCircle2 className="h-5 w-5 text-blue-400" />
                        </div>
                    </div>
                </div>

                <div className="bg-[#1a2234] rounded-2xl p-5 shadow border border-slate-800/50 flex flex-col justify-between">
                    <p className="text-slate-400 text-sm font-medium">Dropout</p>
                    <div className="flex items-center justify-between mt-2">
                        <h3 className="text-3xl font-bold text-red-400">{loading ? "..." : stats.dropout}</h3>
                        <div className="h-10 w-10 rounded-full bg-[#131b29] flex items-center justify-center border border-slate-700">
                            <XCircle className="h-5 w-5 text-red-400" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Middle Grid: Projects (Quick Actions) + Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Projects / Quick Actions (Colspan 2) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white">Quick Actions</h3>
                        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
                            <MoreHorizontal className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {/* Action Card 1 */}
                        <Link href="/admin/students/create" className="group">
                            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-5 h-40 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02]">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-full p-2">
                                    <ArrowUpRight className="h-4 w-4 text-white" />
                                </div>
                                <div className="absolute bottom-4 left-4">
                                    <div className="bg-blue-500/30 rounded-lg p-2 w-fit mb-2">
                                        <Plus className="h-5 w-5 text-white" />
                                    </div>
                                    <h4 className="text-lg font-bold text-white">Add Student</h4>
                                    <p className="text-blue-100/70 text-xs mt-1">New Admission</p>
                                </div>
                            </div>
                        </Link>

                        {/* Action Card 2 */}
                        <Link href="/admin/exams" className="group">
                            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-5 h-40 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02]">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-full p-2">
                                    <ArrowUpRight className="h-4 w-4 text-white" />
                                </div>
                                <div className="absolute bottom-4 left-4">
                                    <div className="bg-amber-400/30 rounded-lg p-2 w-fit mb-2">
                                        <Clock className="h-5 w-5 text-white" />
                                    </div>
                                    <h4 className="text-lg font-bold text-white">Exams</h4>
                                    <p className="text-amber-100/70 text-xs mt-1">Manage Exams</p>
                                </div>
                            </div>
                        </Link>

                        {/* Action Card 3 */}
                        <Link href="/admin/academics" className="group">
                            <div className="bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-5 h-40 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02]">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-full p-2">
                                    <ArrowUpRight className="h-4 w-4 text-white" />
                                </div>
                                <div className="absolute bottom-4 left-4">
                                    <div className="bg-purple-500/30 rounded-lg p-2 w-fit mb-2">
                                        <School className="h-5 w-5 text-white" />
                                    </div>
                                    <h4 className="text-lg font-bold text-white">Classes</h4>
                                    <p className="text-purple-100/70 text-xs mt-1">Manage Standards</p>
                                </div>
                            </div>
                        </Link>

                        {/* Action Card 4 (Wide) */}
                        <Link href="/admin/attendance" className="sm:col-span-2 group">
                            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-5 h-32 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.01] flex items-center justify-between">
                                <div className="z-10 pl-2">
                                    <h4 className="text-2xl font-bold text-white">Attendance</h4>
                                    <p className="text-emerald-100/70 text-sm mt-1">Mark today's presence</p>
                                    <div className="mt-3 inline-block bg-white/20 px-3 py-1 rounded-full text-xs font-medium text-white backdrop-blur-sm">
                                        Open Register
                                    </div>
                                </div>
                                <div className="bg-emerald-500/20 rounded-full p-6 mr-4">
                                    <CalendarCheck className="h-10 w-10 text-white" />
                                </div>
                            </div>
                        </Link>

                        {/* Small Card */}
                        <Link href="/admin/hifz" className="group">
                            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-3xl p-5 h-32 relative overflow-hidden shadow-lg transition-transform hover:scale-[1.02] flex flex-col justify-end">
                                <div className="absolute top-4 right-4 bg-white/10 rounded-full p-2">
                                    <BookOpen className="h-4 w-4 text-white" />
                                </div>
                                <h4 className="text-lg font-bold text-white">Hifz</h4>
                                <p className="text-red-100/70 text-xs">Tracking</p>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Calendar Side Panel */}
                <div className="bg-[#1a2234] rounded-3xl p-6 shadow-lg border border-slate-800/50 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white">Calendar</h3>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                            <TrendingUp className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="bg-[#131b29] rounded-2xl p-2 flex-1 flex items-center justify-center">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            className="text-white"
                        />
                    </div>
                    <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-3 bg-[#131b29] p-3 rounded-xl border border-slate-800">
                            <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                                {format(new Date(), "dd")}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Staff Meeting</p>
                                <p className="text-xs text-slate-500">10:00 AM • Conference Hall</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Row - Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[#1a2234] rounded-3xl p-6 shadow-lg border border-slate-800/50">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-bold text-white">Weekly Attendance</h3>
                            <p className="text-xs text-slate-400">Average student presence</p>
                        </div>
                        <div className="flex gap-2">
                            <span className="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">Week</span>
                            <span className="px-3 py-1 rounded-full bg-transparent text-xs text-slate-500 hover:text-slate-300 cursor-pointer">Month</span>
                        </div>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityData}>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#131b29', borderColor: '#334155', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    cursor={{ fill: '#334155', opacity: 0.2 }}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {activityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 4 ? '#10b981' : '#334155'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#1a2234] rounded-3xl p-6 shadow-lg border border-slate-800/50">
                    <h3 className="text-lg font-bold text-white mb-4">Recent Exams</h3>
                    <div className="space-y-4">
                        {[1, 2, 3].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className={`w-2 h-full rounded-full ${i === 0 ? "bg-emerald-500" : i === 1 ? "bg-amber-500" : "bg-purple-500"}`}></div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-medium text-white">Annual Assessment {2024 - i}</h4>
                                    <p className="text-xs text-slate-400">Completed on Dec {15 - i}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-slate-300">98%</p>
                                    <p className="text-[10px] text-slate-500">Pass</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button className="w-full mt-6 bg-[#131b29] hover:bg-slate-800 text-slate-300 border border-slate-700">
                        View All Reports
                    </Button>
                </div>
            </div>
        </div>
    )
}
