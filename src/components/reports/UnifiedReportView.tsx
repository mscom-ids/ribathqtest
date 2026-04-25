// src/components/reports/UnifiedReportView.tsx
"use client"

import React, { useState, useEffect } from "react"
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from "date-fns"
import { FileText, Calendar as CalendarIcon, Download, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import api from "@/lib/api"
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

    useEffect(() => {
        // Load students dropdown
        api.get('/staff/me/students')
           .then(res => {
               if (res.data?.students) {
                   setStudents(res.data.students)
                   if (res.data.students.length === 1) { // Auto-select if only 1 student
                       setSelectedStudent(String(res.data.students[0].adm_no))
                   } else if (res.data.students.length > 0) {
                       setSelectedStudent(String(res.data.students[0].adm_no)) // Smart default
                   }
               }
           })
           .catch(() => {})
    }, [])

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
                            <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                                <SelectTrigger className="bg-white w-full">
                                    <SelectValue placeholder="Select Student" />
                                </SelectTrigger>
                                <SelectContent>
                                    {students.map(s => (
                                        <SelectItem key={s.adm_no} value={String(s.adm_no)}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                                <div className="flex flex-col md:flex-row gap-2">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full bg-white justify-start text-left font-normal", !dateRanges.start && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRanges.start ? format(dateRanges.start, "PPP") : "Start Date"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar mode="single" selected={dateRanges.start} onSelect={(d) => d && setDateRanges(p => ({ ...p, start: d }))} />
                                        </PopoverContent>
                                    </Popover>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className={cn("w-full bg-white justify-start text-left font-normal", !dateRanges.end && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dateRanges.end ? format(dateRanges.end, "PPP") : "End Date"}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
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
                <div className="bg-white text-slate-900 border rounded-xl overflow-hidden print:border-none print:shadow-none shadow-sm print:p-0 p-6 print:m-0 print:w-full print:block">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-6 print:border-b-2">
                        <div>
                            <h2 className="text-2xl font-black uppercase tracking-wider text-slate-800">Student Progress Report</h2>
                            <p className="text-sm text-slate-500 mt-1 font-medium">{format(dateRanges.start, 'MMM d, yyyy')} — {format(dateRanges.end, 'MMM d, yyyy')} ({reportType})</p>
                        </div>
                        <Button variant="outline" className="print:hidden" onClick={printPdf}>
                            <Download className="mr-2 h-4 w-4" /> Download PDF
                        </Button>
                    </div>

                    <div className="mt-8 space-y-8">
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
                            {reportData.attendance.length > 0 ? (() => {
                                // Deduplicate by session name — merge present/absent/total for same-named sessions
                                const merged = new Map<string, any>()
                                reportData.attendance.forEach((att: any) => {
                                    const rawSession = (att.session || 'Session').trim()
                                    const key = rawSession.toLowerCase()
                                    if (merged.has(key)) {
                                        const ex = merged.get(key)
                                        ex.present += Number(att.present)
                                        ex.absent  += Number(att.absent)
                                        ex.total   += Number(att.total)
                                    } else {
                                        // Normalize "HIfz" typo to "Hifz" for display
                                        const cleanSession = rawSession.replace(/^hifz/i, 'Hifz')
                                        merged.set(key, { ...att, session: cleanSession, present: Number(att.present), absent: Number(att.absent), total: Number(att.total) })
                                    }
                                })
                                return (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {Array.from(merged.values()).map((att: any, i: number) => {
                                            const total = att.total || 1
                                            const pct = Math.round((att.present / total) * 100) || 0
                                            return (
                                                <div key={i} className="border border-slate-200 rounded-lg p-4 print:border-slate-300 print:break-inside-avoid">
                                                    <p className="text-sm font-bold text-slate-700 mb-2">{att.session}</p>
                                                    <div className="flex justify-between items-end">
                                                        <div className="space-y-1">
                                                            <p className="text-xs text-slate-600">Present: <span className="font-semibold text-emerald-600">{att.present}</span></p>
                                                            <p className="text-xs text-slate-600">Absent: <span className="font-semibold text-red-600">{att.absent}</span></p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-2xl font-black text-slate-800">{pct}%</span>
                                                            <p className="text-[10px] text-slate-400 font-medium">total marked: {att.total}</p>
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

                        {/* Hifz Progress Metrics */}
                        <div className="print:break-inside-avoid">
                            <h3 className="text-lg font-bold border-b print:border-slate-300 pb-2 mb-4 text-slate-800">Hifz Activity</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {(()=>{
                                    const newVerses = reportData.hifz_logs_agg.find((l:any) => l.mode === 'New Verses')
                                    const juzRev = reportData.hifz_logs_agg.find((l:any) => l.mode === 'Juz Revision')
                                    
                                    const pagesFromVerses = newVerses?.verses_recited ? Math.ceil(Number(newVerses.verses_recited) / 15) : 0
                                    const calculatedPages = Number(newVerses?.pages_recited) || pagesFromVerses

                                    const totalLifetimePages = reportData.lifetime_new_logs.reduce((acc: number, log: any) => {
                                        return acc + (Number(log.end_page) - Number(log.start_page) + 1 || Number(log.verses) / 15 || 0)
                                    }, 0)

                                    return (
                                        <>
                                           <div className="bg-blue-50 text-blue-900 border border-blue-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-blue-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">New Verses Recited</p>
                                               <p className="text-3xl font-black">{newVerses?.verses_recited || 0}</p>
                                               <p className="text-[10px] mt-1 text-blue-600/60 font-medium print:text-slate-400">Pages approx: {calculatedPages}</p>
                                           </div>
                                           <div className="bg-orange-50 text-orange-900 border border-orange-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-orange-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Revision Days</p>
                                               <p className="text-3xl font-black">{reportData.revision_days}</p>
                                               <p className="text-[10px] mt-1 text-orange-600/60 font-medium print:text-slate-400">Consistent daily reviews</p>
                                           </div>
                                           <div className="bg-emerald-50 text-emerald-900 border border-emerald-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-emerald-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Juz Revisions</p>
                                               <p className="text-3xl font-black">{juzRev?.entry_count || 0}</p>
                                               <p className="text-[10px] mt-1 text-emerald-600/60 font-medium print:text-slate-400">Total logged sessions</p>
                                           </div>
                                           <div className="bg-purple-50 text-purple-900 border border-purple-100 print:border-slate-300 print:bg-transparent rounded-lg p-4">
                                               <p className="text-xs text-purple-600/80 print:text-slate-500 uppercase font-bold tracking-wider mb-1">Total Lifetime Juz</p>
                                               <p className="text-3xl font-black">
                                                    {Math.floor(totalLifetimePages / 20) || 0}
                                               </p>
                                               <p className="text-[10px] mt-1 text-purple-600/60 font-medium print:text-slate-400">Completed entirely</p>
                                           </div>
                                        </>
                                    )
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
