import { useState, useEffect } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { type Student } from "@/app/admin/students/page"
import { differenceInYears } from "date-fns"
import api from "@/lib/api"
import { getCompletedJuzList, type HifzLog } from "@/lib/hifz-progress"
import { JuzDetailsDialog } from "./juz-details-dialog"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RotateCcw, CheckCircle, UserX, ChevronDown, UserCog, Eye } from "lucide-react"

interface ProfileHeaderProps {
    student: Student
    onMentorChanged?: () => void
    onStatusChanged?: (newStatus: string) => void
    isAdmin?: boolean
}

type StaffOption = { id: string; name: string }

export function ProfileHeader({ student, onMentorChanged, onStatusChanged, isAdmin = true }: ProfileHeaderProps) {
    const [completedJuz, setCompletedJuz] = useState<number[]>([])
    const [loading, setLoading] = useState(true)
    const [currentStatus, setCurrentStatus] = useState(student.status || "active")
    const [staffList, setStaffList] = useState<StaffOption[]>([])
    const [currentMentor, setCurrentMentor] = useState(student.assigned_usthad?.name || null)
    const [changingMentor, setChangingMentor] = useState(false)

    // Transfer Modal State
    const [transferModalOpen, setTransferModalOpen] = useState(false)
    const [transferType, setTransferType] = useState<"completed" | "dropout" | null>(null)
    const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
    const [transferTime, setTransferTime] = useState("12:00")
    const [transferReason, setTransferReason] = useState("")

    // Mentor Modal State
    const [mentorModalOpen, setMentorModalOpen] = useState(false)
    const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null)

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
        if (newStatus === "completed" || newStatus === "dropout") {
            setTransferType(newStatus)
            setTransferDate(new Date().toISOString().split('T')[0])
            setTransferTime("12:00")
            setTransferReason("")
            setTransferModalOpen(true)
            return
        }

        try {
            const res = await api.put(`/students/${student.adm_no}`, { status: newStatus })
            if (res.data.success) {
                setCurrentStatus(newStatus)
                onStatusChanged?.(newStatus)
            }
        } catch (e) { console.error(e) }
    }

    const handleTransferSubmit = async () => {
        if (!transferType) return

        try {
            // Include existing comprehensive details plus the new leaving info
            const comprehensive_details = {
                ...(student.comprehensive_details || {}),
                leaving_date: transferDate,
                leaving_time: transferTime,
                reason_for_leaving: transferReason
            }

            const res = await api.put(`/students/${student.adm_no}`, { 
                status: transferType,
                comprehensive_details 
            })
            
            if (res.data.success) {
                setCurrentStatus(transferType)
                setTransferModalOpen(false)
                onStatusChanged?.(transferType)
            }
        } catch (e) {
            console.error("Failed to transfer student", e)
            alert("Failed to update status")
        }
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

    const openMentorModal = () => {
        // Pre-select current mentor if it exists in staffList
        const currentMentorObj = staffList.find(s => s.name === currentMentor)
        setSelectedMentorId(currentMentorObj ? currentMentorObj.id : "none")
        setMentorModalOpen(true)
    }

    const handleConfirmMentor = () => {
        changeMentor(selectedMentorId === "none" ? null : selectedMentorId)
        setMentorModalOpen(false)
    }

    const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
        active: { label: "Active", bg: "bg-emerald-500/10", text: "text-emerald-400" },
        completed: { label: "Course Completed", bg: "bg-blue-500/10", text: "text-blue-400" },
        dropout: { label: "Dropout", bg: "bg-red-500/10", text: "text-red-400" },
    }
    const sc = statusConfig[currentStatus] || statusConfig.active

    return (
        <div className="relative rounded-[32px] overflow-hidden bg-gradient-to-b from-[#f0f4ff] to-[#e6edff] border border-white shadow-[0_20px_40px_-15px_rgba(59,130,246,0.15)] max-w-sm mx-auto sm:mx-0">
            {/* Top Right Decorative Blur */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-400/20 rounded-full blur-3xl"></div>
            
            {/* Content */}
            <div className="relative p-8 flex flex-col items-center text-center gap-4">
                
                {/* Name & Avatar Frame */}
                <div className="flex flex-col items-center gap-5 w-full">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">{student.name}</h2>
                    
                    <div className="relative group">
                        <div className="absolute -inset-1.5 bg-gradient-to-tr from-blue-400 to-indigo-500 rounded-full blur-sm opacity-30 group-hover:opacity-60 transition duration-500"></div>
                        <div className="relative h-28 w-28 rounded-full border-4 border-white bg-white flex items-center justify-center overflow-hidden shadow-lg">
                            {student.photo_url ? (
                                <img src={student.photo_url} alt={student.name} className="h-full w-full object-cover" />
                            ) : (
                                <span className="text-4xl font-black text-blue-600/50">{student.name.charAt(0)}</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info block */}
                <div className="w-full space-y-1.5 mt-2">
                    <p className="text-slate-500 text-sm font-medium">
                        Admission No. <span className="text-slate-700 font-bold">{student.adm_no}</span>
                    </p>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                        {student.standard || "N/A"} Standard • Batch {student.batch_year || "N/A"}
                    </p>
                    <p className="text-blue-500 text-sm font-bold mt-2">
                        {/* Accurate age calculation */}
                        {student.dob && !isNaN(new Date(student.dob).getTime()) 
                            ? `${differenceInYears(new Date(), new Date(student.dob))} Years Old` 
                            : "Age N/A"}
                    </p>
                </div>

                {/* Badges / Actions Row */}
                <div className="flex flex-wrap items-center justify-center gap-2 w-full mt-4">
                    {/* Status Badge */}
                    {isAdmin ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={`${sc.bg} ${sc.text} border border-current/10 px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer hover:opacity-80 transition flex items-center shadow-sm`}>
                                    {sc.label}
                                    <ChevronDown size={14} className="ml-1 opacity-50" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-44 rounded-2xl">
                                {currentStatus !== "active" && (
                                    <DropdownMenuItem onClick={() => changeStatus("active")} className="text-emerald-600 font-medium">
                                        <RotateCcw className="mr-2 h-4 w-4" /> {currentStatus === "dropout" ? "Re-enroll" : "Set Active"}
                                    </DropdownMenuItem>
                                )}
                                {currentStatus !== "completed" && (
                                    <DropdownMenuItem onClick={() => changeStatus("completed")} className="text-blue-600 font-medium">
                                        <CheckCircle className="mr-2 h-4 w-4" /> Transfer to Alumni
                                    </DropdownMenuItem>
                                )}
                                {currentStatus !== "dropout" && (
                                    <DropdownMenuItem onClick={() => changeStatus("dropout")} className="text-red-600 font-medium">
                                        <UserX className="mr-2 h-4 w-4" /> Transfer to Dropout
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <span className={`${sc.bg} ${sc.text} border border-current/10 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm`}>
                            {sc.label}
                        </span>
                    )}

                    {/* Mentor Badge */}
                    {isAdmin ? (
                        <button 
                            className="bg-white text-slate-600 border border-slate-200 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm hover:bg-slate-50 transition flex items-center gap-1"
                            onClick={openMentorModal}
                        >
                            <UserCog className="h-3 w-3 text-slate-400" />
                            {changingMentor ? "Updating..." : currentMentor || "No Mentor"}
                        </button>
                    ) : (
                        <span className="bg-white text-slate-600 border border-slate-200 px-4 py-1.5 rounded-full text-xs font-bold shadow-sm flex items-center gap-1">
                            <UserCog className="h-3 w-3 text-slate-400" />
                            {currentMentor || "No Mentor"}
                        </span>
                    )}
                </div>

                {/* Additional Action Row */}
                <div className="flex gap-2 w-full mt-2">
                    {isAdmin && (
                        <Link href={`/admin/students/${student.adm_no}`} className="flex-1">
                            <Button variant="default" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 shadow-md shadow-blue-500/20 font-bold tracking-wide">
                                <Eye className="h-4 w-4 mr-2" />
                                VIEW FULL PROFILE
                            </Button>
                        </Link>
                    )}
                </div>
                
                {/* Juz Details Trigger centered below */}
                {!loading && (
                    <div className="mt-1 w-full flex justify-center">
                         <JuzDetailsDialog
                              completedJuz={completedJuz}
                              studentName={student.name}
                         />
                    </div>
                )}
            </div>

            {/* Transfer Dialog */}
            <Dialog open={transferModalOpen} onOpenChange={setTransferModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Transfer to {transferType === 'completed' ? 'Alumni' : 'Dropout'}</DialogTitle>
                        <DialogDescription>
                            Please provide the details for transferring this student out of the active list.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input 
                                    type="date" 
                                    value={transferDate} 
                                    onChange={(e) => setTransferDate(e.target.value)} 
                                />
                            </div>
                            {transferType === 'dropout' && (
                                <div className="space-y-2">
                                    <Label>Time</Label>
                                    <Input 
                                        type="time" 
                                        value={transferTime} 
                                        onChange={(e) => setTransferTime(e.target.value)} 
                                    />
                                </div>
                            )}
                        </div>
                        
                        {transferType === 'dropout' && (
                            <div className="space-y-2">
                                <Label>Reason for Dropout</Label>
                                <Textarea 
                                    placeholder="Enter the reason why the student is dropping out..."
                                    value={transferReason}
                                    onChange={(e) => setTransferReason(e.target.value)}
                                    className="resize-none"
                                />
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTransferModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleTransferSubmit} className={transferType === 'dropout' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}>
                            Confirm Transfer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Mentor Dialog */}
            <Dialog open={mentorModalOpen} onOpenChange={setMentorModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Assign Mentor</DialogTitle>
                        <DialogDescription>
                            Select a faculty member to be the mentor for {student.name}.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select Mentor</Label>
                            <Select 
                                value={selectedMentorId || "none"} 
                                onValueChange={(val) => setSelectedMentorId(val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a mentor..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none" className="text-red-500 font-medium">Unassign Mentor</SelectItem>
                                    {staffList.map(s => (
                                        <SelectItem key={s.id} value={s.id} className="font-medium text-slate-700">
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setMentorModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleConfirmMentor} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6">
                            Confirm Mentor
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
