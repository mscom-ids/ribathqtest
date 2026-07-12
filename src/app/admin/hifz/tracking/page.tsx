"use client"

import { useState, useEffect, useMemo } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Search, BookOpen, Download, FileText } from "lucide-react"
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
import { formatCompactHifzEntries } from "@/lib/hifz-entry-summary"

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

const HIFZ_MODES = ["New Verses", "Recent Revision", "Juz Revision"] as const
type HifzMode = (typeof HIFZ_MODES)[number]

const EXPORT_HEADERS = [
    "Date",
    "Adm No",
    "Student Name",
    "Current Position",
    "Recited?",
    "Entry Count",
    "Missing Record Types",
    "New Verses",
    "Recent Revision",
    "Juz Revision",
    "All Records",
] as const

type ExportHeader = (typeof EXPORT_HEADERS)[number]
type ExportRow = Record<ExportHeader, string | number>

function escapeCsvValue(value: string | number) {
    const text = String(value ?? "")
    if (/[",\r\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`
    }
    return text
}

function escapeHtml(value: string | number) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
}

export default function HifzTrackingPage() {
    const [date, setDate] = useState<Date>(new Date())
    const [students, setStudents] = useState<Student[]>([])
    const [hifzLogs, setHifzLogs] = useState<Record<string, HifzLog[]>>({})
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const dateKey = format(date, "yyyy-MM-dd")
    const dateLabel = format(date, "PPP")

    // Load students and hifz logs when date changes
    useEffect(() => {
        async function loadData() {
            setLoading(true)

            try {
                // Load all active students enrolled in Hifz
                const { data: { students: studentsData } } = await api.get('/hifz/students');

                if (studentsData) {
                    setStudents(studentsData)
                }

                // Load existing hifz logs for this date.
                const { data: { logs: logsData } } = await api.get('/hifz/logs', {
                    params: { date: dateKey }
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
    }, [dateKey])

    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.adm_no.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Format log display
    const formatLogDisplay = (log: HifzLog) => {
        return formatHifzLogLabel(log);
    }

    const getStudentLogs = (student: Student) => hifzLogs[student.adm_no] || []

    const getCurrentPosition = (student: Student) => {
        const parts: string[] = []
        if (student.current_surah) {
            parts.push(`Surah: ${student.current_surah}`)
        }
        if (student.current_juz) {
            parts.push(`Juz: ${student.current_juz}`)
        }
        return parts.length > 0 ? parts.join(" | ") : "Not set"
    }

    const compactEntriesByStudent = useMemo(() => {
        const entries: Record<string, Record<HifzMode, string[]>> = {}
        for (const [studentId, logs] of Object.entries(hifzLogs)) {
            entries[studentId] = {
                "New Verses": formatCompactHifzEntries(logs.filter(log => log.mode === "New Verses")),
                "Recent Revision": formatCompactHifzEntries(logs.filter(log => log.mode === "Recent Revision")),
                "Juz Revision": formatCompactHifzEntries(logs.filter(log => log.mode?.startsWith("Juz Revision"))),
            }
        }
        return entries
    }, [hifzLogs])

    const getCompactModeEntries = (studentId: string, mode: HifzMode) =>
        compactEntriesByStudent[studentId]?.[mode] || []

    const exportRows: ExportRow[] = filteredStudents.map((student) => {
        const logs = getStudentLogs(student)
        const modeEntries = HIFZ_MODES.reduce<Record<HifzMode, string[]>>((entries, mode) => {
            entries[mode] = getCompactModeEntries(student.adm_no, mode)
            return entries
        }, {
            "New Verses": [],
            "Recent Revision": [],
            "Juz Revision": [],
        })
        const missingModes = HIFZ_MODES.filter(mode => modeEntries[mode].length === 0)

        return {
            Date: dateLabel,
            "Adm No": student.adm_no,
            "Student Name": student.name,
            "Current Position": getCurrentPosition(student),
            "Recited?": logs.length > 0 ? "Yes" : "No",
            "Entry Count": logs.length,
            "Missing Record Types": missingModes.length > 0 ? missingModes.join("; ") : "-",
            "New Verses": modeEntries["New Verses"].join("; ") || "No entry",
            "Recent Revision": modeEntries["Recent Revision"].join("; ") || "No entry",
            "Juz Revision": modeEntries["Juz Revision"].join("; ") || "No entry",
            "All Records": logs.length > 0
                ? logs.map(log => `${log.mode}: ${formatLogDisplay(log)}`).join("; ")
                : "No entry",
        }
    })

    const exportSummary = {
        total: exportRows.length,
        recited: exportRows.filter(row => row["Recited?"] === "Yes").length,
        pending: exportRows.filter(row => row["Recited?"] === "No").length,
        partial: exportRows.filter(row => Number(row["Entry Count"]) > 0 && Number(row["Entry Count"]) < HIFZ_MODES.length).length,
        newVerses: filteredStudents.flatMap(getStudentLogs).filter(log => log.mode === "New Verses").length,
        recentRevision: filteredStudents.flatMap(getStudentLogs).filter(log => log.mode === "Recent Revision").length,
        juzRevision: filteredStudents.flatMap(getStudentLogs).filter(log => log.mode?.startsWith("Juz Revision")).length,
    }

    const handleExportExcel = () => {
        if (exportRows.length === 0) return

        const csvLines = [
            EXPORT_HEADERS.map(escapeCsvValue).join(","),
            ...exportRows.map(row => EXPORT_HEADERS.map(header => escapeCsvValue(row[header])).join(",")),
        ]

        downloadTextFile(
            `hifz-tracking-${dateKey}.csv`,
            `\uFEFF${csvLines.join("\r\n")}`,
            "text/csv;charset=utf-8"
        )
    }

    const handleExportPdf = () => {
        if (exportRows.length === 0) return

        const printWindow = window.open("", "_blank")
        if (!printWindow) {
            alert("Please allow pop-ups to export the PDF report.")
            return
        }

        const rowsHtml = exportRows.map(row => `
            <tr class="${row["Recited?"] === "No" ? "pending" : ""}">
                <td>${escapeHtml(row["Adm No"])}</td>
                <td>${escapeHtml(row["Student Name"])}</td>
                <td>${escapeHtml(row["Current Position"])}</td>
                <td>${escapeHtml(row["Recited?"])}</td>
                <td>${escapeHtml(row["Entry Count"])}</td>
                <td>${escapeHtml(row["Missing Record Types"])}</td>
                <td>${escapeHtml(row["New Verses"])}</td>
                <td>${escapeHtml(row["Recent Revision"])}</td>
                <td>${escapeHtml(row["Juz Revision"])}</td>
            </tr>
        `).join("")

        printWindow.document.write(`
            <!doctype html>
            <html>
                <head>
                    <title>Hifz Tracking ${escapeHtml(dateKey)}</title>
                    <style>
                        @page { margin: 14mm; }
                        * { box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
                        h1 { font-size: 22px; margin: 0 0 4px; }
                        .meta { color: #4b5563; font-size: 12px; margin-bottom: 16px; }
                        .summary { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 16px; }
                        .summary-item { border: 1px solid #dbe3ef; border-radius: 8px; padding: 8px; }
                        .summary-value { font-size: 18px; font-weight: 700; }
                        .summary-label { color: #64748b; font-size: 11px; }
                        table { width: 100%; border-collapse: collapse; font-size: 10px; }
                        th, td { border: 1px solid #dbe3ef; padding: 6px; vertical-align: top; text-align: left; }
                        th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
                        tr.pending td { color: #6b7280; background: #fafafa; }
                    </style>
                </head>
                <body>
                    <h1>Daily Hifz Tracking Report</h1>
                    <div class="meta">Date: ${escapeHtml(dateLabel)} | Search filter: ${escapeHtml(searchQuery || "All students")}</div>
                    <div class="summary">
                        <div class="summary-item"><div class="summary-value">${exportSummary.total}</div><div class="summary-label">Students</div></div>
                        <div class="summary-item"><div class="summary-value">${exportSummary.recited}</div><div class="summary-label">Recited</div></div>
                        <div class="summary-item"><div class="summary-value">${exportSummary.pending}</div><div class="summary-label">Not Recited</div></div>
                        <div class="summary-item"><div class="summary-value">${exportSummary.partial}</div><div class="summary-label">Partial</div></div>
                        <div class="summary-item"><div class="summary-value">${exportSummary.newVerses}</div><div class="summary-label">New</div></div>
                        <div class="summary-item"><div class="summary-value">${exportSummary.recentRevision + exportSummary.juzRevision}</div><div class="summary-label">Revision</div></div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Adm No</th>
                                <th>Student Name</th>
                                <th>Current Position</th>
                                <th>Recited?</th>
                                <th>Count</th>
                                <th>Missing</th>
                                <th>New Verses</th>
                                <th>Recent Revision</th>
                                <th>Juz Revision</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </body>
            </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Hifz Tracking</h1>
                    <p className="text-muted-foreground">Record and view student Hifz progress</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant="outline"
                        onClick={handleExportPdf}
                        disabled={loading || exportRows.length === 0}
                    >
                        <FileText className="mr-2 h-4 w-4" />
                        PDF
                    </Button>
                    <Button
                        onClick={handleExportExcel}
                        disabled={loading || exportRows.length === 0}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Excel
                    </Button>
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
                                    {date ? dateLabel : <span>Pick a date</span>}
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
                                        <TableHead>Today&apos;s Record</TableHead>
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
                                            const logs = getStudentLogs(student)
                                            const currentPosition = getCurrentPosition(student)
                                            return (
                                                <TableRow key={student.adm_no}>
                                                    <TableCell className="font-mono">{student.adm_no}</TableCell>
                                                    <TableCell className="font-medium">{student.name}</TableCell>
                                                    <TableCell className="text-muted-foreground">
                                                        {currentPosition !== "Not set" ? (
                                                            <span>{currentPosition}</span>
                                                        ) : (
                                                            <span className="text-gray-400">Not set</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {logs.length > 0 ? (() => {
                                                            const newVerses = getCompactModeEntries(student.adm_no, "New Verses");
                                                            const recentRevisions = getCompactModeEntries(student.adm_no, "Recent Revision");
                                                            const juzRevisions = getCompactModeEntries(student.adm_no, "Juz Revision");

                                                            const renderLogBadge = (label: string, mode: HifzMode, index: number) => (
                                                                <div key={`${mode}-${index}-${label}`} className="bg-slate-50 dark:bg-slate-900 border rounded shadow-sm w-fit">
                                                                    <Link href={`/staff/entry/${student.adm_no}?date=${dateKey}&returnTo=/admin/hifz/tracking`} className="flex items-center gap-1 px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors">
                                                                        <span className={cn("px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold uppercase tracking-wider", getModeColor(mode))}>
                                                                            {mode === "New Verses" ? "New" : mode === "Recent Revision" ? "Recent" : "Juz"}
                                                                        </span>
                                                                        <span className="text-xs text-muted-foreground font-medium pr-1 hover:text-foreground hover:underline decoration-dotted underline-offset-2">
                                                                            {label}
                                                                        </span>
                                                                    </Link>
                                                                </div>
                                                            );

                                                            return (
                                                                <div className="flex gap-3 items-start">
                                                                    {newVerses.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {newVerses.map((label, index) => renderLogBadge(label, "New Verses", index))}
                                                                        </div>
                                                                    )}
                                                                    {recentRevisions.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {recentRevisions.map((label, index) => renderLogBadge(label, "Recent Revision", index))}
                                                                        </div>
                                                                    )}
                                                                    {juzRevisions.length > 0 && (
                                                                        <div className="flex flex-col gap-1.5">
                                                                            {juzRevisions.map((label, index) => renderLogBadge(label, "Juz Revision", index))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })() : (
                                                            <span className="text-gray-400">No entry</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Link href={`/staff/entry/${student.adm_no}?date=${dateKey}&returnTo=/admin/hifz/tracking`}>
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
                                        {exportSummary.newVerses}
                                    </div>
                                    <p className="text-sm text-emerald-600">New Verses</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-blue-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-blue-700">
                                        {exportSummary.recentRevision}
                                    </div>
                                    <p className="text-sm text-blue-600">Recent Revision</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-purple-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-purple-700">
                                        {exportSummary.juzRevision}
                                    </div>
                                    <p className="text-sm text-purple-600">Juz Revision</p>
                                </CardContent>
                            </Card>
                            <Card className="bg-gray-50">
                                <CardContent className="pt-4">
                                    <div className="text-2xl font-bold text-gray-700">
                                        {exportSummary.pending}
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
