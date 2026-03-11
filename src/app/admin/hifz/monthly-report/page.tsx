"use client"

import { useEffect, useState } from "react"
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns"
import { Search, Share2, Loader2, FileText, Download, Calendar, Edit2, Save } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"

type StudentMonthlyStats = {
    adm_no: string
    name: string
    standard: string
    usthad_name: string
    usthad_phone: string
    hifz_pages: number
    recent_pages: number
    juz_revision: number
    total_juz: number | string // Allow string for "N/A"
    grade: string
    attendance: string
    is_manual: boolean // Flag to indicate if data is from manual entry
}

export default function MonthlyReportsPage() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"))
    const [stats, setStats] = useState<StudentMonthlyStats[]>([])
    const [loading, setLoading] = useState(false)
    const [search, setSearch] = useState("")
    const [standardFilter, setStandardFilter] = useState("all")
    const [usthadFilter, setUsthadFilter] = useState("all")
    const [schemaWarning, setSchemaWarning] = useState(false)

    // Editing State
    const [editingStudent, setEditingStudent] = useState<StudentMonthlyStats | null>(null)
    const [editForm, setEditForm] = useState({
        hifz_pages: 0,
        recent_pages: 0,
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
        console.log("Loading report data...")
        console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL)
        console.log("Supabase Key Check:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "Present" : "Missing")

        setLoading(true)
        setSchemaWarning(false)
        try {
            const date = new Date(selectedMonth)
            const start = startOfMonth(date).toISOString()
            const end = endOfMonth(date).toISOString()
            // Make sure to format month as YYYY-MM-DD for the manual report constraint (storing as first day of month)
            const reportMonthDate = format(date, 'yyyy-MM-01')

            // 1. Fetch Students with Usthad details
            let students: any[] = []
            try {
                const res = await api.get('/hifz/students');
                if (res.data.success) students = res.data.students;
            } catch (err: any) {
                console.error("Failed to load students:", err)
            }

            // 2. Fetch Hifz Logs for the Selected Month (Auto Data)
            let logs: any[] = []
            try {
                const res = await api.get('/hifz/logs', { params: { start_date: start, end_date: end } })
                if (res.data.success) logs = res.data.logs;
            } catch (err) {
                console.error("Failed to load hifz logs:", err)
            }

            // 3. Fetch Manual Reports for the Selected Month
            let manualReports: any[] = []
            try {
                const res = await api.get('/hifz/monthly-reports', { params: { report_month: reportMonthDate } })
                if (res.data.success) manualReports = res.data.reports;
            } catch (err) {
                console.error("Failed to load manual reports:", err)
            }

            // 4. Fetch Attendance Summary (Auto Data)
            let attendance: any[] = []
            try {
                const res = await api.get('/academics/attendance', { params: { start_date: start, end_date: end, department: 'Hifz' } })
                if (res.data.success) attendance = res.data.data;
            } catch (err) {
                console.error("Failed to load attendance:", err)
            }

            // Process Data
            const processed = students.map((s: any) => {
                // Check if Manual Record Exists
                const manualRecord = manualReports?.find(r => r.student_id === s.adm_no)

                if (manualRecord) {
                    return {
                        adm_no: s.adm_no,
                        name: s.name,
                        standard: s.standard,
                        usthad_name: s.usthad_name || "Unassigned",
                        usthad_phone: s.usthad_phone || "",
                        hifz_pages: Number(manualRecord.hifz_pages),
                        recent_pages: Number(manualRecord.recent_pages),
                        juz_revision: Number(manualRecord.juz_revision),
                        total_juz: Number(manualRecord.total_juz) || "-",
                        grade: manualRecord.grade || "-",
                        attendance: manualRecord.attendance || "-",
                        is_manual: true
                    }
                }

                // If No Manual Record, Calculate Auto
                const studentLogs = logs?.filter(l => l.student_id === s.adm_no) || []
                const studentAtt = attendance?.filter(a => a.student_id === s.adm_no) || []

                let hifzPages = 0
                let recentPages = 0
                let juzRevPages = 0
                let totalRating = 0
                let ratingCount = 0
                let maxJuzInMonth = 0

                studentLogs.forEach(log => {
                    const pages = (log.page_end - log.page_start + 1) || 0
                    if (log.mode === 'New Verses') {
                        hifzPages += (log.page_start === log.page_end) ? 0.5 : pages
                        if (log.juz > maxJuzInMonth) maxJuzInMonth = log.juz
                    } else if (log.mode === 'Recent Revision') {
                        recentPages += pages
                    } else if (log.mode === 'Juz Revision') {
                        juzRevPages += pages
                        if (log.juz > maxJuzInMonth) maxJuzInMonth = log.juz
                    }

                    if (log.rating) {
                        totalRating += log.rating
                        ratingCount++
                    }
                })

                // Attendance
                const presentDays = studentAtt.filter(a => a.status.toLowerCase() === 'present').length
                const totalDays = studentAtt.length

                return {
                    adm_no: s.adm_no,
                    name: s.name,
                    standard: s.standard,
                    usthad_name: s.usthad_name || "Unassigned",
                    usthad_phone: s.usthad_phone || "",
                    hifz_pages: parseFloat(hifzPages.toFixed(1)),
                    recent_pages: recentPages,
                    juz_revision: parseFloat((juzRevPages / 20).toFixed(1)),
                    total_juz: maxJuzInMonth > 0 ? maxJuzInMonth : "-",
                    grade: ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "-",
                    attendance: totalDays > 0 ? `${presentDays}/${totalDays}` : "-",
                    is_manual: false
                }
            })

            setStats(processed)

        } catch (error: any) {
            console.error("Error loading report detailed:", JSON.stringify(error, null, 2))
            console.error("Raw error:", error)
            // Just warn in console, don't block
        } finally {
            setLoading(false)
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
Recent Revision: ${s.recent_pages} (Pages)
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
            recent_pages: student.recent_pages,
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
                recent_pages: editForm.recent_pages,
                juz_revision: editForm.juz_revision,
                total_juz: editForm.total_juz,
                grade: editForm.grade,
                attendance: editForm.attendance,
            });

            if (!res.data.success) throw new Error(res.data.error);

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
        const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(search.toLowerCase())
        const matchesStandard = standardFilter === 'all' || s.standard === standardFilter
        const matchesUsthad = usthadFilter === 'all' || s.usthad_name === usthadFilter
        return matchesSearch && matchesStandard && matchesUsthad
    })

    const standards = Array.from(new Set(stats.map(s => s.standard))).sort((a, b) => Number(a) - Number(b))
    const usthads = Array.from(new Set(stats.map(s => s.usthad_name))).sort()

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

            {/* Data Table */}
            <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-[#1a2234]">
                <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                        <TableRow>
                            <TableHead className="pl-6">Student</TableHead>
                            <TableHead>Hifz Pages</TableHead>
                            <TableHead>Recent Rev (P)</TableHead>
                            <TableHead>Juz Rev (J)</TableHead>
                            <TableHead>Grade</TableHead>
                            <TableHead>Attendance</TableHead>
                            <TableHead>Usthad</TableHead>
                            <TableHead className="text-right pr-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center h-48">
                                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                                        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                                        <p>Generating monthly report...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredStats.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center h-32 text-slate-500">
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
                                    <TableCell className={`font-semibold ${s.is_manual ? 'text-slate-700 dark:text-slate-300' : 'text-orange-600'}`}>{s.recent_pages}</TableCell>
                                    <TableCell className={`font-semibold ${s.is_manual ? 'text-slate-700 dark:text-slate-300' : 'text-emerald-600'}`}>{s.juz_revision}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={`${s.grade === '-' ? 'text-slate-400 border-slate-200' :
                                                Number(s.grade) >= 4 ? 'text-emerald-600 border-emerald-200 bg-emerald-50' :
                                                    Number(s.grade) >= 3 ? 'text-amber-600 border-amber-200 bg-amber-50' :
                                                        'text-red-600 border-red-200 bg-red-50'
                                                }`}
                                        >
                                            {s.grade}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{s.attendance}</TableCell>
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
                                Recent Rev
                            </Label>
                            <Input
                                id="recent"
                                type="number"
                                className="col-span-3"
                                value={editForm.recent_pages}
                                onChange={(e) => setEditForm({ ...editForm, recent_pages: parseInt(e.target.value) || 0 })}
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
