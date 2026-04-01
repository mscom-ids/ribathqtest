"use client"

import { useState, useEffect } from "react"
import { Plus, Search, RefreshCw, UserCheck, Building2, ArrowLeftRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { LeaveModal } from "@/app/admin/leaves/leave-modal"
import { OutsideStudentsPanel } from "@/app/admin/leaves/tabs/outside-students-panel"
import { LeaveTable } from "@/app/admin/leaves/tabs/leave-table"

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

type TabKey = "outside" | "institutional" | "internal"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "outside", label: "Outside", icon: UserCheck },
    { key: "institutional", label: "Institution", icon: Building2 },
    { key: "internal", label: "Internal", icon: ArrowLeftRight },
]

export default function StaffLeavesPage() {
    const [leaves, setLeaves] = useState<StudentLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false)
    const [outsideCount, setOutsideCount] = useState(0)
    const [activeTab, setActiveTab] = useState<TabKey>("outside")

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

    useEffect(() => { fetchLeaves() }, [])

    const filtered = leaves.filter(l =>
        l.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.student_id.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const internalLeaves = filtered.filter(l => l.leave_type === "internal")
    const institutionalLeaves = filtered.filter(l => l.leave_type === "institutional")

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#020617]">
            <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

                {/* ── Header ── */}
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Student Leaves</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Manage leave authorizations for your students.
                    </p>
                </div>

                {/* ── Authorize Button ── */}
                <Button
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 h-auto rounded-xl gap-2"
                >
                    <Plus className="h-4 w-4" />
                    Authorize Leave
                </Button>

                {/* ── Stats Row ── */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{outsideCount}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Outside</div>
                    </div>
                    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{institutionalLeaves.length}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Institution</div>
                    </div>
                    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                        <div className="text-2xl font-bold text-slate-900 dark:text-white">{internalLeaves.length}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Internal</div>
                    </div>
                </div>

                {/* ── Segmented Tab Control ── */}
                <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 gap-1">
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                                    isActive
                                        ? "bg-white dark:bg-gray-700 text-slate-900 dark:text-white shadow-sm"
                                        : "text-gray-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{tab.label}</span>
                                {tab.key === "outside" && outsideCount > 0 && (
                                    <span className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold bg-orange-500 text-white shrink-0">
                                        {outsideCount}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* ── Tab Content ── */}
                {activeTab === "outside" && (
                    <OutsideStudentsPanel />
                )}

                {activeTab === "institutional" && (
                    <div className="space-y-3">
                        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            Institutional leaves are managed by admin. Use <strong className="text-slate-700 dark:text-gray-300">Outside</strong> tab to record student returns.
                        </div>
                    </div>
                )}

                {activeTab === "internal" && (
                    <div className="space-y-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search by student name or ID..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-[#0f172a] border-gray-200 dark:border-gray-700 rounded-xl"
                            />
                        </div>
                        <div className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={fetchLeaves} className="gap-2 rounded-lg border-gray-200 dark:border-gray-700">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Refresh
                            </Button>
                        </div>
                        <LeaveTable leaves={internalLeaves} isLoading={loading} />
                    </div>
                )}
            </div>

            <LeaveModal
                open={isLeaveModalOpen}
                onOpenChange={setIsLeaveModalOpen}
                onSuccess={fetchLeaves}
            />
        </div>
    )
}
