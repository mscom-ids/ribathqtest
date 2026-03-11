"use client"

import { useEffect, useState, use } from "react"
import Link from "next/link"
import { Plus, Calendar, BookOpen, GraduationCap, ChevronRight, TrendingUp, Users } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"

type Exam = {
    id: string
    title: string
    department: "School" | "Hifz" | "Madrassa"
    start_date: string
    end_date: string | null
    is_active: boolean
    created_at: string
}

export default function ExamsPage({ params }: { params: Promise<{ department: string }> }) {
    const { department } = use(params);
    const departmentName = department.charAt(0).toUpperCase() + department.slice(1);

    const [exams, setExams] = useState<Exam[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadExams()
    }, [departmentName])

    async function loadExams() {
        setLoading(true)
        try {
            const res = await api.get('/exams', { params: { department: departmentName } });
            if (res.data.success) {
                setExams(res.data.exams)
            }
        } catch (error) {
            console.error(error)
        }
        setLoading(false)
    }

    const activeExams = exams.filter(e => e.is_active)
    const completedExams = exams.filter(e => !e.is_active)

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                        {departmentName} Examinations
                    </h1>
                    <p className="text-muted-foreground mt-1">Manage {departmentName.toLowerCase()} examinations</p>
                </div>
                <Link href={`/admin/${department}/exams/create`}>
                    <Button size="lg" className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/30">
                        <Plus className="mr-2 h-5 w-5" /> Create New Exam
                    </Button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-none shadow-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Total Exams</p>
                                <h3 className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-2">{exams.length}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                                <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Active Exams</p>
                                <h3 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mt-2">{activeExams.length}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-lg bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Completed</p>
                                <h3 className="text-3xl font-bold text-purple-900 dark:text-purple-100 mt-2">{completedExams.length}</h3>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                                <Users className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Active Exams Section */}
            {activeExams.length > 0 && (
                <div>
                    <h2 className="text-2xl font-semibold mb-4 text-slate-800 dark:text-slate-200">Active Examinations</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {activeExams.map((exam) => (
                            <Card key={exam.id} className="border-none shadow-lg hover:shadow-xl transition-all duration-300 bg-white dark:bg-slate-900 group cursor-pointer">
                                <Link href={`/admin/${department}/exams/${exam.id}`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={exam.department === "Hifz"
                                                            ? "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
                                                            : "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300"
                                                        }
                                                    >
                                                        {exam.department === "Hifz" ? <BookOpen className="w-3 h-3 mr-1" /> : <GraduationCap className="w-3 h-3 mr-1" />}
                                                        {exam.department}
                                                    </Badge>
                                                    <Badge className="bg-emerald-500 text-white">Active</Badge>
                                                </div>
                                                <CardTitle className="text-xl group-hover:text-emerald-600 transition-colors">{exam.title}</CardTitle>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Calendar className="w-4 h-4" />
                                            <span>Starts {format(new Date(exam.start_date), "MMM d, yyyy")}</span>
                                        </div>
                                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                Created {format(new Date(exam.created_at), "MMM d, yyyy")}
                                            </span>
                                            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                                Manage →
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Link>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Completed Exams Section */}
            {completedExams.length > 0 && (
                <div>
                    <h2 className="text-2xl font-semibold mb-4 text-slate-800 dark:text-slate-200">Completed Examinations</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {completedExams.map((exam) => (
                            <Card key={exam.id} className="border-none shadow-md hover:shadow-lg transition-all duration-300 bg-slate-50 dark:bg-slate-900/50 group cursor-pointer opacity-75 hover:opacity-100">
                                <Link href={`/admin/${department}/exams/${exam.id}`}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={exam.department === "Hifz"
                                                            ? "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
                                                            : "border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300"
                                                        }
                                                    >
                                                        {exam.department === "Hifz" ? <BookOpen className="w-3 h-3 mr-1" /> : <GraduationCap className="w-3 h-3 mr-1" />}
                                                        {exam.department}
                                                    </Badge>
                                                    <Badge variant="secondary">Closed</Badge>
                                                </div>
                                                <CardTitle className="text-xl">{exam.title}</CardTitle>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <Calendar className="w-4 h-4" />
                                            <span>{format(new Date(exam.start_date), "MMM d, yyyy")}</span>
                                        </div>
                                    </CardContent>
                                </Link>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {loading && (
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
                        <p className="mt-4 text-muted-foreground">Loading examinations...</p>
                    </div>
                </div>
            )}

            {!loading && exams.length === 0 && (
                <Card className="border-dashed border-2 border-slate-300 dark:border-slate-700">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <div className="h-20 w-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                            <GraduationCap className="h-10 w-10 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No examinations yet</h3>
                        <p className="text-muted-foreground mb-6">Get started by creating your first exam</p>
                        <Link href={`/admin/${department}/exams/create`}>
                            <Button className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700">
                                <Plus className="mr-2 h-4 w-4" /> Create Exam
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
