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
    XCircle,
    FileText,
    UserCheck,
    Briefcase
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
        <div className="space-y-6 text-slate-800 pb-10">
            {/* Header Area */}
            <div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">Dashboard</h1>
                <p className="text-slate-500 font-medium">Good Morning!</p>
            </div>

            {/* Top Statistics Container (Entab Style) */}
            <div className="bg-white/80 rounded-[32px] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white">
                <h3 className="text-sm font-bold text-slate-500 mb-6 uppercase tracking-wider pl-2">Statistics</h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    {/* Stat Card 1 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                            <Users className="h-5 w-5 text-blue-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            {loading ? "..." : stats.students}
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Total Students</p>
                    </div>

                    {/* Stat Card 2 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                            <UserCheck className="h-5 w-5 text-emerald-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            {loading ? "..." : stats.active}
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Active Students</p>
                    </div>

                    {/* Stat Card 3 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                            <FileText className="h-5 w-5 text-indigo-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            124
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Total Enquiries</p>
                    </div>

                    {/* Stat Card 4 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center mb-3">
                            <GraduationCap className="h-5 w-5 text-purple-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            {loading ? "..." : stats.complete}
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Graduates</p>
                    </div>

                    {/* Stat Card 5 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
                            <XCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            {loading ? "..." : stats.dropout}
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Dropouts</p>
                    </div>

                    {/* Stat Card 6 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                            <Briefcase className="h-5 w-5 text-amber-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            45
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Active Staff</p>
                    </div>

                    {/* Stat Card 7 */}
                    <div className="bg-white rounded-[24px] p-5 shadow-[0_8px_20px_rgb(0,0,0,0.03)] border border-slate-100 flex flex-col items-center justify-center text-center transition-transform hover:-translate-y-1">
                        <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center mb-3">
                            <Clock className="h-5 w-5 text-teal-500" />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800">
                            12
                        </h4>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Pending Tasks</p>
                    </div>
                </div>
            </div>

            {/* Middle Grid: Projects (Quick Actions) + Calendar */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                {/* Left Side Navigation Columns (Colspan 1) */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-[#4f46e5] rounded-[32px] p-6 shadow-[0_10px_30px_rgb(79,70,229,0.3)] text-white flex flex-col gap-4 relative overflow-hidden">
                        <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
                        <Link href="/admin/students" className="flex items-center gap-3 hover:bg-white/10 p-2 -ml-2 rounded-xl transition-colors">
                            <div className="bg-white/20 p-2 rounded-xl"><Users className="h-5 w-5" /></div>
                            <span className="font-bold">Students</span>
                        </Link>
                        <Link href="/admin/staff" className="flex items-center gap-3 opacity-80 hover:opacity-100 hover:bg-white/10 p-2 -ml-2 rounded-xl transition-all">
                            <div className="bg-white/10 p-2 rounded-xl"><Briefcase className="h-5 w-5" /></div>
                            <span className="font-medium">Staff</span>
                        </Link>
                        <Link href="/admin/finance/dashboard" className="flex items-center gap-3 opacity-80 hover:opacity-100 hover:bg-white/10 p-2 -ml-2 rounded-xl transition-all">
                            <div className="bg-white/10 p-2 rounded-xl"><FileText className="h-5 w-5" /></div>
                            <span className="font-medium">Fee Status</span>
                        </Link>
                        
                        <Link href="/admin/school/exams" className="bg-white text-[#4f46e5] mt-4 p-4 rounded-2xl flex items-center justify-between shadow-lg cursor-pointer transition-transform hover:scale-105">
                            <span className="font-bold text-sm">Result Analysis</span>
                            <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                </div>

                {/* Main Graph Area (Colspan 3) */}
                <div className="lg:col-span-3 bg-white/80 rounded-[32px] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">Result Analysis</h3>
                            <p className="text-sm text-slate-500">Performance overview</p>
                        </div>
                        <div className="flex gap-2">
                            <span className="px-4 py-1.5 rounded-full bg-blue-50 text-xs font-semibold text-blue-600">All Class</span>
                            <span className="px-4 py-1.5 rounded-full bg-slate-100 text-xs font-semibold text-slate-500 hover:bg-slate-200 cursor-pointer">English</span>
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityData}>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '16px', color: '#1e293b', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                                    cursor={{ fill: '#f8fafc' }}
                                />
                                <Bar dataKey="count" radius={[8, 8, 8, 8]} barSize={16}>
                                    {activityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#4f46e5' : '#f59e0b'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="mt-6 flex items-center justify-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-[#f59e0b]"></span>
                            <span className="text-xs font-bold text-slate-500">Distinction</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-[#4f46e5]"></span>
                            <span className="text-xs font-bold text-slate-500">Pass</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-slate-200"></span>
                            <span className="text-xs font-bold text-slate-500">Fail</span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Quick Actions Base Base */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                 {/* Action Card 1 */}
                 <Link href="/admin/students/create" className="group">
                    <div className="bg-white rounded-3xl p-6 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white transition-transform hover:-translate-y-1 flex items-center gap-4">
                        <div className="bg-blue-50 rounded-2xl p-4">
                            <Plus className="h-6 w-6 text-blue-500" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-slate-800">Add Student</h4>
                            <p className="text-slate-500 text-sm mt-0.5">Start new admission</p>
                        </div>
                    </div>
                </Link>

                {/* Action Card 2 */}
                <Link href="/admin/staff" className="group">
                    <div className="bg-white rounded-3xl p-6 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white transition-transform hover:-translate-y-1 flex items-center gap-4">
                        <div className="bg-amber-50 rounded-2xl p-4">
                            <UserCheck className="h-6 w-6 text-amber-500" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-slate-800">Staff Management</h4>
                            <p className="text-slate-500 text-sm mt-0.5">Manage directory & roles</p>
                        </div>
                    </div>
                </Link>

                {/* Action Card 3 */}
                <Link href="/admin/finance/dashboard" className="group">
                    <div className="bg-white rounded-3xl p-6 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white transition-transform hover:-translate-y-1 flex items-center gap-4">
                        <div className="bg-purple-50 rounded-2xl p-4">
                            <Briefcase className="h-6 w-6 text-purple-500" />
                        </div>
                        <div>
                            <h4 className="text-lg font-bold text-slate-800">Finance</h4>
                            <p className="text-slate-500 text-sm mt-0.5">Manage fees & ledger</p>
                        </div>
                    </div>
                </Link>
            </div>
        </div>
    )
}
