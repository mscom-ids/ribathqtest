"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import api from "@/lib/api"

export function InstitutionalModal({ open, onOpenChange, onSuccess }: { open: boolean, onOpenChange: (open: boolean) => void, onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [name, setName] = useState("Monthly Leave")
    const [startDatetime, setStartDatetime] = useState("")
    const [endDatetime, setEndDatetime] = useState("")
    const [isEntireInstitution, setIsEntireInstitution] = useState(false)
    const [targetClasses, setTargetClasses] = useState<string[]>([])
    const [exceptions, setExceptions] = useState<string[]>([])

    const [allStudents, setAllStudents] = useState<any[]>([])

    const [searchQuery, setSearchQuery] = useState("")

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

    useEffect(() => {
        if (open) {
            const fetchStudents = async () => {
                try {
                    const res = await api.get('/leaves/eligible-students')
                    if (res.data.success) {
                        // filter out those currently outside
                        setAllStudents(res.data.students.filter((s:any) => !s.is_outside))
                    }
                } catch (e) {
                    console.error(e)
                }
            }
            fetchStudents()
        } else {
            // Reset
            setName("Monthly Leave")
            setStartDatetime("")
            setEndDatetime("")
            setIsEntireInstitution(false)
            setTargetClasses([])
            setExceptions([])
            setSearchQuery("")
        }
    }, [open])

    const toggleClass = (c: string) => {
        setTargetClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
    }
    const toggleException = (id: string) => {
        setExceptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !startDatetime || !endDatetime) return toast.error("Please fill all required fields")
        if (new Date(startDatetime) >= new Date(endDatetime)) return toast.error("End Date & Time must be after Start Date & Time")
        if (!isEntireInstitution && targetClasses.length === 0) return toast.error("Please select at least one target class")

        setLoading(true)
        try {
            const payload = {
                name,
                start_datetime: new Date(startDatetime).toISOString(),
                end_datetime: new Date(endDatetime).toISOString(),
                is_entire_institution: isEntireInstitution,
                target_classes: targetClasses,
                exceptions
            }
            const res = await api.post('/leaves/institutional', payload)
            if (res.data.success) {
                toast.success(`Leave created! Affected ${res.data.count} students.`)
                onSuccess()
                onOpenChange(false)
            } else {
                toast.error(res.data.error || "Failed to create leave")
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.error || "An error occurred")
        } finally {
            setLoading(false)
        }
    }

    // Filter students by selected classes to show relevant ones in Exceptions map
    const baseStudents = isEntireInstitution ? allStudents : allStudents.filter(s => targetClasses.includes(s.standard))
    
    const relevantStudents = searchQuery.trim().length > 0
        ? baseStudents.filter(s =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.adm_no.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : baseStudents

    const hasPool = isEntireInstitution || targetClasses.length > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Institutional Leave</DialogTitle>
                    <DialogDescription>
                        This will automatically mark selected students as OUTSIDE the campus and cancel their classes within the date range.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label>Leave Name</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Leave" required />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Start Date & Time</Label>
                            <Input type="datetime-local" value={startDatetime} onChange={e => setStartDatetime(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <Label>End Date & Time</Label>
                            <Input type="datetime-local" value={endDatetime} onChange={e => setEndDatetime(e.target.value)} required />
                        </div>
                    </div>

                    <div className="space-y-4 rounded-lg border p-4 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center justify-between">
                            <Label className="font-semibold text-base">Select Applicable Classes</Label>
                            <div className="flex items-center space-x-2">
                                <Label htmlFor="entire-institution" className="text-sm cursor-pointer border px-2 py-1 bg-white rounded-md shadow-sm">Entire Institution</Label>
                                <Switch
                                    id="entire-institution"
                                    checked={isEntireInstitution}
                                    onCheckedChange={(c) => {
                                        setIsEntireInstitution(c)
                                        if(c) setTargetClasses([])
                                    }}
                                />
                            </div>
                        </div>

                        {!isEntireInstitution && (
                            <div className="grid grid-cols-3 gap-2">
                                {CLASS_OPTIONS.map(cls => (
                                    <div key={cls.value} className="flex items-center space-x-2">
                                        <input 
                                            type="checkbox" 
                                            id={`cls-${cls.value}`} 
                                            className="rounded border-gray-300"
                                            checked={targetClasses.includes(cls.value)}
                                            onChange={() => toggleClass(cls.value)}
                                        />
                                        <Label htmlFor={`cls-${cls.value}`} className="text-sm font-normal cursor-pointer">{cls.label}</Label>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="font-semibold text-base">Exceptions (Stay in Campus)</Label>
                        <p className="text-xs text-slate-500 pb-1">Students selected here will stay on campus. Their classes will still be cancelled.</p>

                        {!hasPool ? (
                            <p className="text-sm text-center py-4 text-slate-400 border rounded-md bg-slate-50 dark:bg-slate-900/50">
                                Select classes above (or toggle Entire Institution) to see students.
                            </p>
                        ) : (
                            <>
                                <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                                    </span>
                                    <Input
                                        placeholder="Search by name or admission ID..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 h-8 text-sm"
                                    />
                                </div>

                                <div className="max-h-40 overflow-y-auto border rounded-md p-1 bg-white dark:bg-slate-950 divide-y">
                                    {relevantStudents.length === 0 ? (
                                        <p className="text-sm text-center py-4 text-slate-500">
                                            {baseStudents.length === 0 ? "No active students in selected class(es)." : "No students match your search."}
                                        </p>
                                    ) : relevantStudents.map(student => (
                                        <div key={student.adm_no} className="flex items-center py-1.5 px-2 space-x-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                                            <input
                                                type="checkbox"
                                                id={`exc-${student.adm_no}`}
                                                className="h-4 w-4 rounded border-gray-300"
                                                checked={exceptions.includes(student.adm_no)}
                                                onChange={() => toggleException(student.adm_no)}
                                            />
                                            <Label htmlFor={`exc-${student.adm_no}`} className="text-sm flex-1 cursor-pointer font-medium">
                                                {student.name} <span className="text-xs text-slate-500 font-normal ml-1.5">{student.standard}</span>
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-blue-600 font-medium">
                                    {exceptions.length} exception(s) selected · {baseStudents.length} total eligible
                                </p>
                            </>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Leave & Release Students
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
