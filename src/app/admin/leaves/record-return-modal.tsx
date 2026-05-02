"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import api from "@/lib/api"

type ReturnStudent = {
    leave_id: string
    student_id: string
    status: string
    return_status?: string
    actual_return_datetime?: string
    name: string
    standard?: string
    adm_no: string
}

function getErrorMessage(error: unknown, fallback: string) {
    const maybeError = error as { response?: { data?: { error?: string } } }
    return maybeError.response?.data?.error || fallback
}

export function RecordReturnModal({ leaveId, type = 'personal', open, onOpenChange, onSuccess }: { leaveId: string, type?: 'personal' | 'institutional' | 'group', open: boolean, onOpenChange: (open: boolean) => void, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(false)
    const [students, setStudents] = useState<ReturnStudent[]>([])
    const [selectedClass, setSelectedClass] = useState<string>("All")
    const [selectedLeaveId, setSelectedLeaveId] = useState<string>("") // The specific student_leaves.id
    const [selectedLeaveIds, setSelectedLeaveIds] = useState<string[]>([])
    const [returnDatetime, setReturnDatetime] = useState("")
    const [isBulkReturn, setIsBulkReturn] = useState(false)
    const [mounted, setMounted] = useState(false)

    // We assume if leaveId is passed, it might be an institutional leave ID
    // However, if we opened this from OutCampus tab, the passed id IS the student_leave.id
    // To handle both elegantly, let's fetch /institutional/:id/students 
    // If it fails or returns 404, maybe it's a personal leave. Let's just create a generic flow if needed.
    // Actually, based on previous tabs, I passed the 'leave.id'.
    // For Institutional Tab, leave.id is institutional_leaves.id
    // For OutCampus Tab, leave.id is student_leaves.id

    // Let's deduce what type it is based on props or add a type prop safely. For now I'll just attempt both or rely on the fact that if students.length is empty, they must select from single.
    
    useEffect(() => {
        setMounted(true)
        setReturnDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
    }, [])

    useEffect(() => {
        if (open && leaveId) {
            setReturnDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"))
            
            const fetchDetails = async () => {
                setFetching(true)
                try {
                    let endpoint = "";
                    if (type === 'institutional') endpoint = `/leaves/institutional/${leaveId}/students`;
                    if (type === 'group') endpoint = `/leaves/group/${leaveId}/students`;

                    if (endpoint) {
                        const res = await api.get(endpoint)
                        if (res.data.success && res.data.students.length > 0) {
                            setStudents(res.data.students.filter((s: ReturnStudent) => s.status === 'outside'))
                        } else {
                            setSelectedLeaveId(leaveId)
                        }
                    } else {
                        setSelectedLeaveId(leaveId)
                    }
                } catch {
                    setSelectedLeaveId(leaveId)
                } finally {
                    setFetching(false)
                }
            }
            fetchDetails()
        } else {
            setStudents([])
            setSelectedClass("All")
            setSelectedLeaveId("")
            setSelectedLeaveIds([])
            setIsBulkReturn(false)
        }
    }, [open, leaveId, type])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (type !== 'personal' && !isBulkReturn && selectedLeaveIds.length === 0) return toast.error("Please select at least one student to record return for")
        if (type === 'personal' && !selectedLeaveId) return toast.error("Please select a student to record return for")
        if (!returnDatetime) return toast.error("Please enter a return date/time")

        setLoading(true)
        try {
            if (type !== 'personal' && (isBulkReturn || selectedLeaveIds.length > 0)) {
                const endpoint = type === 'group'
                    ? `/leaves/group/${leaveId}/bulk-return` 
                    : `/leaves/institutional/${leaveId}/bulk-return`;
                
                const res = await api.post(endpoint, {
                    return_datetime: new Date(returnDatetime).toISOString(),
                    standard: isBulkReturn ? selectedClass : undefined,
                    leave_ids: isBulkReturn ? undefined : selectedLeaveIds
                })
                
                if (res.data.success) {
                    toast.success(`Return recorded successfully! (${res.data.count} students)`)
                    onSuccess()
                    onOpenChange(false)
                }
            } else {
                const res = await api.post('/leaves/record-return', {
                    leave_id: selectedLeaveId,
                    return_datetime: new Date(returnDatetime).toISOString()
                })
                
                if (res.data.success) {
                    toast.success("Return recorded successfully!")
                    onSuccess()
                    
                    if (students.length > 1) {
                        setStudents(prev => prev.filter(s => s.leave_id !== selectedLeaveId))
                        setSelectedLeaveId("")
                    } else {
                        onOpenChange(false)
                    }
                }
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to record return. Maybe they already returned?"))
        } finally {
            setLoading(false)
        }
    }

    const classes = ["All", ...Array.from(new Set(students.map(s => s.standard).filter(Boolean)))]
    const filteredStudents = selectedClass === "All" ? students : students.filter(s => s.standard === selectedClass)
    const filteredLeaveIds = filteredStudents.map(s => s.leave_id)
    const allFilteredSelected = filteredLeaveIds.length > 0 && filteredLeaveIds.every(id => selectedLeaveIds.includes(id))

    const toggleStudent = (leaveIdToToggle: string) => {
        setSelectedLeaveIds(prev =>
            prev.includes(leaveIdToToggle)
                ? prev.filter(id => id !== leaveIdToToggle)
                : [...prev, leaveIdToToggle]
        )
    }

    const toggleFilteredStudents = () => {
        setSelectedLeaveIds(prev => {
            if (allFilteredSelected) {
                return prev.filter(id => !filteredLeaveIds.includes(id))
            }

            return Array.from(new Set([...prev, ...filteredLeaveIds]))
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Record Entry</DialogTitle>
                    <DialogDescription>
                        Log a student returning from leave. Time outside expected bounds will be flagged as LATE.
                    </DialogDescription>
                </DialogHeader>

                {fetching ? (
                    <div className="flex justify-center p-6"><Loader2 className="animate-spin text-slate-400" /></div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        
                        {type !== 'personal' ? (
                            students.length > 0 ? (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Filter by Class</Label>
                                    <Select value={selectedClass} onValueChange={(value) => {
                                        setSelectedClass(value)
                                        setSelectedLeaveIds([])
                                        setSelectedLeaveId("")
                                    }}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="All Classes" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {classes.map(c => (
                                                <SelectItem key={c as string} value={c as string}>
                                                    {c}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex items-center space-x-2 py-2">
                                    <Checkbox
                                        id="bulk-return"
                                        checked={isBulkReturn}
                                        onCheckedChange={(c) => {
                                            setIsBulkReturn(c as boolean)
                                            if (c) {
                                                setSelectedLeaveId("")
                                                setSelectedLeaveIds([])
                                            }
                                        }}
                                    />
                                    <Label htmlFor="bulk-return" className="font-semibold cursor-pointer">
                                        Return All {selectedClass !== "All" && `in ${selectedClass}`} ({filteredStudents.length} students)
                                    </Label>
                                </div>

                                {!isBulkReturn && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <Label>Select Students (Pending Return)</Label>
                                            <Button type="button" variant="outline" size="sm" onClick={toggleFilteredStudents}>
                                                {allFilteredSelected ? "Clear" : "Select All"}
                                            </Button>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto rounded-md border bg-white dark:bg-slate-950 divide-y">
                                            {filteredStudents.map(s => (
                                                <label key={s.leave_id} htmlFor={`return-${s.leave_id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer">
                                                    <Checkbox
                                                        id={`return-${s.leave_id}`}
                                                        checked={selectedLeaveIds.includes(s.leave_id)}
                                                        onCheckedChange={() => toggleStudent(s.leave_id)}
                                                    />
                                                    <span className="min-w-0 flex-1 text-sm">
                                                        <span className="block truncate font-medium">{s.name}</span>
                                                        <span className="block text-xs text-slate-500">{s.adm_no} - {s.standard || "N/A"}</span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <p className="text-xs text-blue-600 font-medium">
                                            {selectedLeaveIds.length} student(s) selected
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-6 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                <p className="text-sm text-slate-500">No students are currently pending return for this leave.</p>
                                <p className="text-xs text-slate-400 mt-1">Students without an exit record will not appear here.</p>
                            </div>
                        )) : null}

                        <div className="space-y-2">
                            <Label>Return Date & Time</Label>
                            {mounted && (
                                <Input 
                                    type="datetime-local" 
                                    value={returnDatetime} 
                                    onChange={e => setReturnDatetime(e.target.value)} 
                                    required 
                                />
                            )}
                        </div>

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={loading || (type !== 'personal' && students.length === 0) || (type !== 'personal' && !isBulkReturn && selectedLeaveIds.length === 0) || (type === 'personal' && !selectedLeaveId)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {type !== 'personal' && !isBulkReturn && selectedLeaveIds.length > 1 ? `Record ${selectedLeaveIds.length} Inbound Moves` : isBulkReturn ? "Bulk Apply Inbound Move" : "Record Inbound Move"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
