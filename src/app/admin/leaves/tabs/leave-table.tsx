import { format } from "date-fns"
import { ArrowRightLeft, Outdent } from "lucide-react"

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
    leave_type: "personal" | "internal" | "institutional" | "out-campus" | "on-campus"
    start_datetime: string
    end_datetime: string
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
    onApprove?: (leave: StudentLeave) => void
    onReject?: (leave: StudentLeave) => void
}

export function LeaveTable({ leaves, isLoading, onMarkExit, onMarkReturn, showGateActions = false, showApprovalActions = false, onApprove, onReject }: LeaveTableProps) {
    const getStatusConfig = (status: string) => {
        switch (status) {
            case "approved": return { label: "Approved (Inside)", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" }
            case "outside": return { label: "Outside Campus", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" }
            case "completed": return { label: "Completed (Returned)", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" }
            case "cancelled": return { label: "Cancelled", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
            case "pending": return { label: "Pending Approval", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" }
            case "rejected": return { label: "Rejected", color: "bg-red-500/10 text-red-500 border-red-500/20" }
            default: return { label: status, color: "bg-slate-500/10 text-slate-500 border-slate-500/20" }
        }
    }

    return (
        <div className="overflow-x-auto border rounded-md dark:border-slate-800">
            <Table>
                <TableHeader className="bg-slate-50 dark:bg-slate-900/50">
                    <TableRow className="border-slate-200 dark:border-slate-800">
                        <TableHead className="font-semibold w-[200px]">Student</TableHead>
                        <TableHead className="font-semibold">Type & Status</TableHead>
                        <TableHead className="font-semibold">Reason</TableHead>
                        <TableHead className="font-semibold">Authorized Period</TableHead>
                        {showGateActions && <TableHead className="font-semibold">Actual Movement</TableHead>}
                        {showGateActions && <TableHead className="font-semibold text-right">Gate Action</TableHead>}
                        {showApprovalActions && <TableHead className="font-semibold text-right">Approval Action</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={showGateActions ? 6 : 4} className="h-32 text-center text-slate-500">
                                Loading leaves...
                            </TableCell>
                        </TableRow>
                    ) : leaves.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={showGateActions || showApprovalActions ? 6 : 4} className="h-32 text-center text-slate-500">
                                No leaves found matching criteria
                            </TableCell>
                        </TableRow>
                    ) : (
                        leaves.map((leave) => {
                            const { color, label } = getStatusConfig(leave.status)
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
                                                    "{(leave as any).remarks}"
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
                                                {format(new Date(leave.end_datetime), "MMM d, h:mm a")}
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
                                </TableRow>
                            )
                        })
                    )}
                </TableBody>
            </Table>
        </div>
    )
}
