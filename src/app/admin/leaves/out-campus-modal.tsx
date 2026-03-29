"use client"

import { useState, useEffect } from "react"
import { Loader2, Plus, Check, ChevronsUpDown, Search } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import api from "@/lib/api"

const INDIVIDUAL_REASON_CATEGORIES = [
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

export function OutCampusModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [mode, setMode] = useState<"individual" | "class" | "batch">("individual")

    // Individual
    const [studentId, setStudentId] = useState("")
    const [studentOpen, setStudentOpen] = useState(false)
    const [reasonCategory, setReasonCategory] = useState("")
    const [otherRemark, setOtherRemark] = useState("")

    // Class / Batch
    const [groupValue, setGroupValue] = useState("")
    const [groupRemarks, setGroupRemarks] = useState("")
    const [exceptions, setExceptions] = useState<string[]>([])
    const [exceptionsSearch, setExceptionsSearch] = useState("")

    // Common
    const [startDatetime, setStartDatetime] = useState("")
    const [endDatetime, setEndDatetime] = useState("")

    // All eligible students
    const [fetchedStudents, setFetchedStudents] = useState<any[]>([])

    useEffect(() => {
        if (open) {
            const getStuds = async () => {
                try {
                    const res = await api.get('/leaves/eligible-students')
                    if (res.data.success) {
                        setFetchedStudents(res.data.students.filter((s: any) => !s.is_outside))
                    }
                } catch (e) { }
            }
            getStuds()
        } else {
            setStudentId("")
            setStartDatetime("")
            setEndDatetime("")
            setReasonCategory("")
            setOtherRemark("")
            setGroupValue("")
            setGroupRemarks("")
            setExceptions([])
            setExceptionsSearch("")
            setMode("individual")
        }
    }, [open])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!startDatetime || !endDatetime) return toast.error("Please enter start and end date/time")
        if (new Date(startDatetime) >= new Date(endDatetime)) return toast.error("End Date & Time must be after Start Date & Time")

        setLoading(true)
        try {
            if (mode === "individual") {
                if (!studentId) return toast.error("Please select a student")
                if (!reasonCategory) return toast.error("Please select a reason category")
                if (reasonCategory === "Other" && !otherRemark.trim()) return toast.error("Please enter a remark for 'Other' reason")

                await api.post('/leaves/personal', {
                    student_id: studentId,
                    leave_type: 'out-campus',
                    start_datetime: new Date(startDatetime).toISOString(),
                    end_datetime: new Date(endDatetime).toISOString(),
                    reason: reasonCategory === "Other" ? otherRemark : reasonCategory,
                    reason_category: reasonCategory,
                    remarks: otherRemark
                })
            } else {
                if (!groupValue) return toast.error(`Please enter the ${mode === 'class' ? 'class' : 'batch year'}`)
                if (!groupRemarks.trim()) return toast.error("Please enter the reason/remarks")

                await api.post('/leaves/group', {
                    group_type: mode,
                    group_value: groupValue,
                    leave_type: 'out-campus',
                    start_datetime: new Date(startDatetime).toISOString(),
                    end_datetime: new Date(endDatetime).toISOString(),
                    reason_category: mode === 'class' ? 'Class Leave' : 'Batch Leave',
                    remarks: groupRemarks,
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

    // Students for exceptions filtered by selected group
    const potentialExceptions = mode === 'class'
        ? fetchedStudents.filter(s => s.standard === groupValue)
        : mode === 'batch'
            ? fetchedStudents.filter(s => String(s.batch_year) === String(groupValue))
            : []

    const filteredExceptions = exceptionsSearch.trim()
        ? potentialExceptions.filter(s =>
            s.name.toLowerCase().includes(exceptionsSearch.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(exceptionsSearch.toLowerCase())
        )
        : potentialExceptions

    const selectedStudent = fetchedStudents.find(s => s.adm_no === studentId)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Authorize Out-Campus Leave</DialogTitle>
                    <DialogDescription>Create out-campus requests for individuals, classes, or batches.</DialogDescription>
                </DialogHeader>

                {/* Mode Selector */}
                <Tabs value={mode} onValueChange={(v: any) => { setMode(v); setGroupValue(""); setExceptions([]); setExceptionsSearch("") }} className="w-full">
                    <TabsList className="grid grid-cols-3 w-full mb-2">
                        <TabsTrigger value="individual">Individual</TabsTrigger>
                        <TabsTrigger value="class">Class</TabsTrigger>
                        <TabsTrigger value="batch">Batch</TabsTrigger>
                    </TabsList>
                </Tabs>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">

                    {/* ── INDIVIDUAL ── */}
                    {mode === "individual" && (
                        <div className="space-y-4">
                            {/* Student selector */}
                            <div className="space-y-2 flex flex-col">
                                <Label>Select Student</Label>
                                <Popover open={studentOpen} onOpenChange={setStudentOpen}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={studentOpen}
                                            className="w-full justify-between bg-white dark:bg-slate-950 font-normal"
                                        >
                                            {selectedStudent
                                                ? `${selectedStudent.name} (${selectedStudent.adm_no} – ${selectedStudent.standard})`
                                                : "Choose student..."}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[420px] p-0" align="start">
                                        <Command filter={(value, search) => {
                                            if (!search) return 1;
                                            if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                                            return 0;
                                        }}>
                                            <CommandInput placeholder="Search student name or ID..." className="h-9" />
                                            <CommandList>
                                                <CommandEmpty>No student found.</CommandEmpty>
                                                <CommandGroup>
                                                    {fetchedStudents.map((s) => (
                                                        <CommandItem
                                                            key={s.adm_no}
                                                            value={`${s.name} ${s.adm_no}`}
                                                            onSelect={() => {
                                                                setStudentId(s.adm_no)
                                                                setStudentOpen(false)
                                                            }}
                                                        >
                                                            <span className="flex-1">{s.name} <span className="text-xs text-slate-500">({s.adm_no} – {s.standard})</span></span>
                                                            <Check className={cn("ml-auto h-4 w-4", studentId === s.adm_no ? "opacity-100" : "opacity-0")} />
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                            </div>

                            {/* Reason Category */}
                            <div className="space-y-2">
                                <Label>Reason Category</Label>
                                <Select value={reasonCategory} onValueChange={setReasonCategory}>
                                    <SelectTrigger className="bg-white dark:bg-slate-950">
                                        <SelectValue placeholder="Select reason..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {INDIVIDUAL_REASON_CATEGORIES.map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Remark – only required if 'Other' */}
                            {reasonCategory === "Other" && (
                                <div className="space-y-2">
                                    <Label>Remark <span className="text-red-500">*</span></Label>
                                    <Textarea
                                        placeholder="Please describe the reason..."
                                        value={otherRemark}
                                        onChange={(e) => setOtherRemark(e.target.value)}
                                        className="bg-white dark:bg-slate-950"
                                        rows={3}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── CLASS ── */}
                    {mode === "class" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Select Class / Standard</Label>
                                <Select value={groupValue} onValueChange={(v) => { setGroupValue(v); setExceptions([]); setExceptionsSearch("") }}>
                                    <SelectTrigger className="bg-white dark:bg-slate-950">
                                        <SelectValue placeholder="Choose class..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CLASS_OPTIONS.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Reason / Remarks <span className="text-red-500">*</span></Label>
                                <Textarea
                                    placeholder="Why is this class going on leave?"
                                    value={groupRemarks}
                                    onChange={(e) => setGroupRemarks(e.target.value)}
                                    className="bg-white dark:bg-slate-950"
                                    rows={3}
                                />
                            </div>

                            {/* Exceptions */}
                            {groupValue && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">
                                        Exceptions – Students Staying in Campus
                                        <span className="ml-2 text-xs font-normal text-slate-500">Optional</span>
                                    </Label>
                                    {potentialExceptions.length > 0 && (
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search by name or ID..."
                                                value={exceptionsSearch}
                                                onChange={(e) => setExceptionsSearch(e.target.value)}
                                                className="pl-8 h-8 text-sm bg-white dark:bg-slate-950"
                                            />
                                        </div>
                                    )}
                                    <div className="max-h-36 overflow-y-auto border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                        {filteredExceptions.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-4">
                                                {potentialExceptions.length === 0 ? `No students found for this class` : "No results match your search"}
                                            </p>
                                        ) : filteredExceptions.map(s => (
                                            <div key={s.adm_no} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white dark:hover:bg-slate-800">
                                                <input
                                                    type="checkbox"
                                                    id={`exc-${s.adm_no}`}
                                                    checked={exceptions.includes(s.adm_no)}
                                                    onChange={() => toggleException(s.adm_no)}
                                                    className="h-4 w-4 rounded"
                                                />
                                                <label htmlFor={`exc-${s.adm_no}`} className="text-sm cursor-pointer flex-1">
                                                    {s.name} <span className="text-xs text-slate-400">({s.adm_no})</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    {exceptions.length > 0 && (
                                        <p className="text-xs text-blue-600 font-medium">{exceptions.length} student(s) will stay in campus</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── BATCH ── */}
                    {mode === "batch" && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Admitted Batch Year <span className="text-red-500">*</span></Label>
                                <Input
                                    placeholder="e.g. 2022"
                                    value={groupValue}
                                    onChange={(e) => { setGroupValue(e.target.value); setExceptions([]); setExceptionsSearch("") }}
                                    className="bg-white dark:bg-slate-950"
                                />
                                <p className="text-[10px] text-slate-400 italic">Enter the year the batch was admitted (e.g. 2022)</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Reason / Remarks <span className="text-red-500">*</span></Label>
                                <Textarea
                                    placeholder="Why is this batch going on leave?"
                                    value={groupRemarks}
                                    onChange={(e) => setGroupRemarks(e.target.value)}
                                    className="bg-white dark:bg-slate-950"
                                    rows={3}
                                />
                            </div>

                            {/* Exceptions */}
                            {groupValue && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">
                                        Exceptions – Students Staying in Campus
                                        <span className="ml-2 text-xs font-normal text-slate-500">Optional</span>
                                    </Label>
                                    {potentialExceptions.length > 0 && (
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                            <Input
                                                placeholder="Search by name or ID..."
                                                value={exceptionsSearch}
                                                onChange={(e) => setExceptionsSearch(e.target.value)}
                                                className="pl-8 h-8 text-sm bg-white dark:bg-slate-950"
                                            />
                                        </div>
                                    )}
                                    <div className="max-h-36 overflow-y-auto border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                        {filteredExceptions.length === 0 ? (
                                            <p className="text-xs text-slate-400 text-center py-4">
                                                {potentialExceptions.length === 0 ? "No students found for this batch year" : "No results match your search"}
                                            </p>
                                        ) : filteredExceptions.map(s => (
                                            <div key={s.adm_no} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white dark:hover:bg-slate-800">
                                                <input
                                                    type="checkbox"
                                                    id={`exc-${s.adm_no}`}
                                                    checked={exceptions.includes(s.adm_no)}
                                                    onChange={() => toggleException(s.adm_no)}
                                                    className="h-4 w-4 rounded"
                                                />
                                                <label htmlFor={`exc-${s.adm_no}`} className="text-sm cursor-pointer flex-1">
                                                    {s.name} <span className="text-xs text-slate-400">({s.adm_no} – {s.standard})</span>
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                    {exceptions.length > 0 && (
                                        <p className="text-xs text-blue-600 font-medium">{exceptions.length} student(s) will stay in campus</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── DATES (always shown) ── */}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                            <Label>Start Date & Time <span className="text-red-500">*</span></Label>
                            <Input type="datetime-local" value={startDatetime} onChange={e => setStartDatetime(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>Expected Return <span className="text-red-500">*</span></Label>
                            <Input type="datetime-local" value={endDatetime} onChange={e => setEndDatetime(e.target.value)} required />
                        </div>
                    </div>

                    <DialogFooter className="mt-6">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[150px]">
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Authorize {mode === 'individual' ? 'Leave' : mode === 'class' ? 'Class Leave' : 'Batch Leave'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
