"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Loader2, Search } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import api from "@/lib/api"

type InstitutionalLeave = {
    id: string
    name: string
    start_datetime: string
    end_datetime: string
}

type EligibleStudent = {
    adm_no: string
    name: string
    standard: string
    is_outside: boolean
    has_institutional_record: boolean
}

function getErrorMessage(error: unknown, fallback: string) {
    const maybeError = error as { response?: { data?: { error?: string } } }
    return maybeError.response?.data?.error || fallback
}

export function InstitutionalExitModal({
    leave,
    open,
    onOpenChange,
    onSuccess
}: {
    leave: InstitutionalLeave | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}) {
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(false)
    const [students, setStudents] = useState<EligibleStudent[]>([])
    const [selectedClass, setSelectedClass] = useState("All")
    const [selectedStudentId, setSelectedStudentId] = useState("")
    const [isBulkExit, setIsBulkExit] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [exitDatetime, setExitDatetime] = useState("")
    const [companionName, setCompanionName] = useState("")
    const [companionRelationship, setCompanionRelationship] = useState("")

    useEffect(() => {
        if (!open || !leave) {
            setStudents([])
            setSelectedClass("All")
            setSelectedStudentId("")
            setIsBulkExit(false)
            setSearchQuery("")
            setCompanionName("")
            setCompanionRelationship("")
            return
        }

        setExitDatetime(format(new Date(), "yyyy-MM-dd'T'HH:mm"))

        const fetchStudents = async () => {
            setFetching(true)
            try {
                const res = await api.get(`/leaves/institutional/${leave.id}/eligible-students`)
                if (res.data.success) {
                    setStudents(res.data.students)
                }
            } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Failed to load eligible students"))
            } finally {
                setFetching(false)
            }
        }

        fetchStudents()
    }, [open, leave])

    const availableStudents = useMemo(
        () => students.filter(s => !s.is_outside && !s.has_institutional_record),
        [students]
    )

    const classes = useMemo(
        () => ["All", ...Array.from(new Set(availableStudents.map(s => s.standard).filter(Boolean)))],
        [availableStudents]
    )

    const filteredStudents = availableStudents.filter(s => {
        const classMatches = selectedClass === "All" || s.standard === selectedClass
        const query = searchQuery.trim().toLowerCase()
        const searchMatches = !query || s.name.toLowerCase().includes(query) || s.adm_no.toLowerCase().includes(query)
        return classMatches && searchMatches
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!leave) return
        if (!exitDatetime) return toast.error("Please enter exit date/time")
        if (!companionName.trim() || !companionRelationship.trim()) return toast.error("Please enter who the student is going with and their relationship")

        const ids = isBulkExit ? filteredStudents.map(s => s.adm_no) : [selectedStudentId]
        if (ids.length === 0 || ids.some(id => !id)) return toast.error("Please select at least one student")

        setLoading(true)
        try {
            const res = await api.post(`/leaves/institutional/${leave.id}/mark-exit`, {
                student_ids: ids,
                exit_datetime: new Date(exitDatetime).toISOString(),
                companion_name: companionName,
                companion_relationship: companionRelationship
            })

            if (res.data.success) {
                toast.success(`Exit recorded for ${res.data.count} student${res.data.count === 1 ? "" : "s"}`)
                onSuccess()
                onOpenChange(false)
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to mark exit"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Mark Institutional Exit</DialogTitle>
                    <DialogDescription>
                        Record the actual outbound movement for students leaving under this institutional leave.
                    </DialogDescription>
                </DialogHeader>

                {fetching ? (
                    <div className="flex justify-center p-6"><Loader2 className="animate-spin text-slate-400" /></div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="rounded-md border bg-slate-50 dark:bg-slate-900/50 p-3 text-sm">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{leave?.name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                                Window: {leave && format(new Date(leave.start_datetime), "MMM d, h:mm a")} to {leave && format(new Date(leave.end_datetime), "MMM d, h:mm a")}
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Exit Date & Time</Label>
                                <Input type="datetime-local" value={exitDatetime} onChange={e => setExitDatetime(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label>Filter by Class</Label>
                                <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedStudentId("") }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Classes" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Going With <span className="text-red-500">*</span></Label>
                                <Input value={companionName} onChange={e => setCompanionName(e.target.value)} placeholder="Person name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Relationship <span className="text-red-500">*</span></Label>
                                <Input value={companionRelationship} onChange={e => setCompanionRelationship(e.target.value)} placeholder="Parent, uncle, driver..." />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                <Input
                                    placeholder="Search student name or admission ID..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-8"
                                />
                            </div>

                            <div className="flex items-center gap-2 py-1">
                                <Checkbox
                                    id="bulk-institutional-exit"
                                    checked={isBulkExit}
                                    onCheckedChange={(checked) => {
                                        setIsBulkExit(Boolean(checked))
                                        if (checked) setSelectedStudentId("")
                                    }}
                                />
                                <Label htmlFor="bulk-institutional-exit" className="cursor-pointer font-medium">
                                    Mark all filtered students as exited ({filteredStudents.length})
                                </Label>
                            </div>
                        </div>

                        {!isBulkExit && (
                            <div className="space-y-2">
                                <Label>Select Student</Label>
                                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose student..." />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-64">
                                        {filteredStudents.map(s => (
                                            <SelectItem key={s.adm_no} value={s.adm_no}>
                                                {s.name} ({s.adm_no} - {s.standard || "N/A"})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {availableStudents.length === 0 && (
                            <div className="text-center py-5 rounded-md border border-dashed text-sm text-slate-500">
                                No students are available to exit for this leave.
                            </div>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={loading || availableStudents.length === 0 || (isBulkExit ? filteredStudents.length === 0 : !selectedStudentId)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Mark Exit
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
