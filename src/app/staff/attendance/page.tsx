"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { format, differenceInDays, subDays } from "date-fns"
import {
    Calendar as CalendarIcon, Loader2, Clock, Users, CheckCircle2,
    XCircle, Ban, Lock, ChevronLeft, ChevronRight
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog"
import {
    Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

type SessionInfo = {
    id: string
    name: string
    class_type: string
    start_time: string | null
    end_time: string | null
    day_of_week: number
    standards: string[] | null
    student_count?: number
    effective_from: string
    effective_until: string | null
    is_deleted: boolean
}

type Student = {
    adm_no: string
    name: string
    photo_url: string | null
    standard: string
    is_temp?: boolean
    is_on_leave?: boolean
}

type CalendarPolicy = {
    date: string
    is_holiday: boolean
    description: string | null
    day_mode?: string
    allowed_session_types: string[] | null
    cancelled_sessions: Record<string, any> | null
    leave_standards: string[] | null
}

type SessionRow = {
    session: SessionInfo
    status: "pending" | "marked" | "cancelled"
    studentCount: number
    markedCount: number
}

export default function StaffAttendancePage() {
    const [staffId, setStaffId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string>("staff")
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [sessionRows, setSessionRows] = useState<SessionRow[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [sessionStudents, setSessionStudents] = useState<Student[]>([])
    const [policy, setPolicy] = useState<CalendarPolicy | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingSessions, setLoadingSessions] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 10000)
        return () => clearInterval(timer)
    }, [])

    // Modal state
    const [modalOpen, setModalOpen] = useState(false)
    const [activeSession, setActiveSession] = useState<SessionInfo | null>(null)
    const [attendanceMap, setAttendanceMap] = useState<Record<string, "Present" | "Absent" | "Leave">>({})
    const [saving, setSaving] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [lockedLeaves, setLockedLeaves] = useState<Record<string, string>>({})
    const [modalLoading, setModalLoading] = useState(false)

    const router = useRouter()
    const todayStr = format(currentTime, "yyyy-MM-dd")
    const dateStr = format(selectedDate, "yyyy-MM-dd")

    // Calculate edit window using date strings to avoid timezone drift
    const diffTime = new Date(todayStr).getTime() - new Date(dateStr).getTime();
    const daysDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const maxEditDays = userRole === "staff" ? 3 : 30
    const isEditable = daysDiff >= 0 && daysDiff <= maxEditDays
    const isFutureDate = daysDiff < 0

    // Initial auth + staff lookup
    useEffect(() => {
        async function init() {
            setLoading(true)
            try {
                const { data: { user } } = await api.get('/auth/me');
                if (!user) { router.push("/login"); return }

                setUserRole(user.role)

                // Get staff ID
                const { data: { staff } } = await api.get('/staff/me');

                // If staff profile misses or auth fails
                if (!staff) {
                    toast.error("Staff profile not found")
                    setLoading(false)
                    router.push("/login")
                    return
                }

                setStaffId(staff.id)

                // Load assigned students
                const { data: { students: studentsData } } = await api.get('/staff/me/students');

                if (studentsData) setStudents(studentsData)

            } catch (error) {
                console.warn("Auth init error:", error)
                router.push("/login")
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [router])

    // Load sessions for the selected date — now reads from attendance_schedules
    const loadDateSessions = useCallback(async () => {
        if (!staffId) return
        setLoadingSessions(true)

        try {
            // Load calendar policy for this date
            const { data: { calendar: policyData } } = await api.get(`/academics/calendar/${dateStr}`);
            const pol = policyData as CalendarPolicy | null
            setPolicy(pol)

            const cancelledMap = pol?.cancelled_sessions || {}

            // Load schedules active on this date (date-effective filtering done server-side)
            const { data: { data: schedulesData } } = await api.get('/attendance/schedules-for-date', {
                params: { date: dateStr }
            });

            const activeSessions: SessionInfo[] = (schedulesData || []).map((s: any) => ({
                ...s,
                name: s.name || `${s.class_type} Class`,
            }))

            // Load attendance records for all students on this date
            if (students.length === 0) {
                setSessionRows([])
                setLoadingSessions(false)
                return
            }

            // Check which schedules already have attendance marks
            const { data: dashData } = await api.get('/attendance/dashboard', {
                params: { start_date: dateStr, end_date: dateStr }
            });
            const marks = dashData?.marks || []
            const markedScheduleIds = new Set(marks.map((m: any) => m.schedule_id))

            // Build session rows
            const rows: SessionRow[] = activeSessions.map(session => {
                const isCancelled = !!cancelledMap[session.id]
                const isMarked = markedScheduleIds.has(session.id)

                return {
                    session,
                    status: isCancelled ? "cancelled" : isMarked ? "marked" : "pending",
                    studentCount: session.student_count || 0,
                    markedCount: isMarked ? (session.student_count || 0) : 0,
                }
            })

            setSessionRows(rows)
        } catch (error) {
            console.error(error)
        } finally {
            setLoadingSessions(false)
        }
    }, [staffId, students, dateStr])

    useEffect(() => { loadDateSessions() }, [loadDateSessions])

    // Auto-open marking modal if session param is in URL
    useEffect(() => {
        if (!loadingSessions && sessionRows.length > 0 && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const targetSessionId = params.get('session');
            if (targetSessionId) {
                const targetRow = sessionRows.find(r => r.session.id === targetSessionId);
                if (targetRow && !modalOpen) {
                    // Check if it's locked based on our new logic
                    const isFuture = daysDiff < 0;

                    if (!isEditable || isFuture || targetRow.status === "cancelled") {
                        toast.error("Attendance for this session is locked or unavailable.");
                    } else {
                        // Start opening the modal logic
                        openMarkingModal(targetRow.session);
                    }
                    // Clear the query string so we don't keep re-opening
                    const newUrl = window.location.pathname;
                    window.history.replaceState({}, '', newUrl);
                }
            }
        }
    }, [loadingSessions, sessionRows, daysDiff, isEditable])

    // Open attendance marking modal — opens immediately, loads data in background
    const openMarkingModal = async (session: SessionInfo) => {
        setActiveSession(session)
        setSessionStudents([])
        setAttendanceMap({})
        setLockedLeaves({})
        setModalLoading(true)
        setModalOpen(true)  // ← open instantly, show spinner inside

        try {
            // Step 1: fetch students first (needed for subsequent parallel calls)
            const { data: stuData } = await api.get('/attendance/students', {
                params: { schedule_id: session.id, date: dateStr }
            });
            const scheduleStudents: Student[] = stuData?.students || []
            const studentIds = scheduleStudents.map((s: Student) => s.adm_no)
            setSessionStudents(scheduleStudents)

            if (studentIds.length === 0) {
                setLockedLeaves({})
                setAttendanceMap({})
                setModalLoading(false)
                return
            }

            // Build locks from is_on_leave field returned by backend
            const locks: Record<string, string> = {}
            scheduleStudents.forEach((s: Student) => {
                if (s.is_on_leave) {
                    locks[s.adm_no] = 'approved'  // Mark as locked due to approved leave
                }
            })
            setLockedLeaves(locks)

            // Step 2: fetch existing attendance
            const idsParam = studentIds.join(',')
            const existingAttRes = await api.get('/academics/attendance', {
                params: { date: dateStr, session_id: session.id, student_ids: idsParam }
            }).catch(() => ({ data: { data: [] } }))

            // Build attendance map: default Present, Leave if on active leave
            const map: Record<string, "Present" | "Absent" | "Leave"> = {}
            scheduleStudents.forEach((s: Student) => {
                map[s.adm_no] = locks[s.adm_no] ? "Leave" : "Present"
            })

            // Override with any existing saved marks (but not for leave-locked students)
            const existingAtt = existingAttRes.data?.data || []
            existingAtt.forEach((a: any) => {
                if (!locks[a.student_id]) {
                    map[a.student_id] = a.status
                }
            })

            setAttendanceMap(map)
        } catch (error) {
            console.error(error)
            toast.error("Failed to load attendance data")
            setModalOpen(false)
        } finally {
            setModalLoading(false)
        }
    }

    // Toggle student status
    const toggleStatus = (admNo: string) => {
        if (lockedLeaves[admNo]) return // Prevent toggling if locked by active leave
        setAttendanceMap(prev => {
            const current = prev[admNo]
            let next: "Present" | "Absent" | "Leave" = "Present"
            if (current === "Present") next = "Absent"
            else if (current === "Absent") next = "Leave"
            else next = "Present"
            return { ...prev, [admNo]: next }
        })
    }

    // Save attendance — uses the new /attendance/mark endpoint
    const saveAttendance = async () => {
        if (!activeSession || !staffId) return
        setSaving(true)

        const student_marks = sessionStudents.map(s => ({
            student_id: s.adm_no,
            status: attendanceMap[s.adm_no] || "Present",
        }))

        try {
            const { data } = await api.post("/attendance/mark", {
                schedule_id: activeSession.id,
                date: dateStr,
                student_marks
            });
            if (!data.success) throw new Error(data.error);
            
            toast.success(`Attendance saved for ${student_marks.length} students`)
            setModalOpen(false)
            loadDateSessions() // Refresh the table
        } catch (error: any) {
            toast.error(`Failed to save: ${error.message || 'Unknown error'}`)
            console.error(error)
        } finally {
            setSaving(false)
        }
    }

    // Cancel class for this date — uses /attendance/cancel
    const cancelClass = async () => {
        if (!activeSession) return
        setCancelling(true)

        try {
            const res = await api.post("/attendance/cancel", {
                schedule_id: activeSession.id,
                date: dateStr,
                reason: 'Cancelled by mentor'
            });
            if (!res.data.success) throw new Error(res.data.error);

            toast.success(`${activeSession.name} cancelled for ${format(selectedDate, "MMM d")}`)
            setModalOpen(false)
            loadDateSessions()
        } catch (error: any) {
             toast.error(`Failed to cancel: ${error.message}`)
        } finally {
             setCancelling(false)
        }
    }

    // Mark all students with a status
    const markAll = (status: "Present" | "Absent" | "Leave") => {
        const map: Record<string, "Present" | "Absent" | "Leave"> = {}
        sessionStudents.forEach(s => { 
            if (lockedLeaves[s.adm_no]) {
                map[s.adm_no] = "Leave"
            } else {
                map[s.adm_no] = status 
            }
        })
        setAttendanceMap(map)
    }

    // Navigate date
    const goDate = (dir: number) => {
        const d = new Date(selectedDate)
        d.setDate(d.getDate() + dir)
        setSelectedDate(d)
    }

    // Status badge colors
    const getStatusBadge = (status: string) => {
        switch (status) {
            case "marked": return <Badge className="bg-emerald-900/30 text-emerald-400 border-emerald-700">Marked</Badge>
            case "pending": return <Badge className="bg-amber-900/30 text-amber-400 border-amber-700">Pending</Badge>
            case "cancelled": return <Badge className="bg-red-900/30 text-red-400 border-red-700">Cancelled</Badge>
            default: return null
        }
    }

    const getStudentStatusColor = (status: string) => {
        switch (status) {
            case "Present": return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-700"
            case "Absent": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-700"
            case "Leave": return "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/40 dark:text-slate-400 dark:border-slate-700"
            default: return "bg-slate-100 text-slate-700"
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        )
    }

    const isHoliday = policy?.is_holiday

    // Count stats
    const presentCount = Object.values(attendanceMap).filter(s => s === "Present").length
    const absentCount = Object.values(attendanceMap).filter(s => s === "Absent").length
    const leaveCount = Object.values(attendanceMap).filter(s => s === "Leave").length

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
            {/* Header with Date Picker */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-lg relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
                <div className="absolute -bottom-12 -left-6 w-32 h-32 rounded-full bg-white/5" />
                <div className="relative">
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2 text-white">
                        <CalendarIcon className="h-6 w-6 text-blue-200" />
                        Attendance Marking
                    </h1>
                    <p className="text-sm text-blue-100 mt-1">
                        {students.length} students assigned to you
                    </p>
                </div>

                {/* Date Navigator */}
                <div className="flex items-center gap-2 relative">
                    <Button variant="outline" size="icon" className="h-9 w-9 bg-white/10 hover:bg-white/20 border-white/20 text-white" onClick={() => goDate(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn(
                                "w-[200px] justify-start text-left font-semibold border-white/20 bg-white/10 hover:bg-white/20 text-white",
                                isHoliday && "border-red-400 text-red-200"
                            )}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {format(selectedDate, "EEE, MMM d, yyyy")}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={selectedDate}
                                onSelect={(d: Date | undefined) => d && setSelectedDate(d)}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>

                    <Button variant="outline" size="icon" className="h-9 w-9 bg-white/10 hover:bg-white/20 border-white/20 text-white" onClick={() => goDate(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Holiday Banner */}
            {isHoliday && (
                <Card className="border-red-800 bg-red-950/30">
                    <CardContent className="p-4 flex items-center gap-3">
                        <Ban className="h-5 w-5 text-red-400" />
                        <div>
                            <p className="font-semibold text-red-400">Holiday</p>
                            <p className="text-sm text-red-300/70">{policy?.description || "No sessions scheduled"}</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Edit Window Warning */}
            {!isEditable && !isFutureDate && (
                <Card className="border-amber-800 bg-amber-950/30">
                    <CardContent className="p-4 flex items-center gap-3">
                        <Lock className="h-5 w-5 text-amber-400" />
                        <p className="text-sm text-amber-300">
                            This date is older than {maxEditDays} days. Attendance is locked.
                        </p>
                    </CardContent>
                </Card>
            )}

            {isFutureDate && (
                <Card className="border-blue-800 bg-blue-950/30">
                    <CardContent className="p-4 flex items-center gap-3">
                        <CalendarIcon className="h-5 w-5 text-blue-400" />
                        <p className="text-sm text-blue-300">
                            Future date. Attendance can only be marked for today or past dates.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Session Table/Cards */}
            {!isHoliday && (
                <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden bg-white dark:bg-slate-900 rounded-2xl">
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                                    <TableHead className="w-[50px] pl-4 font-semibold">#</TableHead>
                                    <TableHead className="font-semibold">Time</TableHead>
                                    <TableHead className="font-semibold">Session</TableHead>
                                    <TableHead className="text-center font-semibold">Students</TableHead>
                                    <TableHead className="text-center font-semibold">Status</TableHead>
                                    <TableHead className="text-right pr-4 font-semibold">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingSessions && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center h-32">
                                            <div className="flex items-center justify-center gap-2">
                                                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                                                Loading sessions...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}

                                {!loadingSessions && sessionRows.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center h-32 text-slate-500">
                                            <Users className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                                            No sessions scheduled for this date.
                                        </TableCell>
                                    </TableRow>
                                )}

                                {!loadingSessions && sessionRows.map((row, idx) => (
                                    <TableRow key={row.session.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <TableCell className="pl-4 font-mono text-xs text-slate-500">{idx + 1}</TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1.5 text-sm">
                                                <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                <span className="font-mono">
                                                    {row.session.start_time?.slice(0, 5) || "—"}
                                                    {row.session.end_time ? ` - ${row.session.end_time.slice(0, 5)}` : ""}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{row.session.name}</span>
                                                <Badge variant="outline" className={cn("text-[10px]",
                                                    row.session.class_type === "Hifz" && "border-emerald-600 text-emerald-400",
                                                    row.session.class_type === "School" && "border-blue-600 text-blue-400",
                                                    row.session.class_type === "Madrassa" && "border-purple-600 text-purple-400",
                                                )}>{row.session.class_type}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className="text-sm font-medium">
                                                {row.status === "marked" ? `${row.markedCount}/${row.studentCount}` : row.studentCount}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {getStatusBadge(row.status)}
                                        </TableCell>
                                        <TableCell className="text-right pr-4">
                                            {(() => {
                                                if (row.status === "cancelled") {
                                                    return <span className="text-xs text-red-400 italic">Cancelled</span>
                                                }
                                                if (!isEditable) {
                                                    return (
                                                        <Button variant="outline" size="sm" disabled className="gap-1.5 border-slate-200 text-slate-400">
                                                            <Lock className="h-3 w-3" />
                                                            Locked
                                                        </Button>
                                                    )
                                                }
                                                if (isFutureDate) {
                                                    return (
                                                        <Button variant="outline" size="sm" disabled className="gap-1.5 border-slate-200 text-slate-400">
                                                            <Clock className="h-3 w-3" />
                                                            Not Started
                                                        </Button>
                                                    )
                                                }
                                                if (row.status === "marked") {
                                                    return (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => openMarkingModal(row.session)}
                                                            className="gap-1.5 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950"
                                                        >
                                                            Edit Attendance
                                                        </Button>
                                                    )
                                                }
                                                return (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => openMarkingModal(row.session)}
                                                        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                                    >
                                                        Mark Attendance
                                                    </Button>
                                                )
                                            })()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden flex flex-col p-4 space-y-4">
                        {loadingSessions && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
                            </div>
                        )}
                        {!loadingSessions && sessionRows.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-500 text-center">
                                <Users className="h-10 w-10 mb-3 text-slate-400" />
                                <p className="text-sm font-medium">No sessions scheduled for this date.</p>
                            </div>
                        )}
                        {!loadingSessions && sessionRows.map((row) => (
                            <div key={row.session.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col gap-3 shadow-sm">
                                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 w-fit px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 shadow-sm">
                                    <Clock className="h-4 w-4 text-blue-500" />
                                    <span>
                                        {row.session.start_time?.slice(0, 5) || "—"}
                                        {row.session.end_time ? ` - ${row.session.end_time.slice(0, 5)}` : ""}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{row.session.name}</h3>
                                    {getStatusBadge(row.status)}
                                </div>
                                <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                                    <Users className="h-4 w-4 mr-2" />
                                    Students: <span className="font-semibold ml-1">{row.status === "marked" ? `${row.markedCount}/${row.studentCount}` : row.studentCount}</span>
                                </div>
                                <div className="pt-2">
                                    {(() => {
                                        if (row.status === "cancelled") {
                                            return <div className="w-full py-2.5 text-center text-sm font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg">Cancelled</div>
                                        }
                                        if (!isEditable) {
                                            return <Button variant="outline" disabled className="w-full gap-2 border-slate-200 text-slate-400 h-11 rounded-xl"><Lock className="h-4 w-4" /> Locked</Button>
                                        }
                                        if (isFutureDate) {
                                            return <Button variant="outline" disabled className="w-full gap-2 border-slate-200 text-slate-400 h-11 rounded-xl"><Clock className="h-4 w-4" /> Not Started</Button>
                                        }
                                        if (row.status === "marked") {
                                            return <Button variant="outline" onClick={() => openMarkingModal(row.session)} className="w-full gap-2 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950 h-11 rounded-xl font-semibold">Edit Attendance</Button>
                                        }
                                        return <Button onClick={() => openMarkingModal(row.session)} className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white h-11 rounded-xl font-semibold">Mark Attendance</Button>
                                    })()}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Attendance Marking Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Mark Attendance — {activeSession?.name}
                            {modalLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-500 ml-1" />}
                        </DialogTitle>
                        <DialogDescription>
                            {format(selectedDate, "EEEE, MMMM d, yyyy")} • {activeSession?.start_time?.slice(0, 5)} - {activeSession?.end_time?.slice(0, 5)}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Loading skeleton shown while data is fetching */}
                    {modalLoading && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                            <p className="text-sm text-slate-500 dark:text-slate-400">Loading students...</p>
                        </div>
                    )}

                    {/* Main content — only shown after data loads */}
                    {!modalLoading && <>
                    {/* Quick Actions */}
                    <div className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3.5 w-3.5" /> {presentCount}</span>
                            <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /> {absentCount}</span>
                            <span className="flex items-center gap-1 text-blue-500"><Ban className="h-3.5 w-3.5" /> {leaveCount}</span>
                        </div>
                        <div className="flex gap-1.5">
                            <Button variant="outline" size="sm" className="text-xs h-7 border-emerald-700 text-emerald-400 hover:bg-emerald-950"
                                onClick={() => markAll("Present")}>All Present</Button>
                            <Button variant="outline" size="sm" className="text-xs h-7 border-red-700 text-red-400 hover:bg-red-950"
                                onClick={() => markAll("Absent")}>All Absent</Button>
                        </div>
                    </div>

                    {/* Student List */}
                    <div className="border rounded-lg overflow-hidden dark:border-slate-700">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                                    <TableHead className="w-[40px] pl-3">#</TableHead>
                                    <TableHead>Student</TableHead>
                                    <TableHead className="text-center w-[120px]">Attendance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sessionStudents.map((student, idx) => {
                                    const status = attendanceMap[student.adm_no] || "Present"
                                    return (
                                        <TableRow
                                            key={student.adm_no}
                                            className={cn(
                                                "transition-colors",
                                                lockedLeaves[student.adm_no] ? "bg-orange-50/50 dark:bg-orange-900/10 cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            )}
                                            onClick={() => {
                                                if (!lockedLeaves[student.adm_no]) toggleStatus(student.adm_no)
                                            }}
                                        >
                                            <TableCell className="pl-3 text-xs text-slate-500">{idx + 1}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-8 w-8 border">
                                                        <AvatarImage src={student.photo_url || ""} />
                                                        <AvatarFallback className="text-xs">{student.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="font-medium text-sm">{student.name}</p>
                                                            {student.is_temp && (
                                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700 leading-none">
                                                                    TEMP
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">{student.adm_no} • {student.standard}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {lockedLeaves[student.adm_no] ? (
                                                    <Badge variant="outline" className="w-24 h-8 justify-center border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 shadow-sm flex items-center gap-1.5 cursor-not-allowed">
                                                        <Lock className="h-3 w-3" />
                                                        OUTSIDE
                                                    </Badge>
                                                ) : (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className={cn(
                                                            "w-24 h-8 font-semibold text-xs transition-all rounded-full border shadow-sm",
                                                            getStudentStatusColor(status)
                                                        )}
                                                        onClick={(e) => { e.stopPropagation(); toggleStatus(student.adm_no) }}
                                                    >
                                                        {status}
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Footer */}
                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
                        {["admin", "principal", "vice_principal"].includes(userRole) && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={cancelClass}
                                disabled={cancelling}
                                className="gap-1.5"
                            >
                                {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                                Cancel Class
                            </Button>
                        )}
                        <div className="flex-1" />
                        <Button variant="outline" onClick={() => setModalOpen(false)}>Close</Button>
                        <Button
                            onClick={saveAttendance}
                            disabled={saving}
                            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Save Attendance
                        </Button>
                    </DialogFooter>
                    </>}
                </DialogContent>
            </Dialog>
        </div>
    )
}
