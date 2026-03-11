"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Plus } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import api from "@/lib/api"
import { StudentProfileView } from "@/components/admin/student-profile/student-profile-view"
import type { Student } from "@/app/admin/students/page"

export default function StaffStudentProfilePage() {
    const params = useParams()
    const router = useRouter()
    const studentId = params.id as string

    const [student, setStudent] = useState<Student | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadStudent() {
            if (!studentId) return

            setLoading(true)
            try {
                // 1. Fetch Student Details
                const studentRes = await api.get(`/students/${studentId}`)
                if (!studentRes.data.success) {
                    router.push("/staff")
                    return
                }
                const studentData = studentRes.data.student

                // 2. Fetch Hifz Logs for Progress Calculation (Unique Juz covered)
                const logsRes = await api.get('/hifz/logs', {
                    params: { student_id: studentId, mode: 'Juz Revision' }
                })

                const completedJuz = new Set<number>()
                if (logsRes.data.success && logsRes.data.logs) {
                    logsRes.data.logs.forEach((log: any) => {
                        if (log.juz_number) completedJuz.add(log.juz_number)
                    })
                }

                setStudent({ ...studentData, progress: completedJuz.size } as unknown as Student)
            } catch (error) {
                console.error("Error loading profile:", error)
                router.push("/staff")
            } finally {
                setLoading(false)
            }
        }

        loadStudent()
    }, [studentId, router])

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent mx-auto mb-4"></div>
                    <p className="text-slate-500">Loading student profile...</p>
                </div>
            </div>
        )
    }

    if (!student) {
        return (
            <div className="flex h-screen items-center justify-center">
                <p className="text-slate-500">Student not found.</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 pb-20">
            {/* Header / Navigation */}
            <div className="mb-6 flex items-center justify-between">
                <Button variant="ghost" className="gap-2" onClick={() => router.push("/staff")}>
                    <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                </Button>

                <Link href={`/staff/entry/${studentId}`}>
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg gap-2">
                        <Plus className="h-4 w-4" /> Record New Entry
                    </Button>
                </Link>
            </div>

            {/* Reused Profile View */}
            <StudentProfileView student={student} />
        </div>
    )
}
