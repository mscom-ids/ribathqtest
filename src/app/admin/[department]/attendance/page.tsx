"use client"

import { useState, useEffect, use } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, X, Search, Users, CalendarCheck, Clock } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { cn } from "@/lib/utils"

type Student = {
    adm_no: string
    name: string
    standard: string
}

type Session = {
    id: string
    name: string
    start_time: string
    end_time: string
    type: "Hifz" | "School" | "Madrassa"
    days_of_week?: number[]
    standards?: string[]
}

export default function AttendancePage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params);
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1);

    const [date, setDate] = useState<Date>(new Date())
    const [selectedStandard, setSelectedStandard] = useState<string>("All")
    const [selectedSessionId, setSelectedSessionId] = useState<string>("")

    const [students, setStudents] = useState<Student[]>([])
    const [allSessions, setAllSessions] = useState<Session[]>([])
    const [filteredSessions, setFilteredSessions] = useState<Session[]>([])
    const [attendance, setAttendance] = useState<Record<string, "Present" | "Absent" | "Leave">>({})

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [policy, setPolicy] = useState<any>(null)

    useEffect(() => {
        async function loadSessions() {
            setLoading(true)
            try {
                const res = await api.get(`/academics/sessions?department=${departmentName}`)
                if (res.data.success) {
                    setAllSessions(res.data.sessions)
                }
            } catch (err) { console.error(err) }
            setLoading(false)
        }
        loadSessions()
    }, [departmentName])

    useEffect(() => {
        async function loadPolicy() {
            if (!date) return
            const dateStr = format(date, "yyyy-MM-dd")
            try {
                const res = await api.get(`/academics/calendar/${dateStr}`)
                setPolicy(res.data.calendar || null)
            } catch (err) { console.error(err) }
        }
        loadPolicy()
    }, [date])

    useEffect(() => {
        if (!date || allSessions.length === 0) {
            setFilteredSessions([])
            return
        }

        if (policy?.is_holiday) {
            setFilteredSessions([])
            setSelectedSessionId("")
            return
        }

        const dayIndex = policy?.effective_day_of_week ?? date.getDay()

        let relevant = allSessions.filter(s => {
            const dayMatch = !s.days_of_week || s.days_of_week.length === 0 || s.days_of_week.includes(dayIndex)

            let typeMatch = true
            let allowedTypes: string[] | null = null

            if (policy?.allowed_session_types && policy.allowed_session_types.length > 0) {
                allowedTypes = policy.allowed_session_types
            } else {
                // Infer allowed types based on implicit day mode
                const dayOfWeek = date.getDay()
                let mode = "Normal"
                if (dayOfWeek === 5) mode = "Friday"
                if (dayOfWeek === 0 || dayOfWeek === 6) mode = "Weekday"

                if (mode === "Friday") allowedTypes = ["School"]
                else if (mode === "Weekday") allowedTypes = ["Hifz", "Madrassa"]
                else if (mode === "Normal") allowedTypes = ["Hifz", "School"]
            }

            if (allowedTypes && allowedTypes.length > 0) {
                typeMatch = allowedTypes.includes(s.type)
            }

            let stdMatch = true
            if (policy?.allowed_standards && policy.allowed_standards.length > 0 && s.standards && s.standards.length > 0) {
                const hasOverlap = s.standards.some((st: string) => policy.allowed_standards.includes(st))
                if (!hasOverlap) stdMatch = false
            }

            let uiStdMatch = true
            if (selectedStandard !== "All") {
                if (s.standards && s.standards.length > 0) {
                    uiStdMatch = s.standards.includes(selectedStandard)
                } else {
                    // If session has no specific standards, it applies to all in that department
                    uiStdMatch = true
                }
            }

            // Filter out cancelled sessions
            const cancelledSessions = policy?.cancelled_sessions as Record<string, any> | undefined
            if (cancelledSessions && cancelledSessions[s.id]) {
                return false
            }

            return dayMatch && typeMatch && stdMatch && uiStdMatch
        })

        setFilteredSessions(relevant)

        if (relevant.length > 0) {
            if (!relevant.find(s => s.id === selectedSessionId)) {
                setSelectedSessionId(relevant[0].id)
            }
        } else {
            setSelectedSessionId("")
        }
    }, [date, allSessions, selectedStandard, policy, selectedSessionId])

    useEffect(() => {
        async function loadStudents() {
            if (policy?.is_holiday) {
                setStudents([])
                return
            }

            // Check if all relevant standards are on leave
            const leaveStds = (policy as any)?.leave_standards as string[] | undefined

            const currentSession = allSessions.find(s => s.id === selectedSessionId)

            let allowedStandardsToSend: string[] | undefined = undefined

            if (selectedStandard === "All") {
                if (selectedSessionId && policy?.session_overrides && policy.session_overrides[selectedSessionId] && policy.session_overrides[selectedSessionId].length > 0) {
                    allowedStandardsToSend = policy.session_overrides[selectedSessionId]
                }
                else if (currentSession && currentSession.standards && currentSession.standards.length > 0) {
                    allowedStandardsToSend = currentSession.standards
                }
                else if (policy?.allowed_standards && policy.allowed_standards.length > 0) {
                    allowedStandardsToSend = policy.allowed_standards
                }
            }

            try {
                const res = await api.post("/academics/attendance/students", {
                    department: departmentName,
                    standard: selectedStandard,
                    allowed_standards: allowedStandardsToSend
                })

                if (res.data.success) {
                    let filtered = res.data.students
                    if (leaveStds && leaveStds.length > 0) {
                        filtered = filtered.filter((s: any) => !leaveStds.includes(s.standard))
                    }
                    setStudents(filtered)
                }
            } catch (err) { console.error(err) }
        }

        if (selectedSessionId) {
            loadStudents()
        } else {
            setStudents([])
        }
    }, [selectedStandard, selectedSessionId, allSessions, policy, department])

    useEffect(() => {
        if (!selectedSessionId || !date) return

        async function loadAttendance() {
            const dateStr = format(date, "yyyy-MM-dd")
            try {
                const res = await api.get(`/academics/attendance`, {
                    params: { date: dateStr, session_id: selectedSessionId, department: departmentName }
                })
                const map: Record<string, any> = {}
                if (res.data.success && res.data.data) {
                    res.data.data.forEach((r: any) => {
                        map[r.student_id] = r.status
                    })
                }
                setAttendance(map)
            } catch (err) { console.error(err) }
        }
        loadAttendance()
    }, [selectedSessionId, date, departmentName])


    const toggleStatus = (studentId: string) => {
        setAttendance(prev => {
            const current = prev[studentId]
            let next: "Present" | "Absent" | "Leave" = "Present"

            if (current === "Present") next = "Absent"
            else if (current === "Absent") next = "Leave"
            else if (current === "Leave") next = "Present"
            else next = "Present"

            return { ...prev, [studentId]: next }
        })
    }

    async function saveAttendance() {
        setSaving(true)
        const dateStr = format(date, "yyyy-MM-dd")

        const upsertData = students.map(s => ({
            student_id: s.adm_no,
            date: dateStr,
            session_id: selectedSessionId,
            status: attendance[s.adm_no] || "Present",
            department: departmentName 
            // recorded_by is automatically added by the backend via JWT token
        }))

        try {
            const res = await api.post("/academics/attendance", { attendanceData: upsertData })
            if (res.data.success) {
                alert("Attendance saved successfully!")
            } else {
                alert(`Failed to save attendance: ${res.data.error}`)
            }
        } catch (err: any) {
            console.error("Save Error:", err)
            alert(`Failed to save attendance: ${err.message || 'Unknown error'}`)
        }
        setSaving(false)
    }

    const markAll = (status: "Present" | "Absent") => {
        const newMap = { ...attendance }
        students.forEach(s => newMap[s.adm_no] = status)
        setAttendance(newMap)
    }

    const presentCount = Object.values(attendance).filter(s => s === "Present").length
    const absentCount = Object.values(attendance).filter(s => s === "Absent").length

    return (
        <div className="space-y-6 flex-1 w-full mx-auto max-w-[1600px] px-2 sm:px-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">{departmentName} Attendance</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Mark daily attendance for {departmentName} students.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => markAll("Present")} className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                        <Check className="mr-2 h-4 w-4" /> Mark All Present
                    </Button>
                    <Button
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/30"
                        onClick={saveAttendance}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : "Save Attendance"}
                    </Button>
                </div>
            </div>


            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-none shadow-lg bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <Users className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Total Students</p>
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{students.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-lg bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <CalendarCheck className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Present</p>
                                <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-lg bg-white dark:bg-[#1a2234]">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                                <X className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Absent</p>
                                <p className="text-2xl font-bold text-red-600">{absentCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-lg bg-white dark:bg-[#1a2234]">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-[200px] justify-start text-left font-normal",
                                            !date && "text-muted-foreground",
                                            policy?.is_holiday && "border-red-500 text-red-600 bg-red-50"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={date}
                                        onSelect={(d: Date | undefined) => d && setDate(d)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            {policy?.is_holiday && <Badge variant="destructive" className="w-fit">{policy.description || "Holiday"}</Badge>}
                            {policy?.effective_day_of_week !== undefined && policy?.effective_day_of_week !== null && (
                                <Badge variant="outline" className="w-fit text-blue-600 border-blue-200">Following {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][policy.effective_day_of_week]} Schedule</Badge>
                            )}
                        </div>

                        <div className="flex flex-col space-y-1.5 min-w-[200px]">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Session</label>
                            <Select value={selectedSessionId} onValueChange={setSelectedSessionId} disabled={filteredSessions.length === 0}>
                                <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-none">
                                    <SelectValue placeholder={filteredSessions.length === 0 ? "No Sessions Today" : "Select Session"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredSessions.map(s => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name} ({s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col space-y-1.5 min-w-[200px]">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Class / Standard</label>
                            <Select value={selectedStandard} onValueChange={setSelectedStandard}>
                                <SelectTrigger className="bg-slate-50 dark:bg-slate-800 border-none">
                                    <SelectValue placeholder="Filter Class" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="All">All Classes</SelectItem>
                                    <SelectItem value="Hifz">Hifz</SelectItem>
                                    <SelectItem value="5th">5th</SelectItem>
                                    <SelectItem value="6th">6th</SelectItem>
                                    <SelectItem value="7th">7th</SelectItem>
                                    <SelectItem value="8th">8th</SelectItem>
                                    <SelectItem value="9th">9th</SelectItem>
                                    <SelectItem value="10th">10th</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Attendance Table */}
            <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                        <TableRow>
                            <TableHead className="pl-6">ADM NO</TableHead>
                            <TableHead>Student Name</TableHead>
                            <TableHead>Class</TableHead>
                            <TableHead className="text-center w-[200px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading && <TableRow><TableCell colSpan={4} className="text-center h-32"><div className="flex items-center justify-center gap-2"><div className="h-5 w-5 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin"></div>Loading...</div></TableCell></TableRow>}
                        {!loading && students.length === 0 && <TableRow><TableCell colSpan={4} className="text-center h-32 text-slate-500"><Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />{filteredSessions.length === 0 ? "No sessions scheduled for this date." : "No students found for this selection."}</TableCell></TableRow>}

                        {students.map((s, idx) => {
                            const status = attendance[s.adm_no] || "Present"
                            return (
                                <TableRow key={s.adm_no} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors" onClick={() => toggleStatus(s.adm_no)}>
                                    <TableCell className="font-mono text-xs text-slate-500 pl-6">{s.adm_no}</TableCell>
                                    <TableCell className="font-medium text-slate-900 dark:text-white">{s.name}</TableCell>
                                    <TableCell><Badge variant="outline" className="font-normal">{s.standard}</Badge></TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className={cn(
                                                    "w-28 h-9 font-bold transition-all rounded-full",
                                                    status === "Present" && "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400",
                                                    status === "Absent" && "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
                                                    status === "Leave" && "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
                                                )}
                                                onClick={(e) => { e.stopPropagation(); toggleStatus(s.adm_no) }}
                                            >
                                                {status.toUpperCase()}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Card>
        </div>
    )
}
