import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, LogOut, BookOpen, AlertCircle, Loader2, PlaneTakeoff, Home } from "lucide-react"
import { useEffect, useState } from "react"
import api from "@/lib/api"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { format, subDays } from "date-fns"

interface QuickViewDashboardProps {
    /** When true, fetches only the current mentor's assigned students */
    staffMode?: boolean
}

export function QuickViewDashboard({ staffMode = false }: QuickViewDashboardProps) {
    const [stats, setStats] = useState({
        totalStudents: 0,
        onLeave: 0,       // currently outside (out-campus)
        onCampusLeave: 0, // internal / on-campus
        institutional: 0  // institutional leave
    })

    const [lineData, setLineData] = useState<any[]>([])
    const [activeLeaveList, setActiveLeaveList] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchDashboardData = async () => {
            setLoading(true)
            try {
                if (staffMode) {
                    // ── Staff mode: fetch only assigned students + their leaves ──
                    const [studentsRes, leavesRes] = await Promise.all([
                        api.get('/staff/me/students'),
                        api.get('/staff/me/leaves')
                    ])

                    const myStudents: any[] = studentsRes.data?.students || []
                    const myStudentIds = new Set(myStudents.map((s: any) => s.adm_no))
                    const allLeaves: any[] = leavesRes.data?.leaves || []

                    // Only consider leaves belonging to THIS mentor's students
                    const myLeaves = allLeaves.filter((l: any) =>
                        myStudentIds.has(l.student_id)
                    )

                    // Use is_outside from student data (most reliable)
                    const outsideStudents = myStudents.filter((s: any) => s.is_outside)
                    const onLeaveCount = outsideStudents.length

                    const onCampus = myLeaves.filter((l: any) =>
                        l.status === 'outside' && (l.leave_type === 'on-campus' || l.leave_type === 'internal')
                    ).length

                    const instit = myLeaves.filter((l: any) =>
                        l.status === 'outside' && l.leave_type === 'institutional'
                    ).length

                    setStats({
                        totalStudents: myStudents.length,
                        onLeave: onLeaveCount,
                        onCampusLeave: onCampus,
                        institutional: instit,
                    })
                    setActiveLeaveList(myLeaves.filter((l: any) => l.status === 'outside'))

                    // Build 7-day history from actual leaves
                    buildChart(myLeaves)

                } else {
                    // ── Admin mode: fetch entire institution ──
                    const [studentsRes, leavesRes] = await Promise.all([
                        api.get('/students', { params: { status: 'active' } }),
                        api.get('/leaves')
                    ])
                    const totalStudents = studentsRes.data?.students?.length || 0
                    const allLeaves: any[] = leavesRes.data?.leaves || []

                    const outside = allLeaves.filter((l: any) => l.status === 'outside' && (l.leave_type === 'out-campus' || l.leave_type === 'personal')).length
                    const onCampus = allLeaves.filter((l: any) => l.status === 'outside' && (l.leave_type === 'on-campus' || l.leave_type === 'internal')).length
                    const institutional = allLeaves.filter((l: any) => l.status === 'outside' && l.leave_type === 'institutional').length

                    setStats({ totalStudents, onLeave: outside, onCampusLeave: onCampus, institutional })
                    setActiveLeaveList(allLeaves.filter((l: any) => l.status === 'outside'))

                    buildChart(allLeaves)
                }
            } catch (error) {
                console.error("Failed to load dashboard data", error)
            } finally {
                setLoading(false)
            }
        }

        const buildChart = (leaves: any[]) => {
            const history = []
            for (let i = 6; i >= 0; i--) {
                const d = subDays(new Date(), i)
                const dayStr = format(d, 'yyyy-MM-dd')
                const dayLeaves = leaves.filter((l: any) => {
                    const start = l.start_datetime?.slice(0, 10)
                    const end = l.end_datetime?.slice(0, 10) || l.actual_return_datetime?.slice(0, 10)
                    return start && start <= dayStr && (!end || end >= dayStr)
                })
                history.push({
                    name: format(d, 'dd MMM'),
                    'Out-Campus': dayLeaves.filter((l: any) => l.leave_type === 'out-campus' || l.leave_type === 'personal').length,
                    'Internal Leave': dayLeaves.filter((l: any) => l.leave_type === 'internal' || l.leave_type === 'on-campus').length,
                    'Institutional': dayLeaves.filter((l: any) => l.leave_type === 'institutional').length,
                })
            }
            setLineData(history)
        }

        fetchDashboardData()
    }, [staffMode])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        )
    }

    const leaveLabel = staffMode ? "My Students on Leave" : "Students Outside"

    return (
        <div className="space-y-6">
            {/* ── Stat Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-blue-600 border-none text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium opacity-80">
                            {staffMode ? "My Students" : "Total Students"}
                        </CardTitle>
                        <Users className="h-5 w-5 opacity-80" />
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="text-3xl font-bold">{stats.totalStudents}</div>
                        <p className="text-xs opacity-70 mt-1">{staffMode ? "Assigned to you" : "Active students"}</p>
                    </CardContent>
                </Card>

                <Card className="bg-orange-500 border-none text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium opacity-80">{leaveLabel}</CardTitle>
                        <PlaneTakeoff className="h-5 w-5 opacity-80" />
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="text-3xl font-bold">{stats.onLeave}</div>
                        <p className="text-xs opacity-70 mt-1">Currently outside campus</p>
                    </CardContent>
                </Card>

                <Card className="bg-emerald-600 border-none text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium opacity-80">On-Campus Leave</CardTitle>
                        <Home className="h-5 w-5 opacity-80" />
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="text-3xl font-bold">{stats.onCampusLeave}</div>
                        <p className="text-xs opacity-70 mt-1">Sick room / study leave</p>
                    </CardContent>
                </Card>

                <Card className="bg-purple-600 border-none text-white">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                        <CardTitle className="text-sm font-medium opacity-80">Institutional Leave</CardTitle>
                        <BookOpen className="h-5 w-5 opacity-80" />
                    </CardHeader>
                    <CardContent className="pb-4 px-4">
                        <div className="text-3xl font-bold">{stats.institutional}</div>
                        <p className="text-xs opacity-70 mt-1">Bulk / campus-wide</p>
                    </CardContent>
                </Card>
            </div>

            {/* ── Active Leave List (staff mode) ── */}
            {staffMode && activeLeaveList.length > 0 && (
                <Card className="border border-orange-100 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-900/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
                            <AlertCircle className="h-4 w-4" />
                            Students Currently Outside Campus
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {activeLeaveList.map((leave: any) => (
                                <div key={leave.id} className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-900 border border-orange-100 dark:border-orange-900/30 px-4 py-2.5">
                                    <div>
                                        <p className="font-medium text-sm text-slate-900 dark:text-white">{leave.student?.name || leave.student_id}</p>
                                        <p className="text-xs text-slate-500">{leave.student?.standard} · {leave.reason_category || leave.leave_type}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400">
                                            OUTSIDE
                                        </span>
                                        {leave.end_datetime && (
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                Until {new Date(leave.end_datetime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {staffMode && activeLeaveList.length === 0 && (
                <Card className="border border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/30 dark:bg-emerald-900/10">
                    <CardContent className="p-6 text-center">
                        <LogOut className="h-8 w-8 mx-auto mb-2 text-emerald-400 opacity-50" />
                        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">All your students are on campus!</p>
                    </CardContent>
                </Card>
            )}

            {/* ── 7-Day Chart ── */}
            <Card className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-base">
                        {staffMode ? "Your Students – Leave Activity (Last 7 Days)" : "Students Active Leave Summary (Last 7 Days)"}
                    </CardTitle>
                </CardHeader>
                <CardContent className="h-[250px]">
                    {lineData.every(d => d['Out-Campus'] === 0 && d['Internal Leave'] === 0 && d['Institutional'] === 0) ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
                            <p className="text-sm">No leave activity in the last 7 days</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="Out-Campus" stroke="#f97316" activeDot={{ r: 6 }} strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="Internal Leave" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                                <Line type="monotone" dataKey="Institutional" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
