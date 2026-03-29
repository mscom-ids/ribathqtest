"use client"

import { useEffect, useState } from "react"
import { Users, BookOpen, ChevronRight, UserCheck, AlertCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import api from "@/lib/api"
import { toast } from "sonner"

type Assignment = {
    id: string
    from_staff_id: string
    original_mentor_name: string
    original_mentor_photo: string | null
    student_id: string | null
    student_name: string | null
    reason: string | null
    student_count: number
    created_at: string
}

export default function AssignedStudentsPage() {
    const [assignments, setAssignments] = useState<Assignment[]>([])
    const [loading, setLoading] = useState(true)

    const getPhotoUrl = (url: string | null | undefined) => {
        if (!url) return undefined;
        return url.startsWith('http') ? url : `http://localhost:5000${url}`;
    }

    useEffect(() => {
        loadAssignments()
    }, [])

    const loadAssignments = async () => {
        setLoading(true)
        try {
            const res = await api.get('/delegations/assigned-to-me')
            if (res.data.success) {
                setAssignments(res.data.assignments)
            }
        } catch (e) {
            console.error("Error loading assignments:", e)
            toast.error("Failed to load assigned students")
        } finally {
            setLoading(false)
        }
    }
    const enterDelegationMode = async (assignment: Assignment) => {
        try {
            // Request a server-issued delegation token
            const res = await api.post('/delegations/token', {
                delegationId: assignment.id,
                targetStaffId: assignment.from_staff_id,
                studentId: assignment.student_id || undefined
            })
            if (res.data.success && res.data.delegationToken) {
                // Store server-issued token in sessionStorage (cleared on tab close)
                sessionStorage.setItem('delegationToken', res.data.delegationToken)
                sessionStorage.setItem('delegationMentorName', assignment.original_mentor_name)
                if (assignment.student_name) {
                    sessionStorage.setItem('delegationStudentName', assignment.student_name)
                } else {
                    sessionStorage.removeItem('delegationStudentName')
                }
                toast.success(`Now managing ${assignment.student_name || 'students'} for ${assignment.original_mentor_name}`)
                window.location.href = "/staff"
            } else {
                toast.error(res.data.error || "Failed to enter delegation mode")
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Failed to enter delegation mode. Delegation may be expired or revoked.")
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Assigned Mentor's Students</h1>
                <p className="text-slate-500 dark:text-slate-400">
                    Manage students assigned to you by other mentors. Entering management mode will allow you to mark attendance and approve leaves as if you were that mentor.
                </p>
            </div>

            {assignments.length === 0 ? (
                <Card className="border-dashed shadow-none">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                            <Users className="h-6 w-6 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium">No students assigned to you</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-[300px]">
                            When another mentor requests you to manage their students and admin approves, they will appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {assignments.map((assignment) => (
                        <Card key={assignment.id} className="overflow-hidden hover:shadow-md transition-shadow">
                            <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 pb-4">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={getPhotoUrl(assignment.original_mentor_photo)} className="object-cover" />
                                        <AvatarFallback className="bg-blue-100 text-blue-600 font-bold">
                                            {assignment.original_mentor_name?.substring(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <CardTitle className="text-lg">{assignment.original_mentor_name}</CardTitle>
                                        <CardDescription className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                                            {assignment.student_name ? (
                                                <>
                                                    <UserCheck className="h-3 w-3" />
                                                    Managing: {assignment.student_name}
                                                </>
                                            ) : (
                                                <>
                                                    <Users className="h-3 w-3" />
                                                    {assignment.student_count} Students
                                                </>
                                            )}
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                {assignment.reason && (
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg flex gap-2">
                                        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                                        <p className="text-xs text-blue-800 dark:text-blue-200">
                                            <span className="font-semibold block mb-0.5">Reason:</span>
                                            {assignment.reason}
                                        </p>
                                    </div>
                                )}
                                <Button 
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2"
                                    onClick={() => enterDelegationMode(assignment)}
                                >
                                    <UserCheck className="h-4 w-4" />
                                    Manage Students
                                    <ChevronRight className="h-4 w-4 ml-auto opacity-50" />
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
