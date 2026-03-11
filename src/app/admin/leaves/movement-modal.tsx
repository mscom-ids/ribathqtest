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
import api from "@/lib/api"
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
        
        const now = new Date()
        const expectedReturn = new Date(leave.end_datetime)
        const isLate = !isExit && isAfter(now, expectedReturn)

        try {
            const res = await api.post(`/leaves/${leave.id}/movement`, {
                direction: isExit ? "exit" : "return",
                is_late: isLate,
                timestamp: now.toISOString()
            })

            if (res.data.success) {
                toast.success(`Student marked as ${isExit ? "Outside" : "Returned"}`)
                onSuccess()
            } else {
                toast.error(`Failed to record ${action}`, { description: res.data.error })
            }
        } catch (error: any) {
            toast.error(`Failed to record ${action}`, { description: error.message })
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
