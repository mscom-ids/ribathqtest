"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { StudentDetailView } from "@/app/admin/students/[id]/StudentDetailView"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import api from "@/lib/api"
import type { Student } from "@/app/admin/students/page"

export default function StaffStudentProfilePage() {
    const params = useParams()
    const studentId = params.id as string
    const searchParams = useSearchParams()

    const [student, setStudent] = useState<Student | null>(null)
    const [registerOpen, setRegisterOpen] = useState(false)

    useEffect(() => {
        if (searchParams.get("register") === "1") setRegisterOpen(true)
    }, [searchParams])

    useEffect(() => {
        async function loadStudent() {
            if (!studentId) return
            try {
                const res = await api.get(`/students/${studentId}`)
                if (res.data.success) setStudent(res.data.student as Student)
            } catch (error) {
                console.error("Error loading profile:", error)
            }
        }
        loadStudent()
    }, [studentId])

    return (
        <>
            <div className="fixed bottom-6 right-6 z-40">
                <Button onClick={() => setRegisterOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg gap-2">
                    Open Hifz register
                </Button>
            </div>
            <StudentDetailView canEdit={false} backTo="/staff" />
            {student && (
                <HifzMonthlyRegister
                    open={registerOpen}
                    onClose={() => setRegisterOpen(false)}
                    student={student}
                />
            )}
        </>
    )
}
