"use client"

import { useState, useEffect } from "react"
import { Plus, Search, UserCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"
import { LeaveModal } from "@/app/admin/leaves/leave-modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuickViewDashboard } from "@/app/admin/leaves/tabs/quick-view-dashboard"
import { LeaveTable } from "@/app/admin/leaves/tabs/leave-table"
import { OutsideStudentsPanel } from "@/app/admin/leaves/tabs/outside-students-panel"

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

export default function StaffLeavesPage() {
    const [leaves, setLeaves] = useState<StudentLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [outsideCount, setOutsideCount] = useState(0)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const [leavesRes, outsideRes] = await Promise.all([
                api.get('/staff/me/leaves'),
                api.get('/leaves/outside-students'),
            ])
            if (leavesRes.data.success) setLeaves(leavesRes.data.leaves || [])
            if (outsideRes.data.success) setOutsideCount(outsideRes.data.students?.length || 0)
        } catch (err) {
            console.error("Error fetching leaves:", err)
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

    return (
        <div className="space-y-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] overflow-y-auto w-full pb-20 md:pb-0">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Student Leaves</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage leave authorizations for your assigned students.</p>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button onClick={() => setIsLeaveModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
                        <Plus className="mr-2 h-4 w-4" />
                        Authorize Leave
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="outside_now" className="w-full">
                <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full justify-start h-auto p-1 rounded-xl mb-6 shadow-sm overflow-x-auto space-x-1 shrink-0">
                    <TabsTrigger 
                        value="outside_now" 
                        className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:dark:bg-orange-900/30 data-[state=active]:dark:text-orange-400 rounded-lg py-2.5 px-4 font-medium relative shrink-0"
                    >
                        <UserCheck className="h-4 w-4 mr-1.5 inline" />
                        Outside Now
                        {outsideCount > 0 && (
                            <span className="ml-2 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-orange-500 text-white">
                                {outsideCount}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="quick_view" 
                        className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:dark:bg-slate-800 data-[state=active]:dark:text-slate-100 rounded-lg py-2.5 px-6 font-medium shrink-0"
                    >
                        Quick View
                    </TabsTrigger>
                    <TabsTrigger 
                        value="institution_leaves" 
                        className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:dark:bg-emerald-900/30 data-[state=active]:dark:text-emerald-400 rounded-lg py-2.5 px-6 font-medium shrink-0"
                    >
                        Institution Leaves
                    </TabsTrigger>
                    <TabsTrigger 
                        value="internal_leave" 
                        className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:dark:bg-blue-900/30 data-[state=active]:dark:text-blue-400 rounded-lg py-2.5 px-6 font-medium shrink-0"
                    >
                        Internal Leave
                    </TabsTrigger>
                    <TabsTrigger 
                        value="campus_movement" 
                        className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:dark:bg-purple-900/30 data-[state=active]:dark:text-purple-400 rounded-lg py-2.5 px-6 font-medium shrink-0"
                    >
                        Campus Movement
                    </TabsTrigger>
                </TabsList>

                {/* ── Outside Now ── */}
                <TabsContent value="outside_now">
                    <OutsideStudentsPanel />
                </TabsContent>

                {/* ── Quick View Dashboard ── */}
                <TabsContent value="quick_view">
                    <QuickViewDashboard staffMode={true} />
                </TabsContent>

                {/* ── Institution Leaves (view only for mentors) ── */}
                <TabsContent value="institution_leaves" className="space-y-4">
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-8 text-center text-muted-foreground">
                        Institutional leaves are set by admin. Use the <strong>Outside Now</strong> tab to return students.
                    </Card>
                </TabsContent>

                {/* ── Internal Leave ── */}
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

                {/* ── Campus Movement ── */}
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
                        showGateActions={false}
                    />
                </TabsContent>
            </Tabs>

            <LeaveModal
                open={isLeaveModalOpen}
                onOpenChange={setIsLeaveModalOpen}
                onSuccess={fetchLeaves}
            />
        </div>
    )
}
