"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, ClipboardList, Book, Calendar, Shield, Hash, Search, BookOpen } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/auth"

type Exam = {
    id: string
    title: string
    department: string
    start_date: string
    is_active: boolean
}

type Subject = {
    id: string
    name: string
    max_marks: number
    min_marks: number
    standard?: string | null
}

export default function ExamDetailsPage({ params }: { params: Promise<{ id: string, department: string }> }) {
    const { id, department } = use(params)
    const router = useRouter()

    const [exam, setExam] = useState<Exam | null>(null)
    const [subjects, setSubjects] = useState<Subject[]>([])
    const [loading, setLoading] = useState(true)

    // New Subject Form
    const [newSubjectName, setNewSubjectName] = useState("")
    const [newSubjectMax, setNewSubjectMax] = useState(100)
    const [newSubjectStandard, setNewSubjectStandard] = useState<string>("All")
    const [addingSubject, setAddingSubject] = useState(false)

    useEffect(() => {
        loadData()
    }, [id])

    async function loadData() {
        setLoading(true)
        // Load Exam
        const { data: e } = await supabase.from("exams").select("*").eq("id", id).single()
        if (e) setExam(e)

        // Load Subjects
        const { data: s } = await supabase.from("exam_subjects").select("*").eq("exam_id", id).order("created_at")
        if (s) setSubjects(s as any)

        setLoading(false)
    }

    async function handleAddSubject() {
        if (!newSubjectName) return
        setAddingSubject(true)

        const { error } = await supabase.from("exam_subjects").insert({
            exam_id: id,
            name: newSubjectName,
            max_marks: newSubjectMax,
            min_marks: Math.round(newSubjectMax * 0.4), // Default 40% pass
            standard: newSubjectStandard === "All" ? null : newSubjectStandard
        })

        if (error) {
            alert(error.message)
        } else {
            setNewSubjectName("")
            setNewSubjectMax(100)
            loadData()
        }
        setAddingSubject(false)
    }

    async function handleDeleteSubject(subjectId: string) {
        if (!confirm("Are you sure? This will delete all marks for this subject.")) return

        const { error } = await supabase.from("exam_subjects").delete().eq("id", subjectId)
        if (error) {
            alert(error.message)
        } else {
            loadData()
        }
    }

    async function toggleStatus(isActive: boolean) {
        const action = isActive ? "Reopen" : "Complete";
        if (!confirm(`Are you sure you want to ${action} this exam?`)) return

        const { error } = await supabase
            .from("exams")
            .update({ is_active: isActive })
            .eq("id", id)

        if (error) {
            alert("Failed to update status: " + error.message)
        } else {
            loadData()
        }
    }

    if (loading && !exam) return <div className="p-8 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
    if (!exam) return <div className="p-8">Exam not found</div>

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            {/* Elegant Header Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8 shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Book className="w-64 h-64" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row justify-between gap-6">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Link href={`/admin/${department}/exams`}>
                                <Button variant="ghost" size="sm" className="text-slate-300 hover:text-white hover:bg-white/10 -ml-2">
                                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Exams
                                </Button>
                            </Link>
                        </div>

                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <Badge variant="outline" className="bg-white/10 text-white border-none hover:bg-white/20">
                                    {exam.department}
                                </Badge>
                                <Badge variant="secondary" className={exam.is_active ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-slate-500"}>
                                    {exam.is_active ? "Active" : "Closed"}
                                </Badge>
                            </div>
                            <h1 className="text-4xl font-bold tracking-tight">{exam.title}</h1>
                            <div className="flex items-center gap-6 mt-4 text-slate-300">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>Starts {format(new Date(exam.start_date), "MMM d, yyyy")}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Shield className="w-4 h-4" />
                                    <span>Administrator View</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-end justify-end gap-3">
                        <div className="flex gap-2">
                            {exam.is_active ? (
                                <Button
                                    onClick={() => toggleStatus(false)}
                                    variant="outline"
                                    className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
                                >
                                    Complete Exam
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => toggleStatus(true)}
                                    variant="outline"
                                    className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
                                >
                                    Reopen Exam
                                </Button>
                            )}

                            <Link href={`/admin/${department}/exams/${id}/marks`}>
                                <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 shadow-lg border-none text-base font-semibold px-8">
                                    <ClipboardList className="mr-2 h-5 w-5 text-emerald-600" />
                                    Enter Marks
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Quick Stats / Info (Could be added here, expanding for layout balance) */}
                <div className="lg:col-span-3">
                    <Card className="border-none shadow-lg overflow-hidden bg-white dark:bg-slate-950">
                        <CardHeader className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 sticky top-0 z-10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                                        <Book className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                            Subjects & Syllabus
                                        </CardTitle>
                                        <CardDescription className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                                            Manage exam subjects
                                        </CardDescription>
                                    </div>
                                </div>
                                <div className="text-xs font-medium px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    Total: <span className="text-slate-900 dark:text-white ml-1">{subjects.length}</span>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            {/* Add Subject Section */}
                            <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                                    <div className="md:col-span-6 space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subject Name</Label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                                <Book className="h-4 w-4 text-slate-400" />
                                            </div>
                                            <Input
                                                placeholder="e.g. Mathematics"
                                                value={newSubjectName}
                                                onChange={e => setNewSubjectName(e.target.value)}
                                                className="pl-9 bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:border-emerald-500 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="md:col-span-3 space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Standard</Label>
                                        <Select value={newSubjectStandard} onValueChange={setNewSubjectStandard}>
                                            <SelectTrigger className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="All">All Standards</SelectItem>
                                                {["5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"].map(std => (
                                                    <SelectItem key={std} value={std}>{std}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Max Marks</Label>
                                        <Input
                                            type="number"
                                            value={newSubjectMax}
                                            onChange={e => setNewSubjectMax(parseInt(e.target.value) || 0)}
                                            className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                                        />
                                    </div>

                                    <div className="md:col-span-1">
                                        <Button
                                            onClick={handleAddSubject}
                                            disabled={!newSubjectName || addingSubject}
                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                                        >
                                            {addingSubject ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Plus className="w-5 h-5" />}
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Subjects Table */}
                            <div className="overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900">
                                            <TableHead className="pl-6 w-16 text-xs font-bold text-slate-500 uppercase">#</TableHead>
                                            <TableHead className="text-xs font-bold text-slate-500 uppercase">Subject Name</TableHead>
                                            <TableHead className="text-xs font-bold text-slate-500 uppercase">Standard</TableHead>
                                            <TableHead className="text-xs font-bold text-slate-500 uppercase">Marks Config</TableHead>
                                            <TableHead className="text-right pr-6 w-20"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {subjects.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center py-16">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                                                            <BookOpen className="h-6 w-6 text-slate-300" />
                                                        </div>
                                                        <p className="text-slate-500 font-medium">No subjects added yet</p>
                                                        <p className="text-slate-400 text-sm">Add one above to get started</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ) : subjects.map((subject, index) => (
                                            <TableRow key={subject.id} className="group transition-all hover:bg-slate-50 dark:hover:bg-slate-900 border-b border-slate-100 dark:border-slate-800/50">
                                                <TableCell className="pl-6 font-medium text-slate-400">
                                                    {(index + 1).toString().padStart(2, '0')}
                                                </TableCell>
                                                <TableCell className="font-semibold text-slate-700 dark:text-slate-200">
                                                    {subject.name}
                                                </TableCell>
                                                <TableCell>
                                                    {subject.standard ? (
                                                        <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-900/50 px-2 py-0.5 rounded-md font-normal">
                                                            {subject.standard} Std
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md font-normal hover:bg-slate-200">
                                                            Common
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-3 text-sm">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Max</span>
                                                            <span className="font-bold text-slate-700 dark:text-slate-300">{subject.max_marks}</span>
                                                        </div>
                                                        <div className="h-6 w-px bg-slate-100 dark:bg-slate-800"></div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Min</span>
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{subject.min_marks}</span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                        onClick={() => handleDeleteSubject(subject.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
