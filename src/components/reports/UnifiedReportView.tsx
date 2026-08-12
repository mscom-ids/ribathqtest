// src/components/reports/UnifiedReportView.tsx
"use client"

import React, { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns"
import { FileText, Calendar as CalendarIcon, Download, Loader2, AlertCircle, MessageCircle, User, CalendarCheck2, LineChart, GraduationCap, Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Calendar } from "@/components/ui/calendar"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { getUserRole } from "@/lib/auth"
import { cn } from "@/lib/utils"

export default function UnifiedReportView() {
    const [students, setStudents] = useState<any[]>([])
    const [selectedStudent, setSelectedStudent] = useState<string>("")
    const [reportType, setReportType] = useState<"Weekly" | "Monthly" | "Yearly" | "Custom">("Monthly")
    const [dateRanges, setDateRanges] = useState({
        start: startOfMonth(subDays(new Date(), 2)),
        end: endOfMonth(subDays(new Date(), 2))
    })
    
    // UI state
    const [loading, setLoading] = useState(false)
    const [reportData, setReportData] = useState<any | null>(null)
    const [errorMsg, setErrorMsg] = useState("")
    const [studentPickerOpen, setStudentPickerOpen] = useState(false)

    useEffect(() => {
        let mounted = true
        async function loadStudents() {
            // A supervisor (Principal / VP) not focused on a mentor picks from
            // EVERY student; a mentor (or a focused supervisor) picks from their
            // own roster. Same {adm_no, name} shape either way.
            const focused = typeof window !== "undefined" && sessionStorage.getItem("mentorFocus") === "1"
            let role = ""
            try { role = await getUserRole() } catch { /* fall back to mentor roster */ }
            const isSupervisor = ["admin", "principal", "vice_principal", "controller"].includes(role)

            try {
                const res = isSupervisor && !focused
                    ? await cachedGet("/students", { scope: "all", light: "true", status: "active", limit: 1000, count: "false", sort: "name" }, 60_000)
                    : await cachedGet("/staff/me/students")
                if (!mounted || !res.data?.students) return
                const list = res.data.students
                setStudents(list)
                // Mentors get a smart default (small roster); supervisors search
                // instead of defaulting into an arbitrary first-of-hundreds.
                if (!(isSupervisor && !focused) && list.length > 0) {
                    setSelectedStudent(String(list[0].adm_no))
                }
            } catch { /* leave empty */ }
        }
        loadStudents()
        return () => { mounted = false }
    }, [])

    const selectedStudentName = students.find(s => String(s.adm_no) === selectedStudent)?.name || ""

    const handleTypeChange = (val: string) => {
        const type = val as any
        setReportType(type)
        const now = new Date()
        
        // When switching types, auto-select the current/most recent valid block
        if (type === "Weekly") {
            setPeriodOffset("0")
            setDateRanges({ start: startOfWeek(now), end: endOfWeek(now) })
        } else if (type === "Monthly") {
            setPeriodOffset("0")
            const safeMonth = subDays(now, 5) 
            setDateRanges({ start: startOfMonth(safeMonth), end: endOfMonth(safeMonth) })
        } else if (type === "Yearly") {
            setPeriodOffset("0")
            setDateRanges({ start: startOfYear(now), end: endOfYear(now) })
        } else if (type === "Custom") {
            setDateRanges({ start: startOfMonth(now), end: endOfMonth(now) })
        }
    }

    // State for the semantic select (0 = current, 1 = 1 period ago, etc.)
    const [periodOffset, setPeriodOffset] = useState<string>("0")

    const handlePeriodChange = (val: string) => {
        setPeriodOffset(val)
        const offset = parseInt(val)
        const now = new Date()
        
        if (reportType === "Weekly") {
            const target = subDays(now, offset * 7)
            setDateRanges({ start: startOfWeek(target), end: endOfWeek(target) })
        } else if (reportType === "Monthly") {
            const target = new Date(now.getFullYear(), now.getMonth() - offset, 1)
            setDateRanges({ start: startOfMonth(target), end: endOfMonth(target) })
        } else if (reportType === "Yearly") {
            const target = new Date(now.getFullYear() - offset, 0, 1)
            setDateRanges({ start: startOfYear(target), end: endOfYear(target) })
        }
    }

    const handleGenerate = async () => {
        if (!selectedStudent) return setErrorMsg("Select a student first")
        
        setLoading(true)
        setErrorMsg("")
        setReportData(null)

        try {
            const res = await api.get('/reports/student-progress', {
                params: {
                    student_id: selectedStudent,
                    type: reportType,
                    start_date: format(dateRanges.start, 'yyyy-MM-dd'),
                    end_date: format(dateRanges.end, 'yyyy-MM-dd')
                }
            })

            if (res.data?.success) {
                setReportData(res.data.data)
            } else {
                setErrorMsg("Failed to generate report")
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.error || "Error generating report")
        }
        setLoading(false)
    }

    const printPdf = () => {
        window.print();
    }

    const openWhatsApp = () => {
        const student = reportData?.student
        const phone = String(student?.parent_phone || "").replace(/\D/g, "")
        if (!phone) {
            setErrorMsg("No parent phone number is saved for this student.")
            return
        }

        const countryPhone = phone.length === 10 ? `91${phone}` : phone
        const performance = reportData?.performance
        const isHafiz = reportData?.hifz_stage === 'HAFIZ_REVISION'
        const juzMax = Number(performance?.juzMax ?? (isHafiz ? 50 : 15))
        const firstJuzDate = performance?.firstJuzCompletionDate ?? null
        const juzZeroReason = firstJuzDate
            ? 'no class days recorded'
            : 'first Juz not yet completed'

        // Human-readable activity numbers (what the student actually did),
        // not the internal points scale. Parents care about pages / days / Juz.
        const newPages = Number(reportData?.hifz_activity?.new_pages_recited ?? 0)
        const revisionDays = Number(reportData?.revision_days ?? 0)
        const juzRevised = Number(reportData?.hifz_activity?.juz_recited ?? 0)
        const newJuzRev = Number(reportData?.hifz_activity?.new_juz_revision ?? 0)
        const oldJuzRev = Number(reportData?.hifz_activity?.old_juz_revision ?? 0)
        const attendedSessions = Number(reportData?.attendance_totals?.attendedClasses ?? 0)
        const effectiveSessions = Number(reportData?.attendance_totals?.effectiveClasses ?? 0)
        const attendancePct = Number(performance?.attendancePercentage ?? 0)

        const perfLines = isHafiz
            ? [
                `New Revision: ${newJuzRev} Juz`,
                `Old Revision: ${oldJuzRev} Juz`,
              ]
            : [
                `New Hifz: ${newPages} pages recited`,
                `Recent Revision: ${revisionDays} ${revisionDays === 1 ? 'day' : 'days'}`,
                juzMax > 0
                    ? `Juz Revision: ${juzRevised} Juz`
                    : `Juz Revision: N/A (${juzZeroReason})`,
              ]
        const message = [
            "Assalamu Alaikum,",
            `${student.name}'s ${reportType.toLowerCase()} Hifz report (${format(dateRanges.start, 'MMMM yyyy')}):`,
            ...perfLines,
            `Attendance: ${attendedSessions}/${effectiveSessions} sessions (${attendancePct}%)`,
            `Grade: ${performance?.grade || 'NO GRADE'}`,
        ].join("\n")
        window.open(`https://wa.me/${countryPhone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")
    }

    // Generator helpers for dropdowns
    const generateMonths = () => {
        const opts = []
        const now = new Date()
        for (let i = 0; i < 6; i++) {
            const temp = new Date(now.getFullYear(), now.getMonth() - i, 1)
            opts.push({ label: format(temp, 'MMMM yyyy'), value: String(i) })
        }
        return opts
    }

    const generateWeeks = () => {
        const opts = []
        const now = new Date()
        for (let i = 0; i < 4; i++) {
            const temp = subDays(now, i * 7)
            opts.push({ 
                label: i === 0 ? "Current Week" : i === 1 ? "Last Week" : `${i} Weeks Ago`, 
                value: String(i) 
            })
        }
        return opts
    }

    const generateYears = () => {
        const opts = []
        const now = new Date()
        for (let i = 0; i < 3; i++) {
            opts.push({ label: String(now.getFullYear() - i), value: String(i) })
        }
        return opts
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            <Card className="print:hidden border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl">Generate Report</CardTitle>
                    <CardDescription>Select parameters to view progress reports</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="space-y-2">
                            <Label>Student</Label>
                            <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={studentPickerOpen}
                                        className="bg-white w-full justify-between font-normal"
                                    >
                                        <span className={cn("truncate", !selectedStudentName && "text-muted-foreground")}>
                                            {selectedStudentName || "Select Student"}
                                        </span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                    <Command
                                        filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
                                    >
                                        <CommandInput placeholder="Search name or ID…" />
                                        <CommandList>
                                            <CommandEmpty>No student found.</CommandEmpty>
                                            <CommandGroup>
                                                {students.map(s => (
                                                    <CommandItem
                                                        key={s.adm_no}
                                                        value={`${s.name} ${s.adm_no}`}
                                                        onSelect={() => {
                                                            setSelectedStudent(String(s.adm_no))
                                                            setStudentPickerOpen(false)
                                                        }}
                                                    >
                                                        <Check className={cn("mr-2 h-4 w-4", String(s.adm_no) === selectedStudent ? "opacity-100" : "opacity-0")} />
                                                        <span className="flex-1 truncate">{s.name}</span>
                                                        <span className="ml-2 text-xs text-muted-foreground">{s.adm_no}{s.standard ? ` · ${s.standard}` : ""}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            {errorMsg && !selectedStudent && (
                                <p className="text-xs text-red-500 mt-1 flex items-center">
                                    <AlertCircle className="h-3 w-3 mr-1" /> {errorMsg}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Report Type</Label>
                            <Select value={reportType} onValueChange={handleTypeChange}>
                                <SelectTrigger className="bg-white w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                    <SelectItem value="Monthly">Monthly</SelectItem>
                                    <SelectItem value="Yearly">Yearly</SelectItem>
                                    <SelectItem value="Custom">Custom Range</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label>Date Range</Label>
                            {reportType === "Custom" ? (
                                <div className="flex flex-col sm:flex-row gap-2 w-full">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("flex-1 min-w-0 bg-white justify-start text-left font-normal", !dateRanges.start && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="truncate">{dateRanges.start ? format(dateRanges.start, "PPP") : "Start Date"}</span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="w-auto max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
                                            align="start"
                                            collisionPadding={12}
                                        >
                                            <Calendar mode="single" selected={dateRanges.start} onSelect={(d) => d && setDateRanges(p => ({ ...p, start: d }))} />
                                        </PopoverContent>
                                    </Popover>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("flex-1 min-w-0 bg-white justify-start text-left font-normal", !dateRanges.end && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                                                <span className="truncate">{dateRanges.end ? format(dateRanges.end, "PPP") : "End Date"}</span>
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                            className="w-auto max-w-[calc(100vw-1.5rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto p-0"
                                            align="start"
                                            collisionPadding={12}
                                        >
                                            <Calendar mode="single" selected={dateRanges.end} onSelect={(d) => d && setDateRanges(p => ({ ...p, end: d }))} />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            ) : (
                                <Select value={periodOffset} onValueChange={handlePeriodChange}>
                                    <SelectTrigger className="bg-white w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {reportType === "Monthly" && generateMonths().map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                        {reportType === "Weekly" && generateWeeks().map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                        {reportType === "Yearly" && generateYears().map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </div>
                    {errorMsg && selectedStudent && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg flex items-center gap-2 text-sm mt-4">
                            <AlertCircle className="h-4 w-4" /> {errorMsg}
                        </div>
                    )}
                    <div className="mt-4 flex justify-end">
                      <Button onClick={handleGenerate} className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white" disabled={!selectedStudent || loading}>
                          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                          Generate Report
                      </Button>
                    </div>
                </CardContent>
            </Card>

            {/* PRINTABLE REGION */}
            {reportData && (
                <div className="report-print-area bg-white text-slate-900 border rounded-xl overflow-hidden print:border-none print:shadow-none shadow-sm print:p-0 p-6 print:m-0 print:w-full print:block">
                    {/* Header — screen only */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6 print:hidden">
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-wider text-slate-800">Student Progress Report</h2>
                            <p className="text-sm text-slate-500 mt-1 font-medium">{format(dateRanges.start, 'MMM d, yyyy')} — {format(dateRanges.end, 'MMM d, yyyy')} ({reportType})</p>
                        </div>
                        <div className="flex items-center gap-2 print:hidden shrink-0">
                            <Button variant="outline" onClick={openWhatsApp}>
                                <MessageCircle className="mr-2 h-4 w-4" /> Send to Parent
                            </Button>
                            <Button variant="outline" onClick={printPdf}>
                                <Download className="mr-2 h-4 w-4" /> Download PDF
                            </Button>
                        </div>
                    </div>

                    <div className="mt-8 space-y-8 print:hidden">
                        {/* Student Meta */}
                        <div className="bg-slate-50 print:bg-transparent border print:border-slate-300 rounded-xl p-5 print:p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                <div>
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Student Name</p>
                                    <p className="font-bold text-slate-900 mt-1">{reportData.student.name || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 uppercase font-semibold">ID / Batch</p>
                                    <p className="font-bold text-slate-900 mt-1">{reportData.student.adm_no} • {reportData.student.batch_year}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Class</p>
                                    <p className="font-bold text-slate-900 mt-1">{reportData.student.standard || "N/A"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 uppercase font-semibold">Mentor</p>
                                    <p className="font-bold text-slate-900 mt-1">{reportData.student.hifz_mentor || "N/A"}</p>
                                </div>
                            </div>
                        </div>

                        {/* Attendance Summary */}
                        <div>
                            <h3 className="text-lg font-bold border-b print:border-slate-300 pb-2 mb-4 text-slate-800">Session Attendance</h3>
                            {reportData.attendance_totals && (
                                <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="rounded-lg border border-slate-200 p-3 print:border-slate-300">
                                        <p className="text-[10px] uppercase font-bold text-slate-500">Cancelled</p>
                                        <p className="text-xl font-black text-slate-800">{reportData.attendance_totals.cancelledClasses}</p>
                                    </div>
                                    <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 print:border-slate-300 print:bg-transparent">
                                        <p className="text-[10px] uppercase font-bold text-emerald-700">Attended</p>
                                        <p className="text-xl font-black text-emerald-700">{reportData.attendance_totals.attendedClasses}</p>
                                    </div>
                                    <div className="rounded-lg border border-red-100 bg-red-50 p-3 print:border-slate-300 print:bg-transparent">
                                        <p className="text-[10px] uppercase font-bold text-red-700">Not attended</p>
                                        <p className="text-xl font-black text-red-700">{reportData.attendance_totals.notAttendedClasses}</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 p-3 print:border-slate-300">
                                        <p className="text-[10px] uppercase font-bold text-slate-500">Counted</p>
                                        <p className="text-xl font-black text-slate-800">{reportData.attendance_totals.effectiveClasses}</p>
                                    </div>
                                </div>
                            )}
                            {reportData.attendance.length > 0 ? (() => {
                                // Deduplicate by session name — merge present/absent/total for same-named sessions
                                const merged = new Map<string, any>()
                                reportData.attendance.forEach((att: any) => {
                                    const rawSession = (att.session || 'Session').trim()
                                    const key = rawSession.toLowerCase()
                                    if (merged.has(key)) {
                                        const ex = merged.get(key)
                                        ex.present += Number(att.present || 0)
                                        ex.late += Number(att.late || 0)
                                        ex.absent += Number(att.absent || 0)
                                        ex.leave += Number(att.leave || 0)
                                        ex.attended += Number(att.attended ?? att.present ?? 0)
                                        ex.not_attended += Number(att.not_attended ?? att.absent ?? 0)
                                        ex.cancelled += Number(att.cancelled || 0)
                                        ex.total += Number(att.total || att.effective_total || 0)
                                        ex.planned += Number(att.planned || att.total || 0)
                                        ex.effective_total += Number(att.effective_total || att.total || 0)
                                    } else {
                                        // Normalize "HIfz" typo to "Hifz" for display
                                        const cleanSession = rawSession.replace(/^hifz/i, 'Hifz')
                                        merged.set(key, {
                                            ...att,
                                            session: cleanSession,
                                            present: Number(att.present || 0),
                                            late: Number(att.late || 0),
                                            absent: Number(att.absent || 0),
                                            leave: Number(att.leave || 0),
                                            attended: Number(att.attended ?? att.present ?? 0),
                                            not_attended: Number(att.not_attended ?? att.absent ?? 0),
                                            cancelled: Number(att.cancelled || 0),
                                            total: Number(att.total || att.effective_total || 0),
                                            planned: Number(att.planned || att.total || 0),
                                            effective_total: Number(att.effective_total || att.total || 0),
                                        })
                                    }
                                })
                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-3 gap-4">
                                        {Array.from(merged.values()).map((att: any, i: number) => {
                                            const countedTotal = att.effective_total || att.total || 0
                                            const pct = countedTotal > 0 ? Math.round((att.attended / countedTotal) * 100) : 0
                                            return (
                                                <div key={i} className="border border-slate-200 rounded-lg p-4 print:p-2.5 print:border-slate-300 print:break-inside-avoid">
                                                    <p className="text-sm print:text-xs font-bold text-slate-700 mb-2 print:mb-1">{att.session}</p>
                                                    <div className="flex justify-between items-end">
                                                        <div className="space-y-1 print:space-y-0.5">
                                                            <p className="text-xs print:text-[10px] text-slate-600">Attended: <span className="font-semibold text-emerald-600">{att.attended}</span></p>
                                                            <p className="text-xs print:text-[10px] text-slate-600">Not attended: <span className="font-semibold text-red-600">{att.not_attended}</span></p>
                                                            <p className="text-xs print:text-[10px] text-slate-600">Cancelled: <span className="font-semibold text-slate-500">{att.cancelled}</span></p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-2xl print:text-lg font-black text-slate-800">{pct}%</span>
                                                            <p className="text-[10px] print:text-[9px] text-slate-400 font-medium">counted: {countedTotal}</p>
                                                            <p className="text-[10px] print:text-[9px] text-slate-400 font-medium">scheduled: {att.planned}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )
                            })() : (
                                <div className="bg-slate-50 print:bg-transparent rounded-lg p-6 text-center border-dashed border-2 print:border-slate-300 text-slate-500 text-sm">
                                    No attendance data recorded in this timeframe.
                                </div>
                            )}
                        </div>

                        {reportData.performance && (
                            <div className="print:hidden">
                                <h3 className="text-lg font-bold border-b print:border-slate-300 pb-2 mb-4 text-slate-800">Performance & Grade</h3>
                                {reportData.hifz_stage === 'HAFIZ_REVISION' ? (
                                    // Hafiz layout: Juz Revision is scored as one combined 50-point bucket
                                    // (New + Old). Show the two Juz breakdowns instead of memorizing buckets.
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-blue-700">New Revision (Juz)</p>
                                            <p className="mt-1 text-2xl font-black text-blue-900">{reportData.hifz_activity?.new_juz_revision ?? 0}</p>
                                        </div>
                                        <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-orange-700">Old Revision (Juz)</p>
                                            <p className="mt-1 text-2xl font-black text-orange-900">{reportData.hifz_activity?.old_juz_revision ?? 0}</p>
                                        </div>
                                        <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-teal-700">Attendance</p>
                                            <p className="mt-1 text-2xl font-black text-teal-900">{reportData.performance.attendancePoints ?? 0}/20</p>
                                            <p className="text-xs text-teal-700">{reportData.performance.attendancePercentage ?? 0}%</p>
                                        </div>
                                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-emerald-700">Total</p>
                                            <p className="mt-1 text-2xl font-black text-emerald-900">{reportData.performance.totalPoints}/{reportData.performance.totalMax ?? 70}</p>
                                            <p className="text-xs text-emerald-700">{reportData.performance.percentage}%</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 p-4 print:border-slate-300">
                                            <p className="text-xs font-semibold text-slate-600">Grade</p>
                                            <p className="mt-1 text-2xl font-black text-slate-900">{reportData.performance.grade}</p>
                                            <p className="text-xs text-slate-500">{reportData.performance.totalClassDays} point days</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                                        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-blue-700">New Verses</p>
                                            <p className="mt-1 text-2xl font-black text-blue-900">{reportData.performance.newVersePoints}/20</p>
                                        </div>
                                        <div className="rounded-lg border border-orange-100 bg-orange-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-orange-700">Recent Revision</p>
                                            <p className="mt-1 text-2xl font-black text-orange-900">{reportData.performance.recentRevisionPoints}/15</p>
                                        </div>
                                        <div className="rounded-lg border border-violet-100 bg-violet-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-violet-700">Juz Revision</p>
                                            <p className="mt-1 text-2xl font-black text-violet-900">
                                                {(reportData.performance.juzMax ?? 15) > 0
                                                    ? `${reportData.performance.juzPoints}/${reportData.performance.juzMax ?? 15}`
                                                    : 'N/A'}
                                            </p>
                                            {(reportData.performance.juzMax ?? 15) === 0 ? (
                                                <p className="text-xs text-violet-700">
                                                    {reportData.performance.firstJuzCompletionDate
                                                        ? 'Excluded — no class days recorded'
                                                        : 'Available after first Juz'}
                                                </p>
                                            ) : (reportData.performance.juzMax ?? 15) < 15 ? (
                                                <p className="text-xs text-violet-700">Pro-rated from completion</p>
                                            ) : null}
                                        </div>
                                        <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-teal-700">Attendance</p>
                                            <p className="mt-1 text-2xl font-black text-teal-900">{reportData.performance.attendancePoints ?? 0}/20</p>
                                            <p className="text-xs text-teal-700">{reportData.performance.attendancePercentage ?? 0}%</p>
                                        </div>
                                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 print:border-slate-300 print:bg-transparent">
                                            <p className="text-xs font-semibold text-emerald-700">Total</p>
                                            <p className="mt-1 text-2xl font-black text-emerald-900">{reportData.performance.totalPoints}/{reportData.performance.totalMax ?? 70}</p>
                                            <p className="text-xs text-emerald-700">{reportData.performance.percentage}%</p>
                                        </div>
                                        <div className="rounded-lg border border-slate-200 p-4 print:border-slate-300">
                                            <p className="text-xs font-semibold text-slate-600">Grade</p>
                                            <p className="mt-1 text-2xl font-black text-slate-900">{reportData.performance.grade}</p>
                                            <p className="text-xs text-slate-500">{reportData.performance.totalClassDays} point days</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Hifz Progress Metrics */}
                        <div className="print:break-inside-avoid">
                            <h3 className="text-lg font-bold border-b print:border-slate-300 pb-2 mb-4 text-slate-800">Hifz Activity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 print:grid-cols-5 gap-4">
                                {(()=>{
                                    const newVerses = reportData.hifz_logs_agg.find((l:any) => l.mode === 'New Verses')
                                    const juzRevAggSum = (reportData.hifz_logs_agg || [])
                                        .filter((l:any) => typeof l.mode === 'string' && l.mode.startsWith('Juz Revision'))
                                        .reduce((sum:number, l:any) => sum + Number(l.juz_recited || 0), 0)
                                    const exactNewPages = Number(reportData.hifz_activity?.new_pages_recited ?? newVerses?.pages_recited ?? 0)
                                    const completedLifetimeJuz = Number(reportData.hifz_activity?.completed_lifetime_juz ?? 0)
                                    const juzRecited = Number(reportData.hifz_activity?.juz_recited ?? juzRevAggSum ?? 0)

                                    const isHafizStage = reportData.hifz_stage === 'HAFIZ_REVISION'
                                    const newJuzRev = Number(reportData.hifz_activity?.new_juz_revision ?? 0)
                                    const oldJuzRev = Number(reportData.hifz_activity?.old_juz_revision ?? 0)
                                    return (
                                        <>
                                           {isHafizStage ? (
                                               <>
                                                   <div className="bg-blue-50 text-blue-900 border border-blue-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                                       <p className="text-xs text-blue-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">New Revision (Juz)</p>
                                                       <p className="text-3xl font-black">{newJuzRev}</p>
                                                       <p className="text-[10px] mt-1 text-blue-600/60 font-medium print:text-slate-400">Recently completed Juz</p>
                                                   </div>
                                                   <div className="bg-orange-50 text-orange-900 border border-orange-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                                       <p className="text-xs text-orange-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Old Revision (Juz)</p>
                                                       <p className="text-3xl font-black">{oldJuzRev}</p>
                                                       <p className="text-[10px] mt-1 text-orange-600/60 font-medium print:text-slate-400">Long-term retention</p>
                                                   </div>
                                               </>
                                           ) : (
                                               <>
                                                   <div className="bg-blue-50 text-blue-900 border border-blue-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                                       <p className="text-xs text-blue-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">New Pages Recited</p>
                                                       <p className="text-3xl font-black">{exactNewPages}</p>
                                                       <p className="text-[10px] mt-1 text-blue-600/60 font-medium print:text-slate-400">Exact Mushaf page coverage</p>
                                                   </div>
                                                   <div className="bg-orange-50 text-orange-900 border border-orange-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                                       <p className="text-xs text-orange-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Revision Days</p>
                                                       <p className="text-3xl font-black">{reportData.revision_days}</p>
                                                       <p className="text-[10px] mt-1 text-orange-600/60 font-medium print:text-slate-400">Consistent daily reviews</p>
                                                   </div>
                                               </>
                                           )}
                                           <div className="bg-emerald-50 text-emerald-900 border border-emerald-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-emerald-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Juz Revised</p>
                                               <p className="text-3xl font-black">{juzRecited}</p>
                                               <p className="text-[10px] mt-1 text-emerald-600/60 font-medium print:text-slate-400">Sum of Juz portions recited</p>
                                           </div>
                                           <div className="bg-purple-50 text-purple-900 border border-purple-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-purple-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Total Lifetime Juz</p>
                                               <p className="text-3xl font-black">
                                                    {completedLifetimeJuz}
                                               </p>
                                               <p className="text-[10px] mt-1 text-purple-600/60 font-medium print:text-slate-400">Completed entirely</p>
                                           </div>
                                        </>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* ===== PRINT-ONLY REDESIGNED REPORT ===== */}
                    <div className="hidden print:block text-slate-900">
                        {(() => {
                            // Merge attendance by session name
                            const merged = new Map<string, any>()
                            ;(reportData.attendance || []).forEach((att: any) => {
                                const rawSession = (att.session || 'Class').trim()
                                const key = rawSession.toLowerCase()
                                if (merged.has(key)) {
                                    const ex = merged.get(key)
                                    ex.attended += Number(att.attended ?? att.present ?? 0)
                                    ex.not_attended += Number(att.not_attended ?? att.absent ?? 0)
                                    ex.cancelled += Number(att.cancelled || 0)
                                    ex.planned += Number(att.planned || att.total || 0)
                                    ex.effective_total += Number(att.effective_total || att.total || 0)
                                } else {
                                    merged.set(key, {
                                        session: rawSession.replace(/^hifz/i, 'Hifz'),
                                        attended: Number(att.attended ?? att.present ?? 0),
                                        not_attended: Number(att.not_attended ?? att.absent ?? 0),
                                        cancelled: Number(att.cancelled || 0),
                                        planned: Number(att.planned || att.total || 0),
                                        effective_total: Number(att.effective_total || att.total || 0),
                                    })
                                }
                            })
                            const classes = Array.from(merged.values())
                            const first = classes[0]
                            const rest = classes.slice(1)
                            const t = reportData.attendance_totals || {}
                            const grade = reportData.performance?.grade || null

                            const newVerses = reportData.hifz_logs_agg?.find((l: any) => l.mode === 'New Verses')
                            const juzRevAggSum = (reportData.hifz_logs_agg || [])
                                .filter((l: any) => typeof l.mode === 'string' && l.mode.startsWith('Juz Revision'))
                                .reduce((sum: number, l: any) => sum + Number(l.juz_recited || 0), 0)
                            const exactNewPages = Number(reportData.hifz_activity?.new_pages_recited ?? newVerses?.pages_recited ?? 0)
                            const completedLifetimeJuz = Number(reportData.hifz_activity?.completed_lifetime_juz ?? 0)
                            const juzRecited = Number(reportData.hifz_activity?.juz_recited ?? juzRevAggSum ?? 0)

                            const pctOf = (c: any) => {
                                const tot = c.effective_total || c.planned || 0
                                return tot > 0 ? Math.round((c.attended / tot) * 100) : 0
                            }

                            const batchYear = reportData.student.batch_year || '2026'
                            const studentBatch = reportData.student.adm_no ? `${reportData.student.adm_no}-${batchYear}` : 'N/A'

                            return (
                                <div className="p-[8mm] space-y-6 text-slate-900 font-sans">
                                    {/* Title Header with GraduationCap Watermark */}
                                    <div className="relative flex items-start justify-between border-b-2 border-slate-900 pb-3">
                                        <GraduationCap className="absolute -right-2 -top-6 h-36 w-36 text-slate-200/50 -z-10 pointer-events-none stroke-[1.2]" />
                                        <div>
                                            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">STUDENT PROGRESS REPORT</h1>
                                            <p className="text-xs text-slate-500 font-medium mt-0.5">
                                                Academic Year {reportData.academic_year || "2025-2026"} • {format(dateRanges.start, 'MMM d, yyyy')} — {format(dateRanges.end, 'MMM d, yyyy')}
                                            </p>
                                        </div>
                                        <div className="text-right z-10">
                                            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Report Generated</p>
                                            <p className="text-sm font-bold text-slate-900">{format(dateRanges.end, 'MMMM d, yyyy')}</p>
                                        </div>
                                    </div>

                                    {/* Student Information */}
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2.5 flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-slate-500" /> Student Information
                                        </p>
                                        <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-5 grid grid-cols-2 gap-x-12 gap-y-4">
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Full Name</p>
                                                <p className="font-bold text-slate-900 text-sm mt-0.5">{reportData.student.name || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Student ID / Batch</p>
                                                <p className="font-bold text-slate-900 text-sm mt-0.5">{studentBatch}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Class Level</p>
                                                <p className="font-bold text-slate-900 text-sm mt-0.5">{reportData.student.standard || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Assigned Mentor</p>
                                                <p className="font-bold text-slate-900 text-sm mt-0.5">{reportData.student.hifz_mentor || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Attendance Summary — parent-friendly: sessions attended out of
                                        held sessions, plus overall percentage. No Cancelled tile. */}
                                    <div>
                                        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2.5 flex items-center gap-1.5">
                                            <CalendarCheck2 className="h-3.5 w-3.5 text-slate-500" /> Attendance Summary
                                        </p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                                                <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Sessions Attended</p>
                                                <div className="mt-1.5 flex items-baseline justify-center gap-1">
                                                    <span className="text-3xl font-black text-emerald-900">{t.attendedClasses ?? 0}</span>
                                                    <span className="text-sm font-semibold text-emerald-700/70">of {t.effectiveClasses ?? 0}</span>
                                                </div>
                                            </div>
                                            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                                                <p className="text-[10px] uppercase font-bold text-red-700 tracking-wider">Sessions Missed</p>
                                                <p className="text-3xl font-black text-red-700 mt-1.5">{t.notAttendedClasses ?? 0}</p>
                                            </div>
                                            <div className="bg-[#1E293B] text-white rounded-xl p-4 text-center">
                                                <p className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">Attendance Rate</p>
                                                <p className="text-3xl font-black mt-1.5">{reportData.performance?.attendancePercentage ?? 0}%</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Learning Activity — parent-friendly labels and units */}
                                    <div className="break-inside-avoid">
                                        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500 mb-2.5 flex items-center gap-1.5">
                                            <LineChart className="h-3.5 w-3.5 text-slate-500" /> Hifz Activity This Period
                                        </p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="grid grid-cols-2 gap-3 col-span-2">
                                                {reportData.hifz_stage === 'HAFIZ_REVISION' ? (
                                                    <>
                                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                            <p className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">New Revision</p>
                                                            <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{Number(reportData.hifz_activity?.new_juz_revision ?? 0)}</span> <span className="text-xs font-semibold text-slate-500">Juz</span></p>
                                                        </div>
                                                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                            <p className="text-[10px] uppercase font-bold text-orange-700 tracking-wider">Old Revision</p>
                                                            <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{Number(reportData.hifz_activity?.old_juz_revision ?? 0)}</span> <span className="text-xs font-semibold text-slate-500">Juz</span></p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                            <p className="text-[10px] uppercase font-bold text-blue-700 tracking-wider">New Hifz</p>
                                                            <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{exactNewPages.toFixed(1)}</span> <span className="text-xs font-semibold text-slate-500">pages recited</span></p>
                                                        </div>
                                                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                            <p className="text-[10px] uppercase font-bold text-orange-700 tracking-wider">Recent Revision</p>
                                                            <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{reportData.revision_days}</span> <span className="text-xs font-semibold text-slate-500">{Number(reportData.revision_days) === 1 ? 'day' : 'days'}</span></p>
                                                        </div>
                                                    </>
                                                )}
                                                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                    <p className="text-[10px] uppercase font-bold text-violet-700 tracking-wider">Juz Revised</p>
                                                    <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{juzRecited}</span> <span className="text-xs font-semibold text-slate-500">Juz</span></p>
                                                </div>
                                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col justify-between h-[92px]">
                                                    <p className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Total Memorised</p>
                                                    <p className="text-slate-900 mt-1"><span className="text-3xl font-black">{completedLifetimeJuz}</span> <span className="text-xs font-semibold text-slate-500">of 30 Juz</span></p>
                                                </div>
                                            </div>
                                            <div className="bg-[#1E293B] text-white rounded-xl p-5 flex flex-col items-center justify-center text-center col-span-1 h-full min-h-[195px]">
                                                <p className="text-[10px] uppercase font-bold text-slate-300 tracking-wider mb-2">Overall Grade Status</p>
                                                {(() => {
                                                    const rawGrade = String(grade || '').trim();
                                                    const hasValidGrade = rawGrade !== '' && rawGrade.toUpperCase() !== 'NO GRADE' && rawGrade.toUpperCase() !== 'N/A';
                                                    return (
                                                        <>
                                                            <div className="my-2 h-16 w-16 rounded-full border-2 border-slate-600 flex items-center justify-center">
                                                                {hasValidGrade ? (
                                                                    <span className="text-2xl font-black text-white">{rawGrade}</span>
                                                                ) : (
                                                                    <span className="h-0.5 w-6 bg-white/70 rounded"></span>
                                                                )}
                                                            </div>
                                                            {!hasValidGrade && (
                                                                <p className="text-base font-extrabold tracking-wide text-white mt-1">
                                                                    NO GRADE
                                                                </p>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer */}
                                    <div className="pt-8 flex items-end justify-between border-t border-slate-200 mt-6 break-inside-avoid">
                                        <div>
                                            <div className="w-48 border-t border-slate-400 mb-1.5"></div>
                                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Mentor Signature</p>
                                            <p className="font-bold text-slate-900 text-xs mt-0.5">{reportData.student.hifz_mentor || 'N/A'}</p>
                                        </div>
                                        <p className="text-[9px] text-slate-400 text-right max-w-[220px] leading-relaxed">
                                            This is a system-generated document and does not require a physical stamp unless requested for external verification.
                                        </p>
                                    </div>
                                </div>
                            )
                        })()}
                    </div>
                </div>
            )}
        </div>
    )
}
