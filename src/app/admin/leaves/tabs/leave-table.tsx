import { format, isPast } from "date-fns"
import { ArrowRightLeft, Outdent, AlertTriangle, Building2, MapPin, CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
export interface StudentLeave {
    id: string
    student_id: string
    leave_type: "personal" | "internal" | "institutional" | "out-campus" | "on-campus" | "outdoor"
    start_datetime: string
    end_datetime: string | null
    reason?: string
    reason_category?: string
    remarks?: string
    status: "approved" | "pending" | "rejected" | "outside" | "completed" | "returned" | "late" | "normal" | "cancelled"
    actual_exit_datetime?: string
    actual_return_datetime?: string
    student?: {
        name: string
        adm_no: string
        standard: string
    }
}

interface LeaveTableProps {
    leaves: StudentLeave[]
    isLoading: boolean
    onMarkExit?: (leave: StudentLeave) => void
    onMarkReturn?: (leave: StudentLeave) => void
    showGateActions?: boolean
    showApprovalActions?: boolean
    showReturnAction?: boolean
    onApprove?: (leave: StudentLeave) => void
    onReject?: (leave: StudentLeave) => void
}

export function LeaveTable({ leaves, isLoading, onMarkExit, onMarkReturn, showGateActions = false, showApprovalActions = false, showReturnAction = false, onApprove, onReject }: LeaveTableProps) {
    const getStatusConfig = (status: string, leaveType?: string) => {
        switch (status) {
            case "approved": return { label: leaveType === 'on-campus' ? "On-Campus (Active)" : "Approved", color: "bg-violet-500/10 text-violet-600 border-violet-500/20" }
            case "outside": return { label: "Outside Campus", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" }
            case "completed": return { label: "Completed (Returned)", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" }
            case "returned": return { label: "Completed (Returned)", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" }
            case "cancelled": return { label: "Cancelled", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
            case "pending": return { label: "Pending Approval", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" }
            case "rejected": return { label: "Rejected", color: "bg-red-500/10 text-red-500 border-red-500/20" }
            default: return { label: status, color: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
        }
    }

    return (
        <div className="space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto border rounded-md dark:border-slate-800">
                <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                        <TableRow className="border-slate-200 dark:border-slate-800">
                            <TableHead className="font-semibold w-[200px]">Student</TableHead>
                            <TableHead className="font-semibold">Type &amp; Status</TableHead>
                            <TableHead className="font-semibold">Reason</TableHead>
                            <TableHead className="font-semibold">Authorized Period</TableHead>
                            {showGateActions && <TableHead className="font-semibold">Actual Movement</TableHead>}
                            {showGateActions && <TableHead className="font-semibold text-right">Gate Action</TableHead>}
                            {showApprovalActions && <TableHead className="font-semibold text-right">Approval Action</TableHead>}
                            {showReturnAction && <TableHead className="font-semibold text-right">Action</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={showGateActions ? 6 : showReturnAction ? 5 : 4} className="h-32 text-center text-slate-500">
                                    Loading leaves...
                                </TableCell>
                            </TableRow>
                        ) : leaves.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={showGateActions || showApprovalActions || showReturnAction ? 5 : 4} className="h-32 text-center text-slate-500">
                                    No leaves found matching criteria
                                </TableCell>
                            </TableRow>
                        ) : (
                            leaves.map((leave) => {
                                const { color, label } = getStatusConfig(leave.status, leave.leave_type)
                                return (
                                    <TableRow key={leave.id || (leave as any).group_id} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                                        <TableCell>
                                            <div className="font-medium text-slate-900 dark:text-slate-200">
                                                {leave.student?.name}
                                            </div>
                                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                <span>{(leave as any).is_group ? `${(leave as any).count} Students Released` : leave.student_id}</span>
                                                {!(leave as any).is_group && (
                                                    <>
                                                        <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                                        <span>{leave.student?.standard}</span>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col items-start gap-1.5">
                                                <span className="text-sm capitalize">{leave.leave_type.replace('_', ' ')}</span>
                                                <Badge variant="outline" className={color}>{label}</Badge>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-[250px]">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                    {(leave as any).reason_category || "General"}
                                                </span>
                                                {(leave as any).remarks && (
                                                    <span className="text-[11px] text-slate-500 italic line-clamp-2">
                                                        "{ (leave as any).remarks }"
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="text-sm flex flex-col gap-1 text-slate-600 dark:text-slate-400">
                                                <div className="flex items-center gap-1.5">
                                                    <Outdent className="h-3.5 w-3.5" />
                                                    {format(new Date(leave.start_datetime), "MMM d, h:mm a")}
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <ArrowRightLeft className="h-3.5 w-3.5" />
                                                    {leave.end_datetime ? format(new Date(leave.end_datetime), "MMM d, h:mm a") : "Open"}
                                                </div>
                                            </div>
                                        </TableCell>
                                        {showGateActions && (
                                            <TableCell>
                                                <div className="text-sm flex flex-col gap-1 text-slate-600 dark:text-slate-400">
                                                    {leave.actual_exit_datetime ? (
                                                        <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                                                            <span>Out:</span> {format(new Date(leave.actual_exit_datetime), "MMM d, h:mm a")}
                                                        </div>
                                                    ) : <span className="text-slate-400 italic">Not exited yet</span>}

                                                    {leave.actual_return_datetime && (
                                                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                                            <span>In:</span> {format(new Date(leave.actual_return_datetime), "MMM d, h:mm a")}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                        {showGateActions && (
                                            <TableCell className="text-right">
                                                {leave.status === "approved" && onMarkExit && (
                                                    <Button size="sm" variant="outline" onClick={() => onMarkExit(leave)} className="border-orange-200 hover:bg-orange-50 dark:border-orange-900/50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400">
                                                        Mark Exit
                                                    </Button>
                                                )}
                                                {leave.status === "outside" && onMarkReturn && (
                                                    <Button size="sm" variant="outline" onClick={() => onMarkReturn(leave)} className="border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                                        Mark Return
                                                    </Button>
                                                )}
                                            </TableCell>
                                        )}
                                        {showApprovalActions && (
                                            <TableCell className="text-right">
                                                {leave.status === "pending" && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        {onReject && (
                                                            <Button size="sm" variant="outline" onClick={() => onReject(leave)} className="border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400">
                                                                Reject
                                                            </Button>
                                                        )}
                                                        {onApprove && (
                                                            <Button size="sm" onClick={() => onApprove(leave)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                                                Approve
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </TableCell>
                                        )}
                                        {showReturnAction && (
                                            <TableCell className="text-right">
                                                {(leave.status === 'approved' || leave.status === 'pending') && onMarkReturn && (
                                                    <Button size="sm" variant="outline" onClick={() => onMarkReturn(leave)} className="border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                                        Mark Returned
                                                    </Button>
                                                )}
                                                {(leave.status === 'completed' || leave.status === 'returned') && (
                                                    <span className="text-xs text-emerald-600 font-medium">✓ Closed</span>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                )
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
                {isLoading ? (
                    <div className="text-center py-8 text-slate-500 text-sm">Loading leaves...</div>
                ) : leaves.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">No leaves found matching criteria</div>
                ) : (
                    leaves.map((leave) => {
                        const { color, label } = getStatusConfig(leave.status, leave.leave_type)
                        const isOverdue = leave.status === 'outside' && leave.end_datetime && isPast(new Date(leave.end_datetime))
                        const initials = leave.student?.name ? leave.student.name.substring(0, 2).toUpperCase() : 'ST'

                        return (
                            <div key={leave.id || (leave as any).group_id} className={`relative rounded-xl border p-4 flex flex-col gap-3 ${
                                isOverdue ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}>
                                {isOverdue && (
                                    <div className="absolute top-2 right-2">
                                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                                            <AlertTriangle className="h-3 w-3" /> OVERDUE
                                        </span>
                                    </div>
                                )}

                                {/* Header */}
                                <div className="flex items-center gap-3">
                                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                                        leave.leave_type === 'institutional' ? 'bg-gradient-to-br from-purple-500 to-indigo-600' :
                                        (leave.leave_type === 'out-campus' || leave.leave_type === 'personal') ? 'bg-gradient-to-br from-orange-400 to-amber-500' :
                                        'bg-gradient-to-br from-blue-400 to-cyan-500'
                                    }`}>
                                        {initials}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-12">
                                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                            {(leave as any).is_group ? `${(leave as any).count} Students Released` : leave.student?.name}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                            {leave.student_id} {leave.student?.standard && `· ${leave.student.standard}`}
                                        </p>
                                    </div>
                                </div>

                                {/* Status & Reason */}
                                <div className="flex flex-wrap gap-1.5 items-center">
                                    <Badge variant="outline" className={`${color} text-[10px] px-1.5 py-0`}>{label}</Badge>
                                    {(leave as any).reason_category && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                                            {(leave as any).reason_category}
                                        </span>
                                    )}
                                </div>
                                {(leave as any).remarks && (
                                    <p className="text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-100 dark:border-slate-700">
                                        &ldquo;{(leave as any).remarks}&rdquo;
                                    </p>
                                )}

                                {/* Times */}
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                                        <p className="text-slate-400 mb-0.5">Start / Exit</p>
                                        <p className="font-medium text-slate-700 dark:text-slate-300">
                                            {format(new Date(leave.actual_exit_datetime || leave.start_datetime), 'dd MMM, h:mm a')}
                                        </p>
                                    </div>
                                    <div className={`rounded-lg p-2 ${isOverdue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                                        <p className="text-slate-400 mb-0.5">Expected Return</p>
                                        <p className={`font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {leave.end_datetime ? format(new Date(leave.end_datetime), 'dd MMM, h:mm a') : 'Open'}
                                        </p>
                                    </div>
                                </div>

                                {/* Actions */}
                                {(showGateActions || showApprovalActions || showReturnAction) && (
                                    <div className="pt-1 flex flex-col gap-2">
                                        {showGateActions && leave.status === "approved" && onMarkExit && (
                                            <Button size="sm" variant="outline" onClick={() => onMarkExit(leave)} className="w-full border-orange-200 text-orange-600">
                                                Mark Exit
                                            </Button>
                                        )}
                                        {showGateActions && leave.status === "outside" && onMarkReturn && (
                                            <Button size="sm" variant="outline" onClick={() => onMarkReturn(leave)} className="w-full border-emerald-200 text-emerald-600">
                                                Mark Return
                                            </Button>
                                        )}
                                        {showApprovalActions && leave.status === "pending" && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {onReject && <Button size="sm" variant="outline" onClick={() => onReject(leave)} className="border-red-200 text-red-600">Reject</Button>}
                                                {onApprove && <Button size="sm" onClick={() => onApprove(leave)} className="bg-emerald-600 hover:bg-emerald-700 text-white">Approve</Button>}
                                            </div>
                                        )}
                                        {showReturnAction && (leave.status === 'approved' || leave.status === 'pending') && onMarkReturn && (
                                            <Button size="sm" variant="outline" onClick={() => onMarkReturn(leave)} className="w-full border-emerald-200 text-emerald-600">
                                                Mark Returned
                                            </Button>
                                        )}
                                        {showReturnAction && (leave.status === 'completed' || leave.status === 'returned') && (
                                            <div className="w-full py-1.5 text-center text-xs text-emerald-600 font-medium flex items-center justify-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Closed
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
    )
}
