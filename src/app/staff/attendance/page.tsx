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
    type: "Hifz" | "School" | "Madrassa"
    start_time: string | null
    end_time: string | null
    days_of_week: number[] | null
    standards: string[] | null
    is_active: boolean
}

type Student = {
    adm_no: string
    name: string
    photo_url: string | null
    standard: string
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

function getImplicitMode(dow: number) {
    return dow === 5 ? "Friday" : (dow === 0 || dow === 6) ? "Weekday" : "Normal"
}

function getAllowedTypes(mode: string): string[] {
    if (mode === "Friday") return ["School"]
    if (mode === "Weekday") return ["Hifz", "Madrassa"]
    return ["Hifz", "School"]
}

export default function StaffAttendancePage() {
    const [staffId, setStaffId] = useState<string | null>(null)
    const [userRole, setUserRole] = useState<string>("staff")
    const [selectedDate, setSelectedDate] = useState<Date>(new Date())
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [sessionRows, setSessionRows] = useState<SessionRow[]>([])
    const [students, setStudents] = useState<Student[]>([])
    const [policy, setPolicy] = useState<CalendarPolicy | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingSessions, setLoadingSessions] = useState(false)

    // Modal state
    const [modalOpen, setModalOpen] = useState(false)
    const [activeSession, setActiveSession] = useState<SessionInfo | null>(null)
    const [attendanceMap, setAttendanceMap] = useState<Record<string, "Present" | "Absent" | "Leave">>({})
    const [saving, setSaving] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [lockedLeaves, setLockedLeaves] = useState<Record<string, string>>({})

    const router = useRouter()
    const dateStr = format(selectedDate, "yyyy-MM-dd")

    // Calculate edit window
    const daysDiff = differenceInDays(new Date(), selectedDate)
    const maxEditDays = userRole === "staff" ? 7 : 30
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

                if (!staff) {
                    toast.error("Staff profile not found")
                    setLoading(false)
                    return
                }

                setStaffId(staff.id)

                // Load all active sessions
                const { data: { sessions: sessionsData } } = await api.get('/academics/sessions');

                if (sessionsData) setSessions(sessionsData as SessionInfo[])

                // Load assigned students
                const { data: { students: studentsData } } = await api.get('/staff/me/students');

                if (studentsData) setStudents(studentsData)

            } catch (error) {
                console.error("Auth init error:", error)
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [router])

    // Load sessions for the selected date
    const loadDateSessions = useCallback(async () => {
        if (!staffId || sessions.length === 0) return
        setLoadingSessions(true)

        // Load calendar policy for this date
        try {
            const { data: { calendar: policyData } } = await api.get(`/academics/calendar/${dateStr}`);

            const pol = policyData as CalendarPolicy | null
            setPolicy(pol)

            // Determine which sessions are active today
            const dayOfWeek = selectedDate.getDay()
            const mode = pol?.day_mode || getImplicitMode(dayOfWeek)
            const allowedTypes = pol?.allowed_session_types || getAllowedTypes(mode)
            const cancelledMap = pol?.cancelled_sessions || {}

            const activeSessions = sessions.filter(s => {
                // Day of week check
                if (s.days_of_week && s.days_of_week.length > 0 && !s.days_of_week.includes(dayOfWeek)) {
                    return false
                }
                // Type check
                if (!allowedTypes.includes(s.type)) return false
                return true
            })

            // Load attendance records for all students on this date
            const studentIds = students.map(s => s.adm_no)
            if (studentIds.length === 0) {
                setSessionRows(activeSessions.map(s => ({
                    session: s,
                    status: cancelledMap[s.id] ? "cancelled" as const : "pending" as const,
                    studentCount: 0,
                    markedCount: 0,
                })))
                setLoadingSessions(false)
                return
            }

            const { data: { data: attendanceData } } = await api.get(`/academics/attendance`, {
                params: { date: dateStr, student_ids: studentIds.join(',') }
            });

            // Build session rows
            const rows: SessionRow[] = activeSessions.map(session => {
                const isCancelled = !!cancelledMap[session.id]
                const sessionAttendance = (attendanceData || []).filter((a: any) => a.session_id === session.id)
                const markedCount = sessionAttendance.length

                return {
                    session,
                    status: isCancelled ? "cancelled" : markedCount > 0 ? "marked" : "pending",
                    studentCount: students.length,
                    markedCount,
                }
            })

            setSessionRows(rows)
        } catch (error) {
            console.error(error)
        } finally {
            setLoadingSessions(false)
        }
    }, [staffId, sessions, students, dateStr, selectedDate])

    useEffect(() => { loadDateSessions() }, [loadDateSessions])

    // Open attendance marking modal
    const openMarkingModal = async (session: SessionInfo) => {
        setActiveSession(session)

        // Load existing attendance for this session + date
        const studentIds = students.map(s => s.adm_no)
        
        try {
            const { data: { data: existingAtt } } = await api.get(`/academics/attendance`, {
                params: { date: dateStr, session_id: session.id, student_ids: studentIds.join(',') }
            });

            // Load active leaves for these students (currently "outside")
            const { data: { leaves: activeLeaves } } = await api.get(`/leaves`, {
                params: { status: 'outside', student_ids: studentIds.join(',') }
            });

            const locks: Record<string, string> = {}
            if (activeLeaves) {
                activeLeaves.forEach((l: any) => { locks[l.student_id] = l.leave_type })
            }
            setLockedLeaves(locks)

        // Build map: default to Present for unmarked
        const map: Record<string, "Present" | "Absent" | "Leave"> = {}
        students.forEach(s => { 
            if (locks[s.adm_no]) {
                map[s.adm_no] = "Leave"
            } else {
                map[s.adm_no] = "Present" 
            }
        })
            if (existingAtt) {
                existingAtt.forEach((a: any) => { 
                    if (!locks[a.student_id]) {
                        map[a.student_id] = a.status 
                    }
                })
            }

            setAttendanceMap(map)
            setModalOpen(true)
        } catch (error) {
            console.error(error)
            toast.error("Failed to load attendance")
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

    // Save attendance
    const saveAttendance = async () => {
        if (!activeSession || !staffId) return
        setSaving(true)

        const upsertData = students.map(s => ({
            student_id: s.adm_no,
            date: dateStr,
            session_id: activeSession.id,
            status: attendanceMap[s.adm_no] || "Present",
            department: activeSession.type // Fulfill schema requirements
        }))

        try {
            const { data } = await api.post("/academics/attendance", { attendanceData: upsertData });
            if (!data.success) throw new Error(data.error);
            
            toast.success(`Attendance saved for ${upsertData.length} students`)
            setModalOpen(false)
            loadDateSessions() // Refresh the table
        } catch (error: any) {
            toast.error(`Failed to save: ${error.message || 'Unknown error'}`)
            console.error(error)
        } finally {
            setSaving(false)
        }
    }

    // Cancel class for this date
    const cancelClass = async () => {
        if (!activeSession) return
        setCancelling(true)

        try {
            const res = await api.post("/staff/cancel-session", { date: dateStr, session_id: activeSession.id });
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
        students.forEach(s => { 
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
            case "Leave": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-700"
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
        <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
            {/* Header with Date Picker */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <CalendarIcon className="h-6 w-6 text-emerald-600" />
                        Attendance Marking
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {students.length} students assigned to you
                    </p>
                </div>

                {/* Date Navigator */}
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goDate(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className={cn(
                                "w-[200px] justify-start text-left font-normal",
                                isHoliday && "border-red-500 text-red-500"
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

                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => goDate(1)}>
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

            {/* Session Table */}
            {!isHoliday && (
                <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                    <Table>
                        <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                            <TableRow>
                                <TableHead className="w-[50px] pl-4">#</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Session</TableHead>
                                <TableHead className="text-center">Students</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right pr-4">Action</TableHead>
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
                                                row.session.type === "Hifz" && "border-emerald-600 text-emerald-400",
                                                row.session.type === "School" && "border-blue-600 text-blue-400",
                                                row.session.type === "Madrassa" && "border-purple-600 text-purple-400",
                                            )}>{row.session.type}</Badge>
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
                                        {row.status === "cancelled" ? (
                                            <span className="text-xs text-red-400 italic">Cancelled</span>
                                        ) : !isEditable || isFutureDate ? (
                                            <Button variant="outline" size="sm" disabled className="gap-1.5">
                                                <Lock className="h-3 w-3" />
                                                Locked
                                            </Button>
                                        ) : row.status === "marked" ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openMarkingModal(row.session)}
                                                className="gap-1.5 border-slate-600 hover:bg-slate-800"
                                            >
                                                Edit Attendance
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                onClick={() => openMarkingModal(row.session)}
                                                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                            >
                                                Mark Attendance
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}

            {/* Attendance Marking Modal */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            Mark Attendance — {activeSession?.name}
                        </DialogTitle>
                        <DialogDescription>
                            {format(selectedDate, "EEEE, MMMM d, yyyy")} • {activeSession?.start_time?.slice(0, 5)} - {activeSession?.end_time?.slice(0, 5)}
                        </DialogDescription>
                    </DialogHeader>

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
                                {students.map((student, idx) => {
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
                                                        <p className="font-medium text-sm">{student.name}</p>
                                                        <p className="text-xs text-muted-foreground">{student.adm_no} • {student.standard}</p>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {lockedLeaves[student.adm_no] ? (
                                                    <Badge variant="outline" className="w-24 h-8 justify-center border-orange-500/30 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 shadow-sm flex items-center gap-1.5 cursor-not-allowed">
                                                        <Lock className="h-3 w-3" />
                                                        Leave
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
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Save Attendance
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
