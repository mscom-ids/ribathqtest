"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Plus, Search, Outdent, ArrowRightLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import api from "@/lib/api"
import { LeaveModal } from "@/app/admin/leaves/leave-modal"
import type { StudentLeave } from "@/app/admin/leaves/page"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { QuickViewDashboard } from "@/app/admin/leaves/tabs/quick-view-dashboard"
import { LeaveTable } from "@/app/admin/leaves/tabs/leave-table"

export default function StaffLeavesPage() {
    const [leaves, setLeaves] = useState<StudentLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const res = await api.get('/staff/me/leaves')
            if (res.data.success) {
                setLeaves(res.data.leaves || [])
            }
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

            <Tabs defaultValue="quick_view" className="w-full">
                <TabsList className="bg-transparent border-b border-slate-200 dark:border-slate-800 w-full justify-start h-auto p-0 rounded-none mb-6 overflow-x-auto flex-nowrap">
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
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-8 text-center text-muted-foreground">
                        Institution Leaves (Bulk Vacations) coming soon.
                    </Card>
                </TabsContent>

                <TabsContent value="leave_requests" className="space-y-4">
                    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-8 text-center text-muted-foreground">
                        Pending Leave Requests coming soon.
                    </Card>
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
