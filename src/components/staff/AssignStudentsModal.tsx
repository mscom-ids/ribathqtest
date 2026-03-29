import { useState, useEffect } from "react"
import { Users, Send, AlertCircle, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import api from "@/lib/api"
import { toast } from "sonner"

type Student = {
    adm_no: string
    name: string
}

export function AssignStudentsModal({ 
    currentStaffId, 
    studentId, 
    studentName, 
    students = [], 
    trigger 
}: { 
    currentStaffId: string, 
    studentId?: string, 
    studentName?: string, 
    students?: Student[],
    trigger?: React.ReactNode 
}) {
    const [open, setOpen] = useState(false)
    const [staffList, setStaffList] = useState<{ id: string, name: string, photo_url: string | null }[]>([])
    const [selectedStaff, setSelectedStaff] = useState<string>("")
    const [reason, setReason] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isRevoking, setIsRevoking] = useState(false)
    const [pendingRequest, setPendingRequest] = useState<{ id: string, to_mentor_name: string, status: string } | null>(null)
    
    const [assignMode, setAssignMode] = useState<'class' | 'students'>(studentId ? 'students' : 'class')
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(studentId ? [studentId] : [])
    const [studentSearch, setStudentSearch] = useState("")

    useEffect(() => {
        if (open) {
            loadStaff()
            loadMyRequests()
            if (studentId) {
                setAssignMode('students')
                setSelectedStudentIds([studentId])
            }
        }
    }, [open])

    const loadStaff = async () => {
        try {
            const res = await api.get('/staff')
            if (res.data.success) {
                // Filter out self
                setStaffList(res.data.staff.filter((s: any) => s.id !== currentStaffId))
            }
        } catch (e) {
            console.error("Failed to load staff list", e)
        }
    }

    const loadMyRequests = async () => {
        try {
            const res = await api.get('/delegations/my-requests')
            if (res.data.success && res.data.requests.length > 0) {
                // If studentId is provided, look for a request for this specific student
                // If not, look for a class-wide request (where student_id is null)
                const active = res.data.requests.find((r: any) => 
                    (r.status === 'pending' || r.status === 'approved') && 
                    ((studentId ? r.student_id === studentId : !r.student_id))
                )
                if (active) {
                    setPendingRequest({
                        id: active.id,
                        to_mentor_name: active.target_mentor_name,
                        status: active.status
                    })
                } else {
                    setPendingRequest(null)
                }
            }
        } catch (e) {
            console.error("Failed to load requests", e)
        }
    }

    const handleRevoke = async () => {
        if (!pendingRequest) return
        if (!confirm("Are you sure you want to revoke this student assignment?")) return
        
        setIsRevoking(true)
        try {
            const res = await api.delete(`/delegations/revoke/${pendingRequest.id}`)
            if (res.data.success) {
                toast.success("Assignment revoked successfully")
                setPendingRequest(null)
                setSelectedStaff("")
                setReason("")
            } else {
                toast.error(res.data.error || "Failed to revoke")
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error || "Failed to revoke")
        } finally {
            setIsRevoking(false)
        }
    }

    const handleSubmit = async () => {
        if (!selectedStaff) return toast.error("Please select a mentor")
        if (assignMode === 'students' && selectedStudentIds.length === 0) return toast.error("Please select at least one student")
        
        setIsSubmitting(true)
        try {
            if (assignMode === 'class') {
                const res = await api.post('/delegations/request', {
                    to_staff_id: selectedStaff,
                    student_id: null,
                    reason
                })
                if (!res.data.success) throw new Error(res.data.error || "Failed to send request")
            } else {
                // Individual requests for each student
                for (const sid of selectedStudentIds) {
                    await api.post('/delegations/request', {
                        to_staff_id: selectedStaff,
                        student_id: sid,
                        reason
                    })
                }
            }
            
            toast.success("Assignment request(s) sent successfully")
            setOpen(false)
            setReason("")
            setSelectedStaff("")
            if (!studentId) setSelectedStudentIds([])
        } catch (e: any) {
            toast.error(e.response?.data?.error || e.message || "Failed to send request")
        } finally {
            setIsSubmitting(false)
        }
    }

    const toggleStudent = (id: string) => {
        setSelectedStudentIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const filteredStudents = students.filter(s => 
        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.adm_no.toLowerCase().includes(studentSearch.toLowerCase())
    )

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ? trigger : (
                    <Button variant="secondary" size="default" className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 h-12">
                        <Users className="h-5 w-5 mr-2 text-blue-500" />
                        Assign Students
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[450px]">
                <DialogHeader>
                    <DialogTitle>Assign {studentName ? `"${studentName}"` : "Students"} to Mentor</DialogTitle>
                    <DialogDescription>
                        Request to temporarily assign {studentName ? "this student" : "your class"} to another mentor.
                    </DialogDescription>
                </DialogHeader>

                {pendingRequest ? (
                    <div className="space-y-4 my-4">
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg p-4 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-medium text-sm">Active Request Exists</p>
                                <p className="text-xs mt-1">
                                    You have an {pendingRequest.status} assignment to <strong>{pendingRequest.to_mentor_name}</strong>.
                                </p>
                            </div>
                        </div>
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            className="w-full" 
                            onClick={handleRevoke}
                            disabled={isRevoking}
                        >
                            {isRevoking ? "Revoking..." : "Revoke This Assignment"}
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 py-4">
                        {/* Scope Selection */}
                        {!studentId && (
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                                <button 
                                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${assignMode === 'class' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}
                                    onClick={() => setAssignMode('class')}
                                >
                                    Whole Class
                                </button>
                                <button 
                                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${assignMode === 'students' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-slate-500'}`}
                                    onClick={() => setAssignMode('students')}
                                >
                                    Select Students
                                </button>
                            </div>
                        )}

                        {/* Student Picker (if mode is students and no specific studentId passed) */}
                        {assignMode === 'students' && !studentId && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Students to Assign</label>
                                <Input 
                                    placeholder="Search students..." 
                                    value={studentSearch} 
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                    className="h-8 text-xs"
                                />
                                <div className="max-h-[150px] overflow-y-auto border rounded-md p-1 space-y-1">
                                    {filteredStudents.length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-4">No students found</p>
                                    ) : filteredStudents.map(s => (
                                        <div 
                                            key={s.adm_no}
                                            className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                                            onClick={() => toggleStudent(s.adm_no)}
                                        >
                                            <Checkbox 
                                                checked={selectedStudentIds.includes(s.adm_no)}
                                                onCheckedChange={() => toggleStudent(s.adm_no)}
                                            />
                                            <span className="text-xs truncate">{s.name}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-400">{selectedStudentIds.length} students selected</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Select Target Mentor</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={selectedStaff}
                                onChange={(e) => setSelectedStaff(e.target.value)}
                            >
                                <option value="">Select a mentor...</option>
                                {staffList.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Reason (Optional)</label>
                            <Input
                                placeholder="e.g. Vacation / Emergency"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>
                    </div>
                )}
                <DialogFooter>
                    {pendingRequest ? (
                        <Button type="button" onClick={() => setOpen(false)}>Close</Button>
                    ) : (
                        <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white w-full" 
                            disabled={isSubmitting || !selectedStaff || (assignMode === 'students' && selectedStudentIds.length === 0)} 
                            onClick={handleSubmit}
                        >
                            {isSubmitting ? "Sending Requests..." : "Submit Assignment Request"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
