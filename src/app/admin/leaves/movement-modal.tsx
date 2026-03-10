import { useState } from "react"
import { format, isAfter } from "date-fns"
import { Loader2, ArrowRightLeft, Outdent } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/auth"
import { toast } from "sonner"
import type { StudentLeave } from "./page"

interface MovementModalProps {
    leave: StudentLeave
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function MovementModal({ leave, open, onOpenChange, onSuccess }: MovementModalProps) {
    const [loading, setLoading] = useState(false)
    
    const isExit = leave.status === "approved"
    const action = isExit ? "Exit" : "Return"

    const handleMovement = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        
        const now = new Date()
        const expectedReturn = new Date(leave.end_datetime)
        const isLate = !isExit && isAfter(now, expectedReturn)

        // 1. Record the movement audit log
        const { error: movementError } = await supabase.from("student_movements").insert({
            student_id: leave.student_id,
            leave_id: leave.id,
            direction: isExit ? "exit" : "return",
            is_late: isLate,
            recorded_by: user?.id
        })

        if (movementError) {
            toast.error(`Failed to record ${action}`, { description: movementError.message })
            setLoading(false)
            return
        }

        // 2. Update the main leave record
        const updatePayload: any = {
            status: isExit ? "outside" : "completed",
            updated_at: now.toISOString()
        }
        
        if (isExit) {
            updatePayload.actual_exit_datetime = now.toISOString()
        } else {
            updatePayload.actual_return_datetime = now.toISOString()
        }

        const { error: leaveUpdateError } = await supabase
            .from("student_leaves")
            .update(updatePayload)
            .eq("id", leave.id)

        if (leaveUpdateError) {
            toast.error(`Failed to update leave status`, { description: leaveUpdateError.message })
        } else {
            toast.success(`Student marked as ${isExit ? "Outside" : "Returned"}`)
            onSuccess()
        }
        setLoading(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Confirm {action}</DialogTitle>
                    <DialogDescription>
                        You are recording a physical gate scan for {leave.student.name}.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Student:</span>
                            <span className="font-medium">{leave.student.name} ({leave.student_id})</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Leave Type:</span>
                            <span className="capitalize font-medium">{leave.leave_type.replace('_', ' ')}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Authorized Period:</span>
                            <span className="font-medium text-right">
                                {format(new Date(leave.start_datetime), "MMM d, h:mm a")} <br/>
                                to {format(new Date(leave.end_datetime), "MMM d, h:mm a")}
                            </span>
                        </div>
                    </div>

                    {!isExit && isAfter(new Date(), new Date(leave.end_datetime)) && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-200 dark:border-red-900/50">
                            <strong>Warning:</strong> Student is arriving late past their authorized return time. This will be flagged in the system.
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button 
                        onClick={handleMovement} 
                        disabled={loading} 
                        className={isExit ? "bg-orange-600 hover:bg-orange-700" : "bg-emerald-600 hover:bg-emerald-700"}
                    >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isExit ? <Outdent className="mr-2 h-4 w-4" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
                        Confirm {action}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
