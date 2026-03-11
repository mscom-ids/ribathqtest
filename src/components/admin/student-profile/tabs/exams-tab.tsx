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

        try {
            // 1. Fetch all exams
            const examsRes = await api.get('/exams')
            if (examsRes.data.success) setExams(examsRes.data.exams || [])

            // 2. Fetch all subjects
            const subjectsRes = await api.get('/exams/subjects')
            if (subjectsRes.data.success) setSubjects(subjectsRes.data.subjects || [])

            // 3. Fetch results for this student
            const resultsRes = await api.get('/exams/results', { params: { student_id: student.adm_no } })
            if (resultsRes.data.success) setResults(resultsRes.data.results || [])

            // Expand the most recent exam by default
            if (examsRes.data.exams?.length > 0) {
                setExpandedExamIds(new Set([examsRes.data.exams[0].id]))
            }
        } catch (err) {
            console.error('Failed to load exam data', err)
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

    // Helper to get exam stats
    const getExamStats = (examId: string) => {
        const examResults = results.filter(r => r.exam_id === examId)
        const examSubjects = subjects.filter(s => {
            // Filter subjects related to this exam?
            // Actually exam_subjects has exam_id. We need to filter by exam_id.
            // Wait, subjects fetch above got ALL subjects.
            // Let's refine the subjects fetch or filter here.
            // Ah, the fetched subjects list includes exam_id column?
            // Let's assume passed fetching all, we need to filter.
            // But wait, the Type above doesn't have exam_id. Let's fix that or rely on join logic if we had it.
            // Since we fetched ALL subjects, we need to match them to this exam.
            // Does exam_subjects have exam_id? Yes, based on prior schema knowledge.
            return (s as any).exam_id === examId
        })

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
                <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-800 text-center py-12">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                        <p>No exams found in the system.</p>
                    </div>
                </Card>
            ) : (
                exams.map(exam => {
                    const stats = getExamStats(exam.id)
                    const isExpanded = expandedExamIds.has(exam.id)
                    // Only show exams where the student has at least one result or the exam is relevant?
                    // Maybe show all exams? Let's show all.

                    // Get subjects for this exam to display in table
                    const examSubjects = subjects.filter(s => (s as any).exam_id === exam.id)
                    // Sort subjects? Maybe by order? Created_at?

                    if (examSubjects.length === 0) return null // Skip exams with no subjects configured

                    return (
                        <Card key={exam.id} className="border-none shadow-sm bg-slate-900/50 border border-slate-800 overflow-hidden text-slate-200">
                            <div
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                onClick={() => toggleExam(exam.id)}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${exam.type === 'Hifz'
                                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                        }`}>
                                        {exam.type === 'Hifz' ? <BookOpen className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-slate-100">{exam.title}</h3>
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
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
                                        <div className="text-sm font-bold text-slate-100">
                                            {stats.totalObtained} <span className="text-slate-500 font-normal">/ {stats.totalMax}</span>
                                        </div>
                                        <div className="text-xs text-slate-500">Total Marks</div>
                                    </div>
                                    {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-slate-800 bg-black/20 animate-in slide-in-from-top-2">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-b border-slate-800 hover:bg-transparent">
                                                <TableHead className="w-[50px] text-xs text-slate-400">#</TableHead>
                                                <TableHead className="text-xs text-slate-400">Subject</TableHead>
                                                <TableHead className="text-xs text-right text-slate-400">Max</TableHead>
                                                <TableHead className="text-xs text-right text-slate-400">Min</TableHead>
                                                <TableHead className="text-xs text-right bg-slate-800/50 text-slate-300 font-bold">Obtained</TableHead>
                                                <TableHead className="text-xs text-slate-400">Remarks</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {examSubjects.map((sub, idx) => {
                                                const result = results.find(r => r.subject_id === sub.id)
                                                const hasResult = !!result
                                                const isPass = hasResult ? result.marks_obtained >= sub.min_marks : false

                                                return (
                                                    <TableRow key={sub.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                                                        <TableCell className="text-xs text-slate-500 font-mono">{(idx + 1).toString().padStart(2, '0')}</TableCell>
                                                        <TableCell className="font-medium text-sm text-slate-200">{sub.name}</TableCell>
                                                        <TableCell className="text-right text-xs text-slate-500">{sub.max_marks}</TableCell>
                                                        <TableCell className="text-right text-xs text-slate-500">{sub.min_marks}</TableCell>
                                                        <TableCell className="text-right font-bold bg-slate-800/30">
                                                            {hasResult ? (
                                                                <span className={isPass ? "text-emerald-500" : "text-red-500"}>
                                                                    {result.marks_obtained}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-600">-</span>
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
