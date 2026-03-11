import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Student } from "@/app/admin/students/page"
import { differenceInYears } from "date-fns"
import api from "@/lib/api"
import { getCompletedJuzList, type HifzLog } from "@/lib/hifz-progress"
import { JuzDetailsDialog } from "./juz-details-dialog"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, RotateCcw, CheckCircle, UserX, ChevronDown, UserCog } from "lucide-react"

interface ProfileHeaderProps {
    student: Student
    onMentorChanged?: () => void
    isAdmin?: boolean
}

type StaffOption = { id: string; name: string }

export function ProfileHeader({ student, onMentorChanged, isAdmin = true }: ProfileHeaderProps) {
    const [completedJuz, setCompletedJuz] = useState<number[]>([])
    const [loading, setLoading] = useState(true)
    const [currentStatus, setCurrentStatus] = useState(student.status || "active")
    const [staffList, setStaffList] = useState<StaffOption[]>([])
    const [currentMentor, setCurrentMentor] = useState(student.assigned_usthad?.name || null)
    const [changingMentor, setChangingMentor] = useState(false)

    useEffect(() => {
        setCurrentStatus(student.status || "active")
        setCurrentMentor(student.assigned_usthad?.name || null)
    }, [student.status, student.assigned_usthad])

    useEffect(() => {
        if (!isAdmin) return
        async function fetchStaff() {
            try {
                const res = await api.get('/staff')
                if (res.data.success) setStaffList(res.data.staff || [])
            } catch (e) { console.error(e) }
        }
        fetchStaff()
    }, [isAdmin])

    useEffect(() => {
        async function fetchProgress() {
            if (!student?.adm_no) return
            try {
                const res = await api.get('/hifz/logs', { params: { student_id: student.adm_no, mode: 'New Verses' } })
                if (res.data.success) {
                    const logs = res.data.logs as unknown as HifzLog[]
                    const completed = getCompletedJuzList(logs)
                    setCompletedJuz(completed)
                }
            } catch (e) { console.error(e) }
            setLoading(false)
        }
        fetchProgress()
    }, [student.adm_no])

    const changeStatus = async (newStatus: string) => {
        try {
            const res = await api.put(`/students/${student.adm_no}`, { status: newStatus })
            if (res.data.success) setCurrentStatus(newStatus)
        } catch (e) { console.error(e) }
    }

    const changeMentor = async (staffId: string | null) => {
        setChangingMentor(true)
        try {
            const res = await api.put(`/students/${student.adm_no}`, { assigned_usthad_id: staffId })
            if (res.data.success) {
                const mentor = staffList.find(s => s.id === staffId)
                setCurrentMentor(mentor?.name || null)
                onMentorChanged?.()
            } else {
                alert("Failed to change mentor")
            }
        } catch (e: any) {
            alert("Failed to change mentor: " + e.message)
        }
        setChangingMentor(false)
    }

    const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
        active: { label: "Active", bg: "bg-emerald-500/10", text: "text-emerald-400" },
        completed: { label: "Course Completed", bg: "bg-blue-500/10", text: "text-blue-400" },
        dropout: { label: "Dropout", bg: "bg-red-500/10", text: "text-red-400" },
    }
    const sc = statusConfig[currentStatus] || statusConfig.active

    return (
        <div className="relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900/50" />

            {/* Content */}
            <div className="relative p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar */}
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur opacity-50 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative h-24 w-24 rounded-full border-4 border-slate-900 bg-slate-800 flex items-center justify-center overflow-hidden">
                        {student.photo_url ? (
                            <img src={student.photo_url} alt={student.name} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-3xl font-bold text-slate-400">{student.name.charAt(0)}</span>
                        )}
                    </div>
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">{student.name}</h2>
                            <div className="flex items-center justify-center sm:justify-start gap-3 mt-1 text-slate-400 text-sm">
                                <span className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {student.standard || "N/A"} Standard
                                </span>
                                <span className="h-1 w-1 rounded-full bg-slate-700" />
                                <span>ID: {student.adm_no}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {student.batch_year && (
                                <Badge variant="outline" className="border-slate-700 text-slate-300 bg-slate-800/50">
                                    Batch {student.batch_year}
                                </Badge>
                            )}

                            {/* Status Badge */}
                            {isAdmin ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className={`${sc.bg} ${sc.text} border border-current/20 px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition flex items-center gap-1`}>
                                            {sc.label}
                                            <MoreHorizontal size={10} />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        {currentStatus !== "active" && (
                                            <DropdownMenuItem onClick={() => changeStatus("active")} className="text-emerald-400">
                                                <RotateCcw className="mr-2 h-3 w-3" /> {currentStatus === "dropout" ? "Re-enroll" : "Set Active"}
                                            </DropdownMenuItem>
                                        )}
                                        {currentStatus !== "completed" && (
                                            <DropdownMenuItem onClick={() => changeStatus("completed")} className="text-blue-400">
                                                <CheckCircle className="mr-2 h-3 w-3" /> Mark Completed
                                            </DropdownMenuItem>
                                        )}
                                        {currentStatus !== "dropout" && (
                                            <DropdownMenuItem onClick={() => changeStatus("dropout")} className="text-red-400">
                                                <UserX className="mr-2 h-3 w-3" /> Mark Dropout
                                            </DropdownMenuItem>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <span className={`${sc.bg} ${sc.text} border border-current/20 px-2 py-0.5 rounded-full text-xs font-medium`}>
                                    {sc.label}
                                </span>
                            )}

                            {!loading && (
                                <JuzDetailsDialog
                                    completedJuz={completedJuz}
                                    studentName={student.name}
                                />
                            )}
                        </div>
                    </div>

                    <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 text-sm text-slate-400">
                        {/* Mentor */}
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500">Mentor:</span>
                            {isAdmin ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center gap-1 text-slate-200 font-medium hover:text-emerald-400 transition-colors cursor-pointer">
                                            <UserCog className="h-3.5 w-3.5" />
                                            {changingMentor ? "Updating..." : currentMentor || "Unassigned"}
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                                        <DropdownMenuLabel className="text-xs text-slate-500">Change Mentor</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={() => changeMentor(null)} className="text-slate-400">
                                            Unassign Mentor
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        {staffList.map(s => (
                                            <DropdownMenuItem key={s.id} onClick={() => changeMentor(s.id)}>
                                                {s.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : (
                                <span className="text-slate-200 font-medium flex items-center gap-1">
                                    <UserCog className="h-3.5 w-3.5" />
                                    {currentMentor || "Unassigned"}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-500">Age:</span>
                            <span className="text-slate-200 font-medium">
                                {/* Accurate age calculation */}
                                {differenceInYears(new Date(), new Date(student.dob))} Years
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
