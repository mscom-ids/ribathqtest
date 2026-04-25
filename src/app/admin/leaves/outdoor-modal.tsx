"use client"

import { useEffect, useState } from "react"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import api from "@/lib/api"

export function OutdoorModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [students, setStudents] = useState<any[]>([])
    const [studentId, setStudentId] = useState("")
    const [studentOpen, setStudentOpen] = useState(false)
    const [startDatetime, setStartDatetime] = useState("")
    const [companionName, setCompanionName] = useState("")
    const [companionRelationship, setCompanionRelationship] = useState("")
    const [remarks, setRemarks] = useState("")

    useEffect(() => {
        if (open) {
            api.get('/leaves/eligible-students')
                .then(res => {
                    if (res.data.success) {
                        setStudents(res.data.students.filter((s: any) => !s.is_outside))
                    }
                })
                .catch(() => {})
        } else {
            setStudentId("")
            setStartDatetime("")
            setCompanionName("")
            setCompanionRelationship("")
            setRemarks("")
            setStudentOpen(false)
        }
    }, [open])

    const selectedStudent = students.find(s => s.adm_no === studentId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!studentId) return toast.error("Please select a student")
        if (!startDatetime) return toast.error("Please enter start date and time")
        if (!companionName.trim() || !companionRelationship.trim()) {
            return toast.error("Please enter who the student is going with and their relationship")
        }

        setLoading(true)
        try {
            await api.post('/leaves/personal', {
                student_id: studentId,
                leave_type: 'outdoor',
                start_datetime: new Date(startDatetime).toISOString(),
                reason: 'Outdoor',
                reason_category: 'Outdoor',
                remarks,
                companion_name: companionName,
                companion_relationship: companionRelationship,
            })
            toast.success("Outdoor movement recorded")
            onSuccess()
            onOpenChange(false)
        } catch (error: any) {
            toast.error(error?.response?.data?.error || "Failed to record outdoor movement")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Record Outdoor Movement</DialogTitle>
                    <DialogDescription>Admin-only short outdoor movement without an expected return time.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2 flex flex-col">
                        <Label>Select Student</Label>
                        <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={studentOpen} className="w-full justify-between bg-white dark:bg-slate-950 font-normal">
                                    {selectedStudent ? `${selectedStudent.name} (${selectedStudent.adm_no} - ${selectedStudent.standard})` : "Choose student..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[420px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search student name or ID..." className="h-9" />
                                    <CommandList>
                                        <CommandEmpty>No student found.</CommandEmpty>
                                        <CommandGroup>
                                            {students.map((s) => (
                                                <CommandItem key={s.adm_no} value={`${s.name} ${s.adm_no}`} onSelect={() => { setStudentId(s.adm_no); setStudentOpen(false) }}>
                                                    <span className="flex-1">{s.name} <span className="text-xs text-slate-500">({s.adm_no} - {s.standard})</span></span>
                                                    <Check className={cn("ml-auto h-4 w-4", studentId === s.adm_no ? "opacity-100" : "opacity-0")} />
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Going With <span className="text-red-500">*</span></Label>
                            <Input value={companionName} onChange={e => setCompanionName(e.target.value)} placeholder="Person name" required />
                        </div>
                        <div className="space-y-2">
                            <Label>Relationship <span className="text-red-500">*</span></Label>
                            <Input value={companionRelationship} onChange={e => setCompanionRelationship(e.target.value)} placeholder="Parent, uncle, driver..." required />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Start Date & Time <span className="text-red-500">*</span></Label>
                        <Input type="datetime-local" value={startDatetime} onChange={e => setStartDatetime(e.target.value)} required />
                    </div>

                    <div className="space-y-2">
                        <Label>Remarks / Details</Label>
                        <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional details..." rows={3} />
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[150px]">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Record Outdoor
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
