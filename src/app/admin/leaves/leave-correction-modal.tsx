"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Clock3, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import api from "@/lib/api"

const REASON_CATEGORIES = [
    "Medical Leave",
    "Function Leave",
    "Funeral Leave",
    "Exam Leave",
    "Institutional Leave",
    "Other",
]

export type EditableLeave = {
    id: string
    leave_type: string
    student_name?: string
    student?: { name?: string; adm_no?: string; standard?: string }
    student_adm_no?: string
    school_standard?: string
    status?: string
    return_status?: string | null
    computed_return_status?: string | null
    group_id?: string | null
    group_type?: string | null
    group_value?: string | null
    is_group?: boolean
    count?: number
    start_datetime: string
    end_datetime?: string | null
    reason?: string | null
    reason_category?: string | null
    remarks?: string | null
    companion_name?: string | null
    companion_relationship?: string | null
    actual_exit_datetime?: string | null
    actual_return_datetime?: string | null
    can_edit_exit_details?: boolean
    exit_editable_until?: string | null
    can_edit_return?: boolean
    return_editable_until?: string | null
}

function toLocalDateTime(value?: string | null) {
    if (!value) return ""
    return format(new Date(value), "yyyy-MM-dd'T'HH:mm")
}

export function isLeaveEditWindowOpen(allowed?: boolean, deadline?: string | null) {
    if (!allowed || !deadline) return false
    const deadlineMs = new Date(deadline).getTime()
    return Number.isFinite(deadlineMs) && deadlineMs >= Date.now()
}

function getErrorMessage(error: unknown) {
    const maybeError = error as { response?: { data?: { error?: string } } }
    return maybeError.response?.data?.error || "Failed to update leave"
}

export function LeaveCorrectionModal({
    leave,
    open,
    onOpenChange,
    onSuccess,
}: {
    leave: EditableLeave
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}) {
    const [saving, setSaving] = useState(false)
    const [exitDatetime, setExitDatetime] = useState("")
    const [reasonCategory, setReasonCategory] = useState("")
    const [remarks, setRemarks] = useState("")
    const [companionName, setCompanionName] = useState("")
    const [companionRelationship, setCompanionRelationship] = useState("")
    const [returnDatetime, setReturnDatetime] = useState("")

    const canEditExit = useMemo(
        () => isLeaveEditWindowOpen(leave.can_edit_exit_details, leave.exit_editable_until),
        [leave.can_edit_exit_details, leave.exit_editable_until]
    )
    const canEditReturn = useMemo(
        () => isLeaveEditWindowOpen(leave.can_edit_return, leave.return_editable_until),
        [leave.can_edit_return, leave.return_editable_until]
    )
    const hasCompanion = leave.leave_type === "out-campus" || leave.leave_type === "outdoor"

    useEffect(() => {
        if (!open) return
        setExitDatetime(toLocalDateTime(leave.start_datetime))
        setReasonCategory(leave.reason_category || "Other")
        setRemarks(leave.remarks || "")
        setCompanionName(leave.companion_name || "")
        setCompanionRelationship(leave.companion_relationship || "")
        setReturnDatetime(toLocalDateTime(leave.actual_return_datetime))
    }, [leave, open])

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        const payload: Record<string, string | null> = {}

        if (canEditExit) {
            const originalExit = toLocalDateTime(leave.start_datetime)
            const originalReason = leave.reason_category || "Other"
            const originalRemarks = leave.remarks || ""
            const originalCompanionName = leave.companion_name || ""
            const originalCompanionRelationship = leave.companion_relationship || ""

            if (exitDatetime !== originalExit) {
                if (!exitDatetime) return toast.error("Exit time is required")
                payload.start_datetime = new Date(exitDatetime).toISOString()
            }
            if (reasonCategory !== originalReason) {
                payload.reason_category = reasonCategory
                payload.reason = reasonCategory === "Other" ? remarks.trim() : reasonCategory
            }
            if (remarks !== originalRemarks) {
                payload.remarks = remarks.trim() || null
                if (reasonCategory === "Other") payload.reason = remarks.trim()
            }
            if (hasCompanion && companionName !== originalCompanionName) {
                payload.companion_name = companionName.trim()
            }
            if (hasCompanion && companionRelationship !== originalCompanionRelationship) {
                payload.companion_relationship = companionRelationship.trim()
            }
        }

        if (canEditReturn) {
            const originalReturn = toLocalDateTime(leave.actual_return_datetime)
            if (returnDatetime !== originalReturn) {
                if (!returnDatetime) return toast.error("Return time is required")
                payload.actual_return_datetime = new Date(returnDatetime).toISOString()
            }
        }

        if (Object.keys(payload).length === 0) {
            return toast.error("No changes to save")
        }
        if (payload.reason === "") return toast.error("Please enter the reason remarks")
        if (hasCompanion && canEditExit && (!companionName.trim() || !companionRelationship.trim())) {
            return toast.error("Going with and relationship are required")
        }

        setSaving(true)
        try {
            await api.patch(`/leaves/${leave.id}/correction`, payload)
            toast.success("Leave corrected successfully")
            onSuccess()
            onOpenChange(false)
        } catch (error: unknown) {
            toast.error(getErrorMessage(error))
        } finally {
            setSaving(false)
        }
    }

    const studentName = leave.student?.name || leave.student_name || "student"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Leave — {studentName}</DialogTitle>
                    <DialogDescription>
                        Correct a mistaken entry. The server checks each time limit again when you save.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-5 py-2">
                    {canEditExit && (
                        <section className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Exit details</h3>
                                    <p className="text-xs text-slate-500">Exit time, reason, and going-with details</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Until {format(new Date(leave.exit_editable_until!), "h:mm a")}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="correction-exit-time">Exit date & time</Label>
                                <Input id="correction-exit-time" type="datetime-local" value={exitDatetime} onChange={(event) => setExitDatetime(event.target.value)} />
                            </div>

                            <div className="space-y-2">
                                <Label>Reason</Label>
                                <Select value={reasonCategory} onValueChange={setReasonCategory}>
                                    <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                                    <SelectContent>
                                        {!REASON_CATEGORIES.includes(reasonCategory) && reasonCategory && (
                                            <SelectItem value={reasonCategory}>{reasonCategory}</SelectItem>
                                        )}
                                        {REASON_CATEGORIES.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="correction-remarks">Remarks</Label>
                                <Textarea id="correction-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Reason details" />
                            </div>

                            {hasCompanion && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="correction-going-with">Going with</Label>
                                        <Input id="correction-going-with" value={companionName} onChange={(event) => setCompanionName(event.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="correction-relationship">Relationship</Label>
                                        <Input id="correction-relationship" value={companionRelationship} onChange={(event) => setCompanionRelationship(event.target.value)} />
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {canEditReturn && (
                        <section className="space-y-4 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100">Return time</h3>
                                    <p className="text-xs text-slate-500">Only the recorded return time can be corrected here</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                                    <Clock3 className="h-3.5 w-3.5" />
                                    Until {format(new Date(leave.return_editable_until!), "h:mm a")}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="correction-return-time">Return date & time</Label>
                                <Input id="correction-return-time" type="datetime-local" value={returnDatetime} onChange={(event) => setReturnDatetime(event.target.value)} />
                            </div>
                        </section>
                    )}

                    {!canEditExit && !canEditReturn && (
                        <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
                            The permitted correction windows have closed. This leave is read-only.
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                        <Button type="submit" disabled={saving || (!canEditExit && !canEditReturn)}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save correction
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}