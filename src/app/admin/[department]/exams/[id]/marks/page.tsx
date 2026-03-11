"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Filter, Loader2, Search, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"

type Exam = { id: string; title: string, department: string }
type Subject = { id: string; name: string; max_marks: number; standard?: string | null }
type Student = { adm_no: string; name: string;[key: string]: string | undefined }

export default function MarkEntryPage({ params }: { params: Promise<{ id: string, department: string }> }) {
    const { id, department } = use(params)
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1);
    const stdColumn = `${department}_standard`; // e.g., 'school_standard' or 'hifz_standard'
    const router = useRouter()

    const [exam, setExam] = useState<Exam | null>(null)
    const [allSubjects, setAllSubjects] = useState<Subject[]>([])
    const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([])
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>("")
    const [selectedStandard, setSelectedStandard] = useState<string>("all")

    const [students, setStudents] = useState<Student[]>([])
    const [marksMap, setMarksMap] = useState<Record<string, { marks: string; remarks: string }>>({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")

    // Data Load
    useEffect(() => {
        loadExamData()
    }, [id])

    // Update Filtered Subjects when Standard changes
    useEffect(() => {
        if (!allSubjects.length) return

        let filtered = allSubjects
        if (selectedStandard !== "all") {
            filtered = allSubjects.filter(s => s.standard === null || s.standard === selectedStandard)
        }
        setFilteredSubjects(filtered)

        // If current selected subject is not in filtered list, select first available
        if (filtered.length > 0) {
            if (!selectedSubjectId || !filtered.find(s => s.id === selectedSubjectId)) {
                setSelectedSubjectId(filtered[0].id)
            }
        } else {
            setSelectedSubjectId("")
        }
    }, [selectedStandard, allSubjects])

    // Load Students and Results when Subject/Standard changes
    useEffect(() => {
        if (selectedSubjectId) {
            loadStudentsAndResults()
        }
    }, [selectedSubjectId, selectedStandard])

    async function loadExamData() {
        setLoading(true)
        try {
            const res = await api.get(`/exams/${id}`)
            if (res.data.success) {
                setExam(res.data.exam)
                const s = res.data.subjects
                if (s) {
                    setAllSubjects(s)
                    setFilteredSubjects(s)
                    if (s.length > 0) setSelectedSubjectId(s[0].id)
                }
            }
        } catch (error) {
            console.error("Failed to load exam data", error)
        }
        setLoading(false)
    }

    async function loadStudentsAndResults() {
        if (!selectedSubjectId) return
        setLoading(true)
        try {
            // Determine the standard to query for based on the selection or the subject's locked standard
            let queryStandard = selectedStandard
            if (queryStandard === "all") {
                const subject = allSubjects.find(s => s.id === selectedSubjectId)
                if (subject?.standard) {
                    queryStandard = subject.standard
                }
            }

            // 1. Fetch Students
            const studentsRes = await api.get(`/exams/students`, {
                params: {
                    department,
                    standard: queryStandard
                }
            })

            if (studentsRes.data.success) {
                setStudents(studentsRes.data.students)

                // 2. Fetch Existing Results
                const marksRes = await api.get(`/exams/${id}/marks`, {
                    params: { subject_id: selectedSubjectId }
                })
                
                if (marksRes.data.success) {
                    const initialMarks: Record<string, { marks: string; remarks: string }> = {}
                    marksRes.data.marks.forEach((r: any) => {
                        initialMarks[r.student_id] = {
                            marks: r.marks_obtained.toString(),
                            remarks: r.remarks || ""
                        }
                    })
                    setMarksMap(initialMarks)
                }
            }
        } catch (error) {
            console.error("Failed to load students and results", error)
        }
        setLoading(false)
    }

    const handleMarkChange = (studentId: string, val: string) => {
        setMarksMap(prev => {
            const current = prev[studentId] || { marks: "", remarks: "" }
            return {
                ...prev,
                [studentId]: { ...current, marks: val }
            }
        })
    }

    const handleRemarkChange = (studentId: string, val: string) => {
        setMarksMap(prev => {
            const current = prev[studentId] || { marks: "", remarks: "" }
            return {
                ...prev,
                [studentId]: { ...current, remarks: val }
            }
        })
    }

    async function handleSave() {
        setSaving(true)
        const updates: any[] = []

        // Prepare upserts
        students.forEach(student => {
            const entry = marksMap[student.adm_no]
            if (entry && entry.marks !== "") {
                updates.push({
                    subject_id: selectedSubjectId,
                    student_id: student.adm_no,
                    marks_obtained: parseFloat(entry.marks),
                    remarks: entry.remarks || null
                })
            }
        })

        if (updates.length === 0) {
            setSaving(false)
            return
        }

        try {
            const res = await api.post(`/exams/${id}/marks`, { updates })
            if (res.data.success) {
                alert("Marks saved successfully!")
            } else {
                alert("Error saving: " + res.data.error)
            }
        } catch (error: any) {
            alert("Error saving: " + error.message)
        }

        setSaving(false)
    }

    if (loading && !exam) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>

    const currentSubject = allSubjects.find(s => s.id === selectedSubjectId)
    const filteredStudents = students.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.adm_no.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col gap-4">
            {/* Top Bar - Compact Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-950 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/${department}/exams/${id}`)} className="shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {exam?.title}
                            <Badge variant="outline" className="font-normal text-xs">{exam?.department}</Badge>
                        </h1>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                            Arguments: <span className="font-medium text-foreground">{currentSubject?.name}</span> • Max Marks: {currentSubject?.max_marks}
                        </p>
                    </div>
                </div>

                <div className="flex gap-3 w-full sm:w-auto ml-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Find student..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                        />
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                {/* Sidebar Filter Panel */}
                <Card className="w-72 hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 shadow-lg h-full bg-slate-50 dark:bg-slate-950">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Filters</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 flex-1 overflow-y-auto">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Standard</label>
                            <Select value={selectedStandard} onValueChange={setSelectedStandard}>
                                <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                    <SelectValue placeholder="All Standards" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Standards</SelectItem>
                                    {["5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"].map(std => (
                                        <SelectItem key={std} value={std}>{std} Standard</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Subject</label>
                            <div className="space-y-1">
                                {filteredSubjects.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setSelectedSubjectId(s.id)}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${selectedSubjectId === s.id
                                            ? "bg-emerald-100 text-emerald-900 font-medium dark:bg-emerald-900/40 dark:text-emerald-50"
                                            : "hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{s.name}</span>
                                            {selectedSubjectId === s.id && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
                                        </div>
                                        {s.standard && <span className="text-xs opacity-60 block mt-0.5">{s.standard} Std</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Main Entry Table */}
                <div className="flex-1 bg-white dark:bg-slate-950 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-auto">
                        <Table>
                            <TableHeader className="bg-slate-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm">
                                <TableRow className="border-b border-slate-200 dark:border-slate-800">
                                    <TableHead className="w-24 pl-6 text-slate-500 dark:text-slate-400 font-semibold">Adm No</TableHead>
                                    <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Student Name</TableHead>
                                    <TableHead className="w-32 text-slate-500 dark:text-slate-400 font-semibold">Standard</TableHead>
                                    <TableHead className="w-40 text-slate-500 dark:text-slate-400 font-semibold">
                                        Marks <span className="text-xs font-normal opacity-70">(Max: {currentSubject?.max_marks})</span>
                                    </TableHead>
                                    <TableHead className="text-slate-500 dark:text-slate-400 font-semibold">Remarks</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">Loading student data...</TableCell></TableRow>
                                ) : filteredStudents.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No students found matching filters.</TableCell></TableRow>
                                ) : (
                                    filteredStudents.map((student, idx) => {
                                        const entry = marksMap[student.adm_no] || { marks: "", remarks: "" }
                                        const isHighMark = parseFloat(entry.marks) >= (currentSubject?.max_marks || 100) * 0.9
                                        const isFail = parseFloat(entry.marks) < (currentSubject?.max_marks || 100) * 0.4
                                        const isInvalid = parseFloat(entry.marks) > (currentSubject?.max_marks || 100)

                                        return (
                                            <TableRow
                                                key={student.adm_no}
                                                className={`transition-colors border-b border-slate-100 dark:border-slate-800/50 
                                                    ${idx % 2 === 0
                                                        ? 'bg-white dark:bg-slate-950'
                                                        : 'bg-slate-50/50 dark:bg-slate-900/30'} 
                                                    hover:bg-slate-100 dark:hover:bg-slate-800/50`}
                                            >
                                                <TableCell className="font-mono text-xs text-muted-foreground pl-6">{student.adm_no}</TableCell>
                                                <TableCell className="font-medium text-slate-700 dark:text-slate-200">{student.name}</TableCell>
                                                <TableCell><Badge variant="outline" className="font-normal text-xs bg-transparent dark:border-slate-700 dark:text-slate-400">{student[stdColumn]}</Badge></TableCell>
                                                <TableCell>
                                                    <div className="relative">
                                                        <Input
                                                            type="number"
                                                            value={entry.marks}
                                                            onChange={(e) => handleMarkChange(student.adm_no, e.target.value)}
                                                            className={`w-28 font-mono font-medium transition-colors 
                                                                ${isInvalid ? "border-red-500 bg-red-50 dark:bg-red-900/20 dark:text-red-200" :
                                                                    isHighMark ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400" :
                                                                        isFail && entry.marks ? "text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400" :
                                                                            "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:border-emerald-500"
                                                                }`}
                                                            min={0}
                                                            max={currentSubject?.max_marks}
                                                        />
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Input
                                                        value={entry.remarks}
                                                        onChange={(e) => handleRemarkChange(student.adm_no, e.target.value)}
                                                        placeholder="Add remark..."
                                                        className="max-w-xs text-sm border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 bg-transparent hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Floating Status Bar */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t text-xs text-muted-foreground flex justify-between px-6">
                        <span>Showing {filteredStudents.length} students</span>
                        <span>{Object.keys(marksMap).filter(k => marksMap[k].marks).length} Marks Entered</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
