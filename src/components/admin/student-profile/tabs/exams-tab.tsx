import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type Student } from "@/app/admin/students/page"
import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { BookOpen, GraduationCap, ChevronDown, ChevronRight } from "lucide-react"
import { format } from "date-fns"

type ExamResult = {
    exam_id: string
    subject_id: string
    marks_obtained: number
    remarks: string | null
}

type Exam = {
    id: string
    title: string
    type: string
    start_date: string
    is_active: boolean
}

type Subject = {
    id: string
    name: string
    max_marks: number
    min_marks: number
}

export function ExamsTab({ student }: { student: Student }) {
    const [exams, setExams] = useState<Exam[]>([])
    const [results, setResults] = useState<ExamResult[]>([])
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedExamIds, setExpandedExamIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        loadData()
    }, [student.adm_no])

    async function loadData() {
        setLoading(true)
        let loadedExams: Exam[] = []
        try {
            const examsRes = await api.get('/exams')
            if (examsRes.data.success) {
                loadedExams = examsRes.data.exams || []
                setExams(loadedExams)
            }
        } catch (err) {
            console.warn('Failed to load exams', err)
        }
        try {
            const subjectsRes = await api.get('/exams/subjects')
            if (subjectsRes.data.success) setSubjects(subjectsRes.data.subjects || [])
        } catch (err) {
            console.warn('Failed to load subjects (endpoint may not exist)', err)
        }
        try {
            const resultsRes = await api.get('/exams/results', { params: { student_id: student.adm_no } })
            if (resultsRes.data.success) setResults(resultsRes.data.results || [])
        } catch (err) {
            console.warn('Failed to load exam results', err)
        }
        if (loadedExams.length > 0) {
            setExpandedExamIds(new Set([loadedExams[0].id]))
        }
        setLoading(false)
    }

    const toggleExam = (examId: string) => {
        const newExpanded = new Set(expandedExamIds)
        if (newExpanded.has(examId)) {
            newExpanded.delete(examId)
        } else {
            newExpanded.add(examId)
        }
        setExpandedExamIds(newExpanded)
    }

    const getExamStats = (examId: string) => {
        const examResults = results.filter(r => r.exam_id === examId)
        const examSubjects = subjects.filter(s => (s as any).exam_id === examId)
        const totalMax = examSubjects.reduce((sum, sub) => sum + sub.max_marks, 0)
        const totalObtained = examResults.reduce((sum, res) => sum + res.marks_obtained, 0)
        const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0
        return { totalMax, totalObtained, percentage, subjectCount: examSubjects.length, resultCount: examResults.length }
    }

    return (
        <div className="space-y-4">
            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading exam data...</div>
            ) : exams.length === 0 ? (
                <Card className="border-none shadow-sm bg-white border border-slate-100 text-center py-12">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                        <p>No exams found in the system.</p>
                    </div>
                </Card>
            ) : (
                exams.map(exam => {
                    const stats = getExamStats(exam.id)
                    const isExpanded = expandedExamIds.has(exam.id)
                    const examSubjects = subjects.filter(s => (s as any).exam_id === exam.id)
                    if (examSubjects.length === 0) return null

                    return (
                        <Card key={exam.id} className="border-none shadow-sm bg-white border border-slate-100 overflow-hidden">
                            <div
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                                onClick={() => toggleExam(exam.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${exam.type === 'Hifz'
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-blue-100 text-blue-600'
                                        }`}>
                                        {exam.type === 'Hifz' ? <BookOpen className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-800">{exam.title}</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span>{format(new Date(exam.start_date), 'MMM d, yyyy')}</span>
                                            <span>•</span>
                                            <span>{examSubjects.length} Subjects</span>
                                            {stats.resultCount > 0 && (
                                                <>
                                                    <span>•</span>
                                                    <span className={stats.percentage >= 40 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                                                        {stats.percentage.toFixed(1)}% Overall
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right hidden sm:block">
                                        <div className="text-sm font-bold text-slate-800">
                                            {stats.totalObtained} <span className="text-slate-400 font-normal">/ {stats.totalMax}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">Total Marks</div>
                                    </div>
                                    {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-2">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                                <TableHead className="w-[50px] text-xs text-slate-500">#</TableHead>
                                                <TableHead className="text-xs text-slate-500">Subject</TableHead>
                                                <TableHead className="text-xs text-right text-slate-500">Max</TableHead>
                                                <TableHead className="text-xs text-right text-slate-500">Min</TableHead>
                                                <TableHead className="text-xs text-right bg-indigo-50 text-indigo-700 font-bold">Obtained</TableHead>
                                                <TableHead className="text-xs text-slate-500">Remarks</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {examSubjects.map((sub, idx) => {
                                                const result = results.find(r => r.subject_id === sub.id)
                                                const hasResult = !!result
                                                const isPass = hasResult ? result.marks_obtained >= sub.min_marks : false

                                                return (
                                                    <TableRow key={sub.id} className="border-b border-slate-100 hover:bg-indigo-50/30">
                                                        <TableCell className="text-xs text-slate-400 font-mono">{(idx + 1).toString().padStart(2, '0')}</TableCell>
                                                        <TableCell className="font-medium text-sm text-slate-800">{sub.name}</TableCell>
                                                        <TableCell className="text-right text-xs text-slate-500">{sub.max_marks}</TableCell>
                                                        <TableCell className="text-right text-xs text-slate-500">{sub.min_marks}</TableCell>
                                                        <TableCell className="text-right font-bold bg-indigo-50/50">
                                                            {hasResult ? (
                                                                <span className={isPass ? "text-emerald-600" : "text-red-500"}>
                                                                    {result.marks_obtained}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400">-</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-slate-500 italic">
                                                            {result?.remarks || "-"}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </Card>
                    )
                })
            )}
        </div>
    )
}
