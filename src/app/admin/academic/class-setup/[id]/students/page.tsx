"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RefreshCw, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

type ClassInfo = {
    id: string
    name: string
    type: "School" | "Madrassa" | "Hifz"
    standard?: string | null
    section?: string | null
}

type StudentRow = {
    id: string
    student_id: string
    student_name: string
    adm_no: string
    photo_url?: string | null
    standard?: string | null
    section?: string | null
    group_name?: string | null
}

export default function ClassStudentsPage({ params }: { params: { id: string } }) {
    const { toast } = useToast()
    const [classInfo, setClassInfo] = useState<ClassInfo | null>(null)
    const [students, setStudents] = useState<StudentRow[]>([])
    const [loading, setLoading] = useState(true)

    async function loadStudents() {
        setLoading(true)
        try {
            const res = await api.get(`/classes/${params.id}/students`)
            setClassInfo(res.data?.class || null)
            setStudents(res.data?.data || [])
        } catch (err: any) {
            toast({
                title: "Failed to load students",
                description: err?.response?.data?.error || err.message,
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadStudents()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.id])

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                        <Button asChild variant="outline" size="icon">
                            <Link href="/admin/academic/class-setup">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
                                {classInfo?.type === "Madrassa" ? "Madrasa" : classInfo?.type || "Class"}
                            </p>
                            <h1 className="mt-1 text-2xl font-black text-slate-950">
                                {classInfo?.name || "Class Students"}
                            </h1>
                            <p className="mt-1 text-sm font-medium text-slate-500">
                                Students enrolled through the academic-year history layer.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={loadStudents}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-slate-600" />
                        <h2 className="font-black text-slate-950">Enrolled Students</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                        {students.length}
                    </span>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-sm font-bold text-slate-400">Loading students...</div>
                ) : students.length === 0 ? (
                    <div className="p-10 text-center text-sm font-bold text-slate-400">
                        No students are enrolled in this class yet.
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {students.map((student) => (
                            <div key={`${student.student_id}-${student.id}`} className="flex items-center justify-between gap-4 p-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                                        {(student.student_name || student.adm_no || "?").slice(0, 2).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-black text-slate-950">{student.student_name}</p>
                                        <p className="text-xs font-semibold text-slate-500">{student.adm_no || student.student_id}</p>
                                    </div>
                                </div>
                                <div className="text-right text-xs font-bold text-slate-500">
                                    {classInfo?.type === "Hifz"
                                        ? student.group_name || classInfo.name
                                        : [student.standard, student.section].filter(Boolean).join(" ")}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    )
}
