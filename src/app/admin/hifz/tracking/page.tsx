"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Search, BookOpen, X } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
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
import { formatHifzLogLabel } from "@/lib/hifz-progress"

interface Student {
    adm_no: string
    name: string
    hifz_standard?: string
    current_surah?: string
    current_juz?: number
}

interface HifzLog {
    id: string
    student_id: string
    entry_date: string
    session_type: string
    mode: string
    surah_name?: string
    start_v?: number
    end_v?: number
    start_page?: number
    end_page?: number
    juz_number?: number
    juz_portion?: string
    rating?: number
}

export default function HifzTrackingPage() {
    const [date, setDate] = useState<Date>(new Date())
    const [selectedSession, setSelectedSession] = useState<string>("all")
    const [students, setStudents] = useState<Student[]>([])
    const [hifzLogs, setHifzLogs] = useState<Record<string, HifzLog[]>>({})
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [refreshKey, setRefreshKey] = useState(0)

    // Hifz sessions (hardcoded as per hifz_logs session_type constraint)
    const hifzSessionTypes = ["Subh", "Breakfast", "Lunch"]

    // Load students and hifz logs when date/session changes
    useEffect(() => {
        async function loadData() {
            setLoading(true)
            const dateStr = format(date, "yyyy-MM-dd")

            try {
                // Load all active students enrolled in Hifz
                const { data: { students: studentsData } } = await api.get('/hifz/students');

                if (studentsData) {
                    setStudents(studentsData)
                }

                // Load existing hifz logs for this date (filter by session if selected)
                const { data: { logs: logsData } } = await api.get('/hifz/logs', {
                    params: { date: dateStr, session_type: selectedSession }
                });

                if (logsData) {
                    // Group logs by student_id - each student can have multiple logs (one per mode)
                    const logsMap: Record<string, HifzLog[]> = {}
                    logsData.forEach((log: HifzLog) => {
                        if (!logsMap[log.student_id]) {
                            logsMap[log.student_id] = []
                        }
                        logsMap[log.student_id].push(log)
                    })
                    setHifzLogs(logsMap)
                } else {
                    setHifzLogs({})
                }
            } catch (err) {
                console.error("Failed to load hifz tracking data", err);
                setHifzLogs({})
            }

            setLoading(false)
        }
        loadData()
    }, [date, selectedSession, refreshKey])

    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.adm_no.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Format log display
    const formatLogDisplay = (log: HifzLog) => {
        return formatHifzLogLabel(log);
    }

    const handleDeleteLog = async (logId: string) => {
        if (!confirm("Are you sure you want to delete this specific entry?")) return

        try {
            const res = await api.delete(`/hifz/logs/${logId}`);
            if (res.data && res.data.success) {
                // Trigger refresh
                setRefreshKey(prev => prev + 1)
            } else {
                alert("Error deleting log");
            }
        } catch (error: any) {
            alert("Error deleting: " + error.message)
        }
    }

    const getModeColor = (mode: string) => {
        switch (mode) {
            case "New Verses": return "bg-emerald-100 text-emerald-800"
            case "Recent Revision": return "bg-blue-100 text-blue-800"
            case "Juz Revision": return "bg-purple-100 text-purple-800"
            default: return "bg-gray-100 text-gray-800"
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Hifz Tracking</h1>
                    <p className="text-muted-foreground">Record and view student Hifz progress</p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        Daily Hifz Records
                    </CardTitle>
                    <CardDescription>View and record Hifz progress for each student</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        {/* Date Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn(
                                        "w-full sm:w-[200px] justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setDate(d)}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Session Select */}
                        <Select value={selectedSession} onValueChange={setSelectedSession}>
                            <SelectTrigger className="w-full sm:w-[200px]">
                                <SelectValue placeholder="All Sessions" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sessions</SelectItem>
                                {hifzSessionTypes.map(session => (
                                    <SelectItem key={session} value={session}>
                                        {session}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search students..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-full"
                            />
                        </div>
                    </div>

                    {/* Students Table */}
                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">Loading...</div>
                    ) : (
                        <div className="border rounded-lg overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Adm No</TableHead>
                                        <TableHead>Student Name</TableHead>
                                        <TableHead>Current Position</TableHead>
                                        <TableHead>Today's Record</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredStudents.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                                No students found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredStudents.map((student) => {
                                            const logs = hifzLogs[student.adm_no] || []
                                            return (
                                                <TableRow key={student.adm_no}>
                                                    <TableCell className="font-mono">{student.adm_no}</TableCell>
                                                    <TableCell className="font-medium">{student.name}</TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {student.current_surah || student.current_juz ? (
                                                            <span>
                                                                {student.current_surah && `Surah: ${student.current_surah}`}
                                                                {student.current_juz && ` | Juz: ${student.current_juz}`}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">Not set</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {logs.length > 0 ? (() => {
                                                            const newVerses = logs.filter(l => l.mode === "New Verses");
                                                            const recentRevisions = logs.filter(l => l.mode === "Recent Revision");
                                                            const juzRevisions = logs.filter(l => l.mode === "Juz Revision");

                                                            const renderLogBadge = (log: HifzLog) => (
                                                                <div key={log.id} className="flex items-center gap-1 group bg-slate-50 dark:bg-slate-900 border rounded pr-1 shadow-sm w-fit">
                                                                    <Link href={`/staff/entry/${log.student_id}?log_id=${log.id}&returnTo=/admin/hifz/tracking`} className="flex items-center gap-1 pl-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-l transition-colors">
                                                                        <span className={cn("px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider", getModeColor(log.mode))}>
                                                                            {log.mode === "New Verses" ? "New" : log.mode === "Recent Revision" ? "Recent" : "Juz"}
                                                                        </span>
                                                                        <span className="text-xs text-muted-foreground font-medium pr-1 hover:text-foreground hover:underline decoration-dotted underline-offset-2">
                                                                            {formatLogDisplay(log)}
                                                                        </span>
                                                                    </Link>
                                                                    <button
                                                                        onClick={() => handleDeleteLog(log.id)}
                                                                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                                                                        title="Delete Entry"
                                                                    >
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            );

                                                            return (
                                                                <div className="flex gap-3 items-start">
                                                                    {newVerses.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {newVerses.map(renderLogBadge)}
                                                                        </div>
                                                                    )}
                                                                    {recentRevisions.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {recentRevisions.map(renderLogBadge)}
                                                                        </div>
                                                                    )}
                                                                    {juzRevisions.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {juzRevisions.map(renderLogBadge)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })() : (
                                                            <span className="text-gray-400">No entry</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/staff/entry/${student.adm_no}?date=${format(date, "yyyy-MM-dd")}&returnTo=/admin/hifz/tracking`}>
                                                            <Button variant="outline" size="sm" className={logs.length >= 3 ? "" : "bg-emerald-600 text-white hover:bg-emerald-700"}>
                                                                {logs.length >= 3 ? "Edit" : logs.length > 0 ? `Add (${3 - logs.length} left)` : "Record"}
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {/* Summary Stats */}
                    {!loading && (
                        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="bg-emerald-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-emerald-700">
                                        {Object.values(hifzLogs).flat().filter(l => l.mode === "New Verses").length}
                                    </div>
                                    <p className="text-sm text-emerald-600">New Verses</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-blue-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-blue-700">
                                        {Object.values(hifzLogs).flat().filter(l => l.mode === "Recent Revision").length}
                                    </div>
                                    <p className="text-sm text-blue-600">Recent Revision</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-purple-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-purple-700">
                                        {Object.values(hifzLogs).flat().filter(l => l.mode === "Juz Revision").length}
                                    </div>
                                    <p className="text-sm text-purple-600">Juz Revision</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-gray-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-gray-700">
                                        {filteredStudents.length - Object.keys(hifzLogs).length}
                                    </div>
                                    <p className="text-sm text-gray-600">Pending Entry</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
