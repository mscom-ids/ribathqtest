"use client"

import { useState, useEffect } from "react"
import { Plus, Search, Users, CalendarDays, History, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"
import { InstitutionalModal } from "../institutional-modal"
import { RecordReturnModal } from "../record-return-modal"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type InstitutionalLeave = {
    id: string
    name: string
    start_datetime: string
    end_datetime: string
    target_classes: string[]
    is_entire_institution: boolean
    total_students: string
    returned_students: string
    created_at: string
}

export function InstitutionalLeavesTab() {
    const [leaves, setLeaves] = useState<InstitutionalLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [leaveForRecord, setLeaveForRecord] = useState<string | null>(null)
    const [leaveToDelete, setLeaveToDelete] = useState<string | null>(null)
    const [deleting, setDeleting] = useState(false)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const res = await api.get('/leaves/institutional')
            if (res.data.success) {
                setLeaves(res.data.leaves)
            }
        } catch (error) {
            console.error(error)
            toast.error("Failed to load institutional leaves")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLeaves()
    }, [])

    const filtered = leaves.filter(l => 
        l.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleDelete = async () => {
        if (!leaveToDelete) return
        setDeleting(true)
        try {
            const res = await api.delete(`/leaves/institutional/${leaveToDelete}`)
            if (res.data.success) {
                toast.success("Leave deleted successfully")
                fetchLeaves()
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.error || "Failed to delete leave")
        } finally {
            setDeleting(false)
            setLeaveToDelete(null)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                        placeholder="Search institutional leaves..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                    />
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Leave
                </Button>
            </div>

            <Card className="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                        <TableRow>
                            <TableHead className="w-[300px]">Leave Details</TableHead>
                            <TableHead>Target Group</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead className="text-center">Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-32 text-slate-500">Loading...</TableCell></TableRow>
                        ) : filtered.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center h-32 text-slate-500 flex-col items-center justify-center">
                                <span className="block mb-2">No institutional leaves found</span>
                                <Button variant="outline" onClick={() => setIsCreateModalOpen(true)}>Create One</Button>
                            </TableCell></TableRow>
                        ) : filtered.map((leave) => {
                            const total = parseInt(leave.total_students || "0")
                            const returned = parseInt(leave.returned_students || "0")
                            const pendingReturn = total - returned

                            return (
                                <TableRow key={leave.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <TableCell>
                                        <p className="font-medium text-slate-900 dark:text-slate-100">{leave.name}</p>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                                            <CalendarDays className="h-3 w-3" />
                                            {format(new Date(leave.start_datetime), "MMM d, h:mm a")} to {format(new Date(leave.end_datetime), "MMM d, h:mm a")}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {leave.is_entire_institution ? (
                                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">Entire Institution</Badge>
                                        ) : (
                                            <div className="flex flex-wrap gap-1">
                                                {leave.target_classes?.map(c => (
                                                    <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            <div className="flex items-center gap-1 text-slate-600">
                                                <Users className="h-3.5 w-3.5" />
                                                <span>{total} Affected</span>
                                            </div>
                                            {pendingReturn > 0 ? (
                                                <span className="text-xs text-amber-600 dark:text-amber-400 block mt-0.5">{pendingReturn} pending return</span>
                                            ) : (
                                                <span className="text-xs text-emerald-600 dark:text-emerald-400 block mt-0.5">All returned</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {new Date(leave.end_datetime) < new Date() ? (
                                            <Badge variant="outline" className="text-slate-500 border-slate-300">Ended</Badge>
                                        ) : new Date(leave.start_datetime) > new Date() ? (
                                            <Badge variant="outline" className="text-blue-500 border-blue-300">Scheduled</Badge>
                                        ) : (
                                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Active</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={() => setLeaveForRecord(leave.id)}
                                                className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:text-indigo-400 dark:border-indigo-800 dark:hover:bg-indigo-900/30"
                                            >
                                                <History className="h-4 w-4 mr-1.5" />
                                                Record Entry
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setLeaveToDelete(leave.id)}
                                                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-2"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </Card>

            <InstitutionalModal
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
                onSuccess={fetchLeaves}
            />

            {leaveForRecord && (
                <RecordReturnModal
                    leaveId={leaveForRecord}
                    type="institutional"
                    open={!!leaveForRecord}
                    onOpenChange={(op: boolean) => !op && setLeaveForRecord(null)}
                    onSuccess={fetchLeaves}
                />
            )}

            <AlertDialog open={!!leaveToDelete} onOpenChange={(open) => !open && setLeaveToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Institutional Leave?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete this leave and cancel all associated individual student leaves and movements. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                            {deleting ? "Deleting..." : "Delete Leave"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
