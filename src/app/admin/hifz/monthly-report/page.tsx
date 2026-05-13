"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Search, Share2, Loader2, Calendar, Edit2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { Badge } from "@/components/ui/badge"

type StudentMonthlyStats = {
    adm_no: string
    name: string
    standard: string
    usthad_name: string
    usthad_phone: string
    hifz_pages: number
    recent_days: number
    juz_revision: number
    total_juz: number | string // Allow string for "N/A"
    grade: string
    attendance: string
    is_manual: boolean // Flag to indicate if data is from manual entry
    scheduledClassDays?: number
    pointClassDays?: number
    cancelledClasses?: number
    attendedClasses?: number
    notAttendedClasses?: number
}

function formatAttendanceText(student: StudentMonthlyStats) {
    if (
        student.attendedClasses === undefined &&
        student.notAttendedClasses === undefined &&
        student.cancelledClasses === undefined
    ) {
        return student.attendance
    }

    const parts = [
        `${student.attendedClasses || 0} attended`,
        `${student.notAttendedClasses || 0} not attended`,
    ]

    if ((student.cancelledClasses || 0) > 0) {
        parts.push(`${student.cancelledClasses} cancelled`)
    }

    return parts.join(', ')
}

function formatPointDays(value?: number) {
    if (value === undefined || value === null) return "-"
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "")
}

export default function MonthlyReportsPage() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"))
    const [stats, setStats] = useState<StudentMonthlyStats[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")
    const [standardFilter, setStandardFilter] = useState("all")
    const [usthadFilter, setUsthadFilter] = useState("all")
    const [schemaWarning, setSchemaWarning] = useState(false)
    const [classDays, setClassDays] = useState(0)
    const [scheduledClassDays, setScheduledClassDays] = useState(0)
    const [cancelledClassDays, setCancelledClassDays] = useState(0)
    const [automaticPointClassDays, setAutomaticPointClassDays] = useState(0)
    const [detectedClassDays, setDetectedClassDays] = useState(0)
    const [detectedLogDays, setDetectedLogDays] = useState(0)
    const [overrideClassDays, setOverrideClassDays] = useState<number | null>(null)
    const [classDaysDraft, setClassDaysDraft] = useState("")
    const [savingClassDays, setSavingClassDays] = useState(false)
    const [usingFallbackLogDays, setUsingFallbackLogDays] = useState(false)
    const [reportEndDate, setReportEndDate] = useState("")
    const [isCurrentMonthReport, setIsCurrentMonthReport] = useState(false)

    // Editing State
    const [editingStudent, setEditingStudent] = useState<StudentMonthlyStats | null>(null)
    const [editForm, setEditForm] = useState({
        hifz_pages: 0,
        recent_days: 0,
        juz_revision: 0,
        total_juz: 0,
        grade: "",
        attendance: ""
    })
    const [saving, setSaving] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    useEffect(() => {
        loadReportData()
    }, [selectedMonth])

    async function loadReportData() {
        setLoading(true)
        setSchemaWarning(false)
        try {
            // Our backend now handles all the fetching, merging, and grade calculations
            // Re-verified endpoint: /hifz/monthly-reports/calculate
            const res = await cachedGet('/hifz/monthly-reports/calculate', { month: selectedMonth }, 5 * 60_000)
            
            if (res.data.success && Array.isArray(res.data.reports)) {
                const sorted = res.data.reports.sort((a: any, b: any) => 
                    a.adm_no.localeCompare(b.adm_no, undefined, { numeric: true })
                )
                const nextClassDays = Number(res.data.class_days || 0)
                const nextScheduledClassDays = Number(res.data.scheduled_class_days || nextClassDays)
                const nextOverrideClassDays =
                    res.data.override_class_days === null || res.data.override_class_days === undefined
                        ? null
                        : Number(res.data.override_class_days)
                const nextAutomaticPointClassDays = Number(res.data.automatic_point_class_days || res.data.point_class_days || 0)
                setStats(sorted)
                setClassDays(nextClassDays)
                setDetectedClassDays(Number(res.data.detected_class_days || 0))
                setDetectedLogDays(Number(res.data.detected_log_days || 0))
                setOverrideClassDays(nextOverrideClassDays)
                setUsingFallbackLogDays(Boolean(res.data.using_fallback_log_days))
                setClassDaysDraft(String(nextOverrideClassDays ?? (nextAutomaticPointClassDays || nextClassDays || nextScheduledClassDays)))
                setScheduledClassDays(nextScheduledClassDays)
                setCancelledClassDays(Number(res.data.cancelled_class_days || 0))
                setAutomaticPointClassDays(nextAutomaticPointClassDays)
                setReportEndDate(res.data.report_end_date || "")
                setIsCurrentMonthReport(Boolean(res.data.is_current_month))
            } else {
                console.error("Failed to load reports:", res.data.error || "Reports not found in response")
                setStats([])
                setClassDays(0)
                setDetectedClassDays(0)
                setDetectedLogDays(0)
                setOverrideClassDays(null)
                setUsingFallbackLogDays(false)
                setClassDaysDraft("0")
                setScheduledClassDays(0)
                setCancelledClassDays(0)
                setAutomaticPointClassDays(0)
                setReportEndDate("")
                setIsCurrentMonthReport(false)
            }
        } catch (error: any) {
            console.error("Error loading report detailed:", error)
            setStats([])
            setClassDays(0)
            setDetectedClassDays(0)
            setDetectedLogDays(0)
            setOverrideClassDays(null)
            setUsingFallbackLogDays(false)
            setClassDaysDraft("0")
            setScheduledClassDays(0)
            setCancelledClassDays(0)
            setAutomaticPointClassDays(0)
            setReportEndDate("")
            setIsCurrentMonthReport(false)
        } finally {
            setLoading(false)
        }
    }

    const saveClassDays = async () => {
        const parsed = Number(classDaysDraft)
        if (!Number.isFinite(parsed) || parsed < 0) {
            alert("Class days must be 0 or more.")
            return
        }

        setSavingClassDays(true)
        try {
            const reportMonthDate = format(new Date(selectedMonth), "yyyy-MM-01")
            const res = await api.post("/hifz/monthly-report-settings", {
                report_month: reportMonthDate,
                expected_class_days: parsed,
            })

            if (!res.data.success) throw new Error(res.data.error)

            invalidateCache('/hifz/monthly-reports/calculate')
            loadReportData()
        } catch (error: any) {
            console.error("Error saving class days:", error)
            alert("Failed to save class days: " + error.message)
        } finally {
            setSavingClassDays(false)
        }
    }

    const handleShare = (s: StudentMonthlyStats) => {
        if (!s.usthad_phone) {
            alert("Usthad has no phone number connected!")
            return
        }

        const monthName = new Date(selectedMonth).toLocaleString('default', { month: 'long', year: 'numeric' })

        const text = `
*MONTHLY REPORT - ${monthName.toUpperCase()}*
Student: *${s.name}* (Ad: ${s.adm_no})
Standard: ${s.standard}

Hifz Pages: ${s.hifz_pages}
Recent Revision: ${s.recent_days} (Days)
Juz Revision: ${s.juz_revision} (Juz)
Grade: *${s.grade}*
Attendance: ${s.attendance}

_Generated from Ma'din Ribathul Quran ERP_
        `.trim()

        const encodedText = encodeURIComponent(text)
        const cleanPhone = s.usthad_phone.replace(/\s+/g, '').replace(/\+/g, '')

        window.open(`https://wa.me/${cleanPhone}?text=${encodedText}`, '_blank')
    }

    const openEditDialog = (student: StudentMonthlyStats) => {
        setEditingStudent(student)
        setEditForm({
            hifz_pages: student.hifz_pages,
            recent_days: student.recent_days,
            juz_revision: student.juz_revision,
            total_juz: typeof student.total_juz === 'number' ? student.total_juz : 0,
            grade: student.grade === '-' ? '' : student.grade,
            attendance: student.attendance === '-' ? '' : student.attendance
        })
        setIsDialogOpen(true)
    }

    const saveManualReport = async () => {
        if (!editingStudent) return
        setSaving(true)
        try {
            const reportMonthDate = format(new Date(selectedMonth), 'yyyy-MM-01')

            const res = await api.post("/hifz/monthly-reports", {
                student_id: editingStudent.adm_no,
                report_month: reportMonthDate,
                hifz_pages: editForm.hifz_pages,
                recent_pages: editForm.recent_days,
                juz_revision: editForm.juz_revision,
                total_juz: editForm.total_juz,
                grade: editForm.grade,
                attendance: editForm.attendance,
            });

            if (!res.data.success) throw new Error(res.data.error);

            invalidateCache('/hifz/monthly-reports')
            invalidateCache('/hifz/monthly-reports/calculate')
            setIsDialogOpen(false)
            loadReportData() // Refresh

        } catch (error: any) {
            console.error("Error saving manual report:", error)
            alert("Failed to save report: " + error.message)
        } finally {
            setSaving(false)
        }
    }

    // Filter Logic
    const filteredStats = stats.filter(s => {
        const searchTerm = search.toLowerCase()
        const matchesSearch = s.name.toLowerCase().includes(searchTerm) ||
            s.adm_no.toLowerCase().includes(searchTerm) ||
            s.usthad_name.toLowerCase().includes(searchTerm)
        const matchesStandard = standardFilter === 'all' || s.standard === standardFilter
        const matchesUsthad = usthadFilter === 'all' || s.usthad_name === usthadFilter
        return matchesSearch && matchesStandard && matchesUsthad
    })

    const standards = Array.from(new Set(stats.map(s => s.standard))).sort((a, b) => Number(a) - Number(b))
    const usthads = Array.from(new Set(stats.map(s => s.usthad_name))).sort()

    function gradeBadgeClass(grade: string) {
        const normalized = (grade || "").toUpperCase().trim()
        if (normalized === "-" || normalized === "NO GRADE") {
            return "text-slate-400 border-slate-200"
        }
        if (["A++", "A+", "A", "B+"].includes(normalized)) {
            return "text-emerald-600 border-emerald-200 bg-emerald-50"
        }
        if (["B", "C+"].includes(normalized)) {
            return "text-amber-600 border-amber-200 bg-amber-50"
        }
        return "text-red-600 border-red-200 bg-red-50"
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Monthly Reports</h1>
                    <p className="text-slate-500 dark:text-slate-400">Track and share monthly student progress.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-40 bg-white dark:bg-slate-900"
                    />
                    <Button variant="outline" onClick={loadReportData} className="gap-2">
                        <Calendar className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filters & Warning */}
            {schemaWarning && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-lg border border-yellow-200 dark:border-yellow-800 text-sm flex items-center gap-2">
                    <span className="font-bold">Warning:</span> Staff phone numbers could not be loaded. Database migration may be pending.
                </div>
            )}

            <Card className="border-none shadow-sm bg-white dark:bg-[#1a2234]">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Search student..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Select value={standardFilter} onValueChange={setStandardFilter}>
                        <SelectTrigger className="w-full md:w-[180px]">
                            <SelectValue placeholder="Standard" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Standards</SelectItem>
                            {standards.map(st => (
                                <SelectItem key={st} value={st}>{st} Std</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={usthadFilter} onValueChange={setUsthadFilter}>
                        <SelectTrigger className="w-full md:w-[200px]">
                            <SelectValue placeholder="Usthad" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Usthads</SelectItem>
                            {usthads.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
                <div className="px-4 pb-4 text-xs text-slate-500 flex justify-between items-center">
                    <span>
                        <span className="font-medium">Note:</span> Reports are automatically generated. Click "Edit" to manually override values.
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" /> <span className="text-slate-400">Manual Entry</span>
                    </div>
                </div>
            </Card>

            <Card className="border-none shadow-sm bg-white dark:bg-[#1a2234]">
                <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">Class Days for This Month</p>
                            <p className="text-xs text-slate-500 mt-1">
                                Detected from Hifz attendance: <span className="font-semibold text-slate-700 dark:text-slate-300">{detectedClassDays}</span>
                                <span className="ml-2">
                                    Scheduled: <span className="font-semibold text-slate-700 dark:text-slate-300">{scheduledClassDays}</span>
                                </span>
                                <span className="ml-2">
                                    Cancelled: <span className="font-semibold text-rose-600">{cancelledClassDays}</span>
                                </span>
                                <span className="ml-2">
                                    Max point days: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatPointDays(automaticPointClassDays)}</span>
                                </span>
                                {overrideClassDays !== null && (
                                    <span className="ml-2 text-blue-600 dark:text-blue-400">
                                        Manual fallback saved
                                    </span>
                                )}
                            </p>
                            {usingFallbackLogDays && overrideClassDays === null && (
                                <p className="text-xs text-amber-600 mt-1">
                                    Attendance days are missing for this month, so grade calculation is currently using Hifz log days: <span className="font-semibold">{detectedLogDays}</span>
                                </p>
                            )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="class-days" className="text-xs text-slate-500">Editable point class days</Label>
                                <Input
                                    id="class-days"
                                    type="number"
                                    min="0"
                                    value={classDaysDraft}
                                    onChange={(e) => setClassDaysDraft(e.target.value)}
                                    className="w-full sm:w-32"
                                />
                            </div>
                            <Button onClick={saveClassDays} disabled={savingClassDays || Number(classDaysDraft) === (overrideClassDays ?? (automaticPointClassDays || classDays))} className="gap-2">
                                {savingClassDays ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Point Days
                            </Button>
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                        Current point calculation uses each student's own Hifz point days. The highest row currently has <span className="font-semibold text-slate-700 dark:text-slate-300">{formatPointDays(classDays)}</span> point days
                        {isCurrentMonthReport && reportEndDate ? (
                            <> up to <span className="font-semibold text-slate-700 dark:text-slate-300">{reportEndDate}</span></>
                        ) : null}
                        {' '}after standard-wise cancelled classes are removed.
                    </div>
                </CardContent>
            </Card>

            {/* Data Table */}
            <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                        <TableRow>
                            <TableHead className="pl-6">Student</TableHead>
                            <TableHead>Hifz Pages</TableHead>
                            <TableHead>Recent Rev (D)</TableHead>
                            <TableHead>Juz Rev (J)</TableHead>
                            <TableHead>Point Days</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead>Attendance</TableHead>
                            <TableHead>Usthad</TableHead>
                            <TableHead className="text-right pr-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center h-48">
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                                        <p>Generating monthly report...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredStats.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center h-32 text-slate-500">
                                    No data found for this month.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredStats.map((s) => (
                                <TableRow key={s.adm_no} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                    <TableCell className="pl-6 font-medium">
                                        <div>
                                            {s.name}
                                            {s.is_manual && <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1 bg-blue-100 text-blue-700 hover:bg-blue-100">Manual</Badge>}
                                            <span className="text-xs text-slate-400 block">{s.standard} Std • {s.adm_no}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className={`font-semibold ${s.is_manual ? 'text-slate-700 dark:text-slate-300' : 'text-blue-600'}`}>{s.hifz_pages}</TableCell>
                                    <TableCell className={`font-semibold ${s.is_manual ? 'text-slate-700 dark:text-slate-300' : 'text-orange-600'}`}>{s.recent_days}</TableCell>
                                    <TableCell className={`font-semibold ${s.is_manual ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-600'}`}>{s.juz_revision}</TableCell>
                                    <TableCell className="font-semibold text-slate-700 dark:text-slate-300">{formatPointDays(s.pointClassDays)}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={gradeBadgeClass(s.grade)}
                                        >
                                            {s.grade}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{formatAttendanceText(s)}</TableCell>
                                    <TableCell className="text-slate-500 text-sm">{s.usthad_name}</TableCell>
                                    <TableCell className="text-right pr-6">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50"
                                                onClick={() => openEditDialog(s)}
                                                title="Edit Report"
                                            >
                                                <Edit2 className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 gap-2 text-green-600 border-green-200 hover:bg-green-50"
                                                onClick={() => handleShare(s)}
                                                title="Share via WhatsApp"
                                            >
                                                <Share2 className="h-3.5 w-3.5" />
                                                Share
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Edit Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Edit Monthly Report</DialogTitle>
                        <DialogDescription>
                            Manually update report data for {editingStudent?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="hifz" className="text-right">
                                Hifz Pages
                            </Label>
                            <Input
                                id="hifz"
                                type="number"
                                className="col-span-3"
                                value={editForm.hifz_pages}
                                onChange={(e) => setEditForm({ ...editForm, hifz_pages: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="recent" className="text-right">
                                Recent Rev (Days)
                            </Label>
                            <Input
                                id="recent"
                                type="number"
                                className="col-span-3"
                                value={editForm.recent_days}
                                onChange={(e) => setEditForm({ ...editForm, recent_days: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="juz_rev" className="text-right">
                                Juz Rev
                            </Label>
                            <Input
                                id="juz_rev"
                                type="number"
                                className="col-span-3"
                                value={editForm.juz_revision}
                                onChange={(e) => setEditForm({ ...editForm, juz_revision: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="total_juz" className="text-right">
                                Total Juz
                            </Label>
                            <Input
                                id="total_juz"
                                type="number"
                                className="col-span-3"
                                value={editForm.total_juz}
                                onChange={(e) => setEditForm({ ...editForm, total_juz: parseFloat(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="grade" className="text-right">
                                Grade
                            </Label>
                            <Input
                                id="grade"
                                className="col-span-3"
                                value={editForm.grade}
                                onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                                placeholder="e.g. 4.5"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="attendance" className="text-right">
                                Attendance
                            </Label>
                            <Input
                                id="attendance"
                                className="col-span-3"
                                value={editForm.attendance}
                                onChange={(e) => setEditForm({ ...editForm, attendance: e.target.value })}
                                placeholder="e.g. 25/30"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" onClick={saveManualReport} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Report
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
