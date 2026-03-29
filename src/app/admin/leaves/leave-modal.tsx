"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import api from "@/lib/api"

const REASON_CATEGORIES = [
    "Medical Leave",
    "Function Leave",
    "Funeral Leave",
    "Exam Leave",
    "Institutional Leave",
    "Other"
]

const CLASS_OPTIONS = [
    { label: "5th Class", value: "5th" },
    { label: "6th Class", value: "6th" },
    { label: "7th Class", value: "7th" },
    { label: "8th Class", value: "8th" },
    { label: "9th Class", value: "9th" },
    { label: "10th Class", value: "10th" },
    { label: "Plus One", value: "Plus One" },
    { label: "Plus Two", value: "Plus Two" }
]

export function LeaveModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [mode, setMode] = useState<"individual" | "class" | "batch">("individual")
    
    // Common
    const [startDatetime, setStartDatetime] = useState("")
    const [endDatetime, setEndDatetime] = useState("")
    const [reasonCategory, setReasonCategory] = useState("")
    const [remarks, setRemarks] = useState("")

    // Individual
    const [studentId, setStudentId] = useState("")
    const [fetchedStudents, setFetchedStudents] = useState<any[]>([])

    // Group (Class/Batch)
    const [groupValue, setGroupValue] = useState("")
    const [exceptions, setExceptions] = useState<string[]>([])
    
    useEffect(() => {
        if (open) {
            const getStuds = async () => {
                try {
                    const res = await api.get('/leaves/eligible-students')
                    if (res.data.success) {
                        setFetchedStudents(res.data.students.filter((s:any) => !s.is_outside))
                    }
                } catch(e) {}
            }
            getStuds()
        } else {
            // Reset
            setStudentId("")
            setStartDatetime("")
            setEndDatetime("")
            setReasonCategory("")
            setRemarks("")
            setGroupValue("")
            setExceptions([])
        }
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!startDatetime || !endDatetime || !reasonCategory) return toast.error("Please fill required fields")
        if (reasonCategory === "Other" && !remarks) return toast.error("Please enter remarks for 'Other' reason")

        setLoading(true)
        try {
            if (mode === "individual") {
                if (!studentId) return toast.error("Select a student")
                await api.post('/leaves/personal', {
                    student_id: studentId,
                    leave_type: 'out-campus',
                    start_datetime: new Date(startDatetime).toISOString(),
                    end_datetime: new Date(endDatetime).toISOString(),
                    reason: reasonCategory === "Other" ? remarks : reasonCategory,
                    reason_category: reasonCategory,
                    remarks: remarks
                })
            } else {
                if (!groupValue) return toast.error(`Enter ${mode} value`)
                await api.post('/leaves/group', {
                    group_type: mode,
                    group_value: groupValue,
                    leave_type: 'out-campus',
                    start_datetime: new Date(startDatetime).toISOString(),
                    end_datetime: new Date(endDatetime).toISOString(),
                    reason_category: reasonCategory,
                    remarks: remarks,
                    exceptions: exceptions
                })
            }
            toast.success("Leave authorized successfully")
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error?.response?.data?.error || "Failed to authorize leave")
        } finally {
            setLoading(false)
        }
    }

    const toggleException = (id: string) => {
        setExceptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const potentialExceptions = mode === 'class' 
        ? fetchedStudents.filter(s => s.standard === groupValue)
        : mode === 'batch'
          ? fetchedStudents.filter(s => s.batch_year === groupValue)
          : []

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Authorize New Out-Campus Leave</DialogTitle>
                    <DialogDescription>Create leave requests for individual or entire groups.</DialogDescription>
                </DialogHeader>

                <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
                    <TabsList className="grid grid-cols-3 w-full mb-4">
                        <TabsTrigger value="individual">Individual</TabsTrigger>
                        <TabsTrigger value="class">Class</TabsTrigger>
                        <TabsTrigger value="batch">Batch</TabsTrigger>
                    </TabsList>
                </Tabs>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    {mode === "individual" ? (
                        <div className="space-y-2">
                            <Label>Select Student</Label>
                            <Select value={studentId} onValueChange={setStudentId}>
                                <SelectTrigger className="bg-white dark:bg-slate-950">
                                    <SelectValue placeholder="Choose student..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {fetchedStudents.map(s => (
                                        <SelectItem key={s.adm_no} value={s.adm_no}>
                                            {s.name} ({s.adm_no} - {s.standard})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>{mode === 'class' ? 'Select Class' : 'Batch Year'}</Label>
                                {mode === 'class' ? (
                                    <Select value={groupValue} onValueChange={setGroupValue}>
                                        <SelectTrigger className="bg-white dark:bg-slate-950">
                                            <SelectValue placeholder="Select class..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CLASS_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Input 
                                        placeholder="e.g. 2024" 
                                        value={groupValue} 
                                        onChange={(e) => setGroupValue(e.target.value)}
                                        className="bg-white dark:bg-slate-950"
                                    />
                                )}
                                <p className="text-[10px] text-slate-500 italic">Select the exact group to release.</p>
                            </div>

                            {groupValue && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Exceptions (Who stays?)</Label>
                                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 bg-slate-50 dark:bg-slate-900/50 space-y-1">
                                        {potentialExceptions.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-2">No students found matching this {mode}</p>
                                        ) : potentialExceptions.map(s => (
                                            <div key={s.adm_no} className="flex items-center gap-2 px-2 py-1 hover:bg-white dark:hover:bg-slate-800 rounded">
                                                <input 
                                                    type="checkbox" 
                                                    id={`exc-staff-${s.adm_no}`}
                                                    checked={exceptions.includes(s.adm_no)}
                                                    onChange={() => toggleException(s.adm_no)}
                                                />
                                                <label htmlFor={`exc-staff-${s.adm_no}`} className="text-xs cursor-pointer flex-1">
                                                    {s.name} ({s.adm_no})
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Reason Category</Label>
                        <Select value={reasonCategory} onValueChange={setReasonCategory}>
                            <SelectTrigger className="bg-white dark:bg-slate-950">
                                <SelectValue placeholder="Select category..." />
                            </SelectTrigger>
                            <SelectContent>
                                {REASON_CATEGORIES.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Remarks / Details</Label>
                        <Textarea 
                            placeholder={reasonCategory === "Other" ? "Required for 'Other'..." : "Additional details (optional)..."}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            className="bg-white dark:bg-slate-950"
                            required={reasonCategory === "Other"}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date & Time</Label>
                            <Input type="datetime-local" value={startDatetime} onChange={e => setStartDatetime(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Expected Return</Label>
                            <Input type="datetime-local" value={endDatetime} onChange={e => setEndDatetime(e.target.value)} required />
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Authorize Leave
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
