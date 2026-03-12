"use client"

import { useState, useEffect, use } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Check, X, Users, CalendarCheck, Info } from "lucide-react"

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
import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

type ClassEvent = {
    id: string
    class_id: string
    class_name: string
    type: string
    start_time: string
    end_time: string
    status: string
}

type EnrolledStudent = {
    student_id: string
    student_name: string
    photo_url: string
}

export default function AttendancePage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params);
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1);

    const [date, setDate] = useState<Date>(new Date())
    const [events, setEvents] = useState<ClassEvent[]>([])
    const [selectedEventId, setSelectedEventId] = useState<string>("")
    const [selectedEventObj, setSelectedEventObj] = useState<ClassEvent | null>(null)

    const [students, setStudents] = useState<EnrolledStudent[]>([])
    const [attendance, setAttendance] = useState<Record<string, "Present" | "Absent" | "Leave">>({})

    const [loadingEvents, setLoadingEvents] = useState(false)
    const [loadingStudents, setLoadingStudents] = useState(false)
    const [saving, setSaving] = useState(false)

    // Load available events for the selected date and department
    useEffect(() => {
        async function loadEvents() {
            if (!date) return
            setLoadingEvents(true)
            const dateStr = format(date, "yyyy-MM-dd")
            try {
                const res = await api.get(`/classes/events?date=${dateStr}`)
                if (res.data.success) {
                    const deptEvents = res.data.data.filter((e: ClassEvent) => e.type === departmentName)
                    setEvents(deptEvents)
                    if (deptEvents.length > 0) {
                        setSelectedEventId(deptEvents[0].id)
                        setSelectedEventObj(deptEvents[0])
                    } else {
                        setSelectedEventId("")
                        setSelectedEventObj(null)
                    }
                }
            } catch (err) { console.error(err) }
            setLoadingEvents(false)
        }
        loadEvents()
    }, [date, departmentName])

    useEffect(() => {
        if (!selectedEventId) {
            setStudents([])
            setAttendance({})
            return
        }
        
        const ev = events.find(e => e.id === selectedEventId)
        setSelectedEventObj(ev || null)

        async function loadStudentsAndAttendance() {
            if (!ev) return
            setLoadingStudents(true)
            try {
                // 1. Fetch Students enrolled in this class
                const [enrollRes, attRes] = await Promise.all([
                    api.get(`/classes/enrollments?class_id=${ev.class_id}`),
                    api.get(`/academics/attendance`, { 
                        params: { class_event_id: ev.id, department: departmentName } 
                    })
                ])

                if (enrollRes.data.success) {
                    setStudents(enrollRes.data.data || [])
                }
                
                // 2. Map existing attendance
                const map: Record<string, any> = {}
                if (attRes.data.success && attRes.data.data) {
                    attRes.data.data.forEach((r: any) => {
                        map[r.student_id] = r.status
                    })
                }
                setAttendance(map)
                
            } catch (err) { console.error(err) }
            setLoadingStudents(false)
        }
        
        loadStudentsAndAttendance()
    }, [selectedEventId, events, departmentName])


    const toggleStatus = (studentId: string) => {
        if (selectedEventObj?.status === 'cancelled') return
        
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
        if (!selectedEventObj) return
        setSaving(true)
        const dateStr = format(date, "yyyy-MM-dd")

        const upsertData = students.map(s => ({
            student_id: s.student_id,
            date: dateStr,
            session_id: null,
            class_event_id: selectedEventObj.id,
            status: attendance[s.student_id] || "Present",
            department: departmentName 
        }))

        try {
            const res = await api.post("/academics/attendance", { attendanceData: upsertData })
            if (res.data.success) {
                alert("Attendance saved successfully!")
                // Optionally mark the event as completed if not already
                if (selectedEventObj.status === 'scheduled') {
                    await api.patch(`/classes/events/${selectedEventObj.id}/status`, { status: 'completed' })
                    setSelectedEventObj(prev => prev ? { ...prev, status: 'completed' } : null)
                }
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
        if (selectedEventObj?.status === 'cancelled') return
        const newMap = { ...attendance }
        students.forEach(s => newMap[s.student_id] = status)
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
                    <p className="text-slate-500 mt-1">Mark daily attendance for specific class events.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        onClick={() => markAll("Present")} 
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        disabled={!selectedEventId || selectedEventObj?.status === 'cancelled'}
                    >
                        <Check className="mr-2 h-4 w-4" /> Mark All Present
                    </Button>
                    <Button
                        className="bg-gradient-to-r from-[#4f46e5] to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-lg"
                        onClick={saveAttendance}
                        disabled={saving || !selectedEventId || selectedEventObj?.status === 'cancelled'}
                    >
                        {saving ? "Saving..." : "Save Attendance"}
                    </Button>
                </div>
            </div>

            {/* Filter Bar */}
            <Card className="border-none shadow-sm bg-white">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center">
                        <div className="flex flex-col space-y-1.5 w-full md:w-auto">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-[200px] justify-start text-left font-normal bg-slate-50",
                                            !date && "text-muted-foreground"
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
                        </div>

                        <div className="flex flex-col space-y-1.5 flex-1 min-w-[250px]">
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Scheduled Class Event</label>
                            <Select value={selectedEventId} onValueChange={setSelectedEventId} disabled={loadingEvents || events.length === 0}>
                                <SelectTrigger className="bg-slate-50 border-slate-200">
                                    <SelectValue placeholder={
                                        loadingEvents ? "Loading..." : 
                                        events.length === 0 ? "No classes scheduled for this date" : 
                                        "Select Class"
                                    } />
                                </SelectTrigger>
                                <SelectContent>
                                    {events.map(e => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.class_name} ({e.start_time.slice(0, 5)} - {e.end_time.slice(0, 5)})
                                            {e.status === 'completed' ? ' ✓' : ''}
                                            {e.status === 'cancelled' ? ' ✕' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        
                        {selectedEventObj && (
                            <div className="ml-auto flex gap-2 pt-4">
                                {selectedEventObj.status === 'scheduled' && <Badge variant="secondary" className="bg-slate-100">Scheduled</Badge>}
                                {selectedEventObj.status === 'completed' && <Badge className="bg-emerald-500">Completed</Badge>}
                                {selectedEventObj.status === 'cancelled' && <Badge variant="destructive">Cancelled</Badge>}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                <Users className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Enrolled Students</p>
                                <p className="text-2xl font-bold text-slate-900">{students.length}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <CalendarCheck className="h-6 w-6 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Present Today</p>
                                <p className="text-2xl font-bold text-emerald-600">{presentCount}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center">
                                <X className="h-6 w-6 text-rose-600" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500">Absent / Leave</p>
                                <p className="text-2xl font-bold text-rose-600">{students.length > 0 ? students.length - presentCount : 0}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Attendance Table */}
            <Card className="border-none shadow-sm overflow-hidden bg-white">
                <Table>
                    <TableHeader className="bg-slate-50">
                        <TableRow>
                            <TableHead className="pl-6 w-16">Profile</TableHead>
                            <TableHead>Student</TableHead>
                            <TableHead className="text-center w-[200px]">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loadingStudents && (
                            <TableRow><TableCell colSpan={3} className="text-center h-32"><div className="flex items-center justify-center gap-2"><div className="h-5 w-5 rounded-full border-2 border-[#4f46e5] border-t-transparent animate-spin"></div>Loading Students...</div></TableCell></TableRow>
                        )}
                        {!loadingStudents && events.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center h-48 text-slate-500">
                                    <Info className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                                    No classes scheduled for {format(date, "MMMM d, yyyy")}.<br/>
                                    <span className="text-sm text-slate-400">Head to the Academic Calendar to generate events for this day.</span>
                                </TableCell>
                            </TableRow>
                        )}
                        {!loadingStudents && events.length > 0 && !selectedEventId && (
                            <TableRow><TableCell colSpan={3} className="text-center h-32 text-slate-500">Select a class event to mark attendance.</TableCell></TableRow>
                        )}
                        {!loadingStudents && selectedEventId && students.length === 0 && (
                            <TableRow><TableCell colSpan={3} className="text-center h-32 text-slate-500">No students are enrolled in this class configuration.</TableCell></TableRow>
                        )}

                        {students.map((s) => {
                            const status = attendance[s.student_id] || "Present"
                            const isCancelled = selectedEventObj?.status === 'cancelled'
                            return (
                                <TableRow key={s.student_id} className={`hover:bg-slate-50 transition-colors ${!isCancelled ? 'cursor-pointer' : 'opacity-70'}`} onClick={() => toggleStatus(s.student_id)}>
                                    <TableCell className="pl-6">
                                        <Avatar className="h-10 w-10 border shadow-sm">
                                            <AvatarImage src={s.photo_url || ''} />
                                            <AvatarFallback className="bg-slate-100 font-semibold text-slate-500">
                                                {s.student_name.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                    </TableCell>
                                    <TableCell>
                                        <div className="font-semibold text-slate-800">{s.student_name}</div>
                                        <div className="font-mono text-xs text-slate-400">ADM: {s.student_id}</div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={isCancelled}
                                                className={cn(
                                                    "w-28 h-9 font-bold transition-all rounded-full border",
                                                    status === "Present" && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200",
                                                    status === "Absent" && "bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200",
                                                    status === "Leave" && "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200",
                                                )}
                                                onClick={(e) => { e.stopPropagation(); toggleStatus(s.student_id) }}
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
