"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Plus, Search, Calendar as CalendarIcon, Clock, CheckCircle, XCircle, ArrowRightLeft, Outdent } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { supabase } from "@/lib/auth"
import { LeaveModal } from "./leave-modal"
import { MovementModal } from "./movement-modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuickViewDashboard } from "./tabs/quick-view-dashboard"
import { LeaveTable } from "./tabs/leave-table"

export type StudentLeave = {
    id: string
    student_id: string
    leave_type: "internal" | "personal" | "institutional"
    start_datetime: string
    end_datetime: string
    actual_exit_datetime: string | null
    actual_return_datetime: string | null
    status: "approved" | "outside" | "completed" | "cancelled" | "pending" | "rejected"
    reason: string | null
    student: { name: string; standard: string; adm_no: string }
}

export default function AdminLeavesPage() {
    const [leaves, setLeaves] = useState<StudentLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [selectedLeaveForMovement, setSelectedLeaveForMovement] = useState<StudentLeave | null>(null)

    const fetchLeaves = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from("student_leaves")
            .select(`
                *,
                student:students (name, standard, adm_no)
            `)
            .order("created_at", { ascending: false })

        if (error) {
            console.error("Error fetching leaves:", error)
        } else if (data) {
            // @ts-ignore
            setLeaves(data)
        }
        setLoading(false)
    }

    useEffect(() => {
        fetchLeaves()
    }, [])

    const filteredLeaves = leaves.filter(l =>
        l.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.student_id.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const internalLeaves = filteredLeaves.filter(l => l.leave_type === "internal")
    const campusMovements = filteredLeaves.filter(l => l.leave_type === "personal" || l.leave_type === "institutional")
    const institutionalLeaves = filteredLeaves.filter(l => l.leave_type === "institutional")
    const leaveRequests = filteredLeaves.filter(l => l.status === "pending")

    const handleApprove = async (leave: StudentLeave) => {
        const { error } = await supabase
            .from("student_leaves")
            .update({ status: "approved" })
            .eq("id", leave.id)
        
        if (error) {
            toast.error("Failed to approve leave request")
        } else {
            toast.success("Leave request approved")
            fetchLeaves()
        }
    }

    const handleReject = async (leave: StudentLeave) => {
        const { error } = await supabase
            .from("student_leaves")
            .update({ status: "rejected" })
            .eq("id", leave.id)
        
        if (error) {
            toast.error("Failed to reject leave request")
        } else {
            toast.success("Leave request rejected")
            fetchLeaves()
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Leave & Movement Management</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage student leaves, exits, and returns.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={() => setIsLeaveModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Authorize Leave
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="quick_view" className="w-full">
            <TabsList className="bg-transparent border-b border-slate-200 dark:border-slate-800 w-full justify-start h-auto p-0 rounded-none mb-6 flex-wrap">
                    <TabsTrigger value="quick_view" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none py-3 px-4 font-medium">Quick View</TabsTrigger>
                    <TabsTrigger value="institution_leaves" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none py-3 px-4 font-medium">Institution Leaves</TabsTrigger>
                    <TabsTrigger value="leave_requests" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none py-3 px-4 font-medium">Leave Requests</TabsTrigger>
                    <TabsTrigger value="internal_leave" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none py-3 px-4 font-medium">Internal Leave</TabsTrigger>
                    <TabsTrigger value="campus_movement" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-emerald-600 rounded-none py-3 px-4 font-medium">Campus Movement</TabsTrigger>
                </TabsList>

                <TabsContent value="quick_view">
                    <QuickViewDashboard />
                </TabsContent>

                <TabsContent value="institution_leaves" className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search by student name or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                        <Button onClick={() => setIsLeaveModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            <Plus className="mr-2 h-4 w-4" />
                            New Institution Leave
                        </Button>
                    </div>
                    <LeaveTable 
                        leaves={institutionalLeaves} 
                        isLoading={loading} 
                    />
                </TabsContent>

                <TabsContent value="leave_requests" className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search by student name or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                    </div>
                    <LeaveTable 
                        leaves={leaveRequests} 
                        isLoading={loading}
                        showApprovalActions={true}
                        onApprove={handleApprove}
                        onReject={handleReject}
                    />
                </TabsContent>

                <TabsContent value="internal_leave" className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search by student name or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                    </div>
                    <LeaveTable 
                        leaves={internalLeaves} 
                        isLoading={loading} 
                    />
                </TabsContent>

                <TabsContent value="campus_movement" className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search by student name or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                            />
                        </div>
                    </div>
                    <LeaveTable 
                        leaves={campusMovements} 
                        isLoading={loading}
                        showGateActions={true}
                        onMarkExit={(leave) => setSelectedLeaveForMovement(leave)}
                        onMarkReturn={(leave) => setSelectedLeaveForMovement(leave)}
                    />
                </TabsContent>
            </Tabs>

            <LeaveModal
                open={isLeaveModalOpen}
                onOpenChange={setIsLeaveModalOpen}
                onSuccess={fetchLeaves}
            />

            {selectedLeaveForMovement && (
                <MovementModal
                    leave={selectedLeaveForMovement}
                    open={!!selectedLeaveForMovement}
                    onOpenChange={(open: boolean) => !open && setSelectedLeaveForMovement(null)}
                    onSuccess={() => {
                        setSelectedLeaveForMovement(null)
                        fetchLeaves()
                    }}
                />
            )}
        </div>
    )
}
