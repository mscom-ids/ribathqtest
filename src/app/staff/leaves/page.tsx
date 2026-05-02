"use client"

import { useState, useEffect } from "react"
import { Plus, Search, RefreshCw, UserCheck, Building2, ArrowLeftRight, MapPin, LogOut } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/api"
import { PersonalLeaveModal } from "@/app/admin/leaves/personal-modal"
import { InstitutionalExitModal } from "@/app/admin/leaves/institutional-exit-modal"
import { OutsideStudentsPanel } from "@/app/admin/leaves/tabs/outside-students-panel"
import { LeaveTable } from "@/app/admin/leaves/tabs/leave-table"

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

function getErrorMessage(error: unknown, fallback: string) {
    const maybeError = error as { response?: { data?: { error?: string } } }
    return maybeError.response?.data?.error || fallback
}

type TabKey = "outside" | "institutional" | "internal"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "outside", label: "Outside", icon: UserCheck },
    { key: "institutional", label: "Institution", icon: Building2 },
    { key: "internal", label: "Internal", icon: ArrowLeftRight },
]

export default function StaffLeavesPage() {
    const [leaves, setLeaves] = useState<StudentLeave[]>([])
    const [institutionalWindows, setInstitutionalWindows] = useState<InstitutionalLeave[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [outsideCount, setOutsideCount] = useState(0)
    const [activeTab, setActiveTab] = useState<TabKey>("outside")

    // null = closed, 'out-campus' or 'on-campus' = which modal is open
    const [leaveModalType, setLeaveModalType] = useState<'out-campus' | 'on-campus' | null>(null)
    const [leaveForExit, setLeaveForExit] = useState<InstitutionalLeave | null>(null)

    const fetchLeaves = async () => {
        setLoading(true)
        try {
            const [leavesRes, outsideRes, institutionalRes] = await Promise.all([
                api.get('/staff/me/leaves'),
                api.get('/leaves/outside-students'),
                api.get('/leaves/institutional'),
            ])
            if (leavesRes.data.success) setLeaves(leavesRes.data.leaves || [])
            if (outsideRes.data.success) setOutsideCount(outsideRes.data.students?.length || 0)
            if (institutionalRes.data.success) setInstitutionalWindows(institutionalRes.data.leaves || [])
        } catch (err) {
            console.error("Error fetching leaves:", err)
        }
        setLoading(false)
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void fetchLeaves()
    }, [])

    const filtered = leaves.filter(l =>
        l.student?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.student_id.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const internalLeaves = filtered.filter(l => l.leave_type === "internal" || l.leave_type === "on-campus")
    const institutionalLeaves = filtered.filter(l => l.leave_type === "institutional")

    const handleOnCampusReturn = async (leave: StudentLeave) => {
        try {
            await api.post('/leaves/record-return', {
                leave_id: leave.id,
                return_datetime: new Date().toISOString(),
            })
            await fetchLeaves()
        } catch (err: unknown) {
            console.error('Failed to record return:', err)
            alert(getErrorMessage(err, 'Failed to record return'))
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#020617]">
            <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

                {/* ── Header ── */}
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Student Leaves</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Manage leave authorizations for your students.
                    </p>
                </div>

                {/* ── Authorize Buttons (two separate actions) ── */}
                <div className="grid grid-cols-2 gap-2">
                    <Button
                        onClick={() => setLeaveModalType('out-campus')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 h-auto rounded-xl gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Out-Campus Leave
                    </Button>
                    <Button
                        onClick={() => setLeaveModalType('on-campus')}
                        className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 h-auto rounded-xl gap-2"
                    >
                        <MapPin className="h-4 w-4" />
                        On-Campus Leave
                    </Button>
                </div>

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
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Select an institutional window and record actual student exits.</p>
                            <Button variant="outline" size="sm" onClick={fetchLeaves} className="gap-2 rounded-lg border-gray-200 dark:border-gray-700">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Refresh
                            </Button>
                        </div>
                        {institutionalWindows.length === 0 ? (
                            <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                                No institutional leave windows are available.
                            </div>
                        ) : institutionalWindows.map(leave => {
                            const status = new Date(leave.end_datetime) < new Date()
                                ? "Ended"
                                : new Date(leave.start_datetime) > new Date()
                                    ? "Scheduled"
                                    : "Active"

                            return (
                                <div key={leave.id} className="bg-white dark:bg-[#0f172a] rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h2 className="font-semibold text-slate-900 dark:text-white truncate">{leave.name}</h2>
                                                <Badge variant="outline" className={status === "Active" ? "text-emerald-700 border-emerald-300" : status === "Scheduled" ? "text-blue-600 border-blue-300" : "text-slate-500 border-slate-300"}>
                                                    {status}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                {format(new Date(leave.start_datetime), "MMM d, h:mm a")} to {format(new Date(leave.end_datetime), "MMM d, h:mm a")}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => setLeaveForExit(leave)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shrink-0"
                                        >
                                            <LogOut className="h-3.5 w-3.5" />
                                            Mark Exit
                                        </Button>
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {leave.is_entire_institution ? "Entire Institution" : `Classes: ${leave.target_classes?.join(", ") || "N/A"}`}
                                    </div>
                                </div>
                            )
                        })}
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
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Shows on-campus &amp; internal leaves</p>
                            <Button variant="outline" size="sm" onClick={fetchLeaves} className="gap-2 rounded-lg border-gray-200 dark:border-gray-700">
                                <RefreshCw className="h-3.5 w-3.5" />
                                Refresh
                            </Button>
                        </div>
                        <LeaveTable
                            leaves={internalLeaves}
                            isLoading={loading}
                            showReturnAction
                            onMarkReturn={handleOnCampusReturn}
                        />
                    </div>
                )}
            </div>

            {/* Out-Campus Leave Modal */}
            <PersonalLeaveModal
                type="out-campus"
                open={leaveModalType === 'out-campus'}
                onOpenChange={(open) => !open && setLeaveModalType(null)}
                onSuccess={fetchLeaves}
            />
            {/* On-Campus Leave Modal */}
            <PersonalLeaveModal
                type="on-campus"
                open={leaveModalType === 'on-campus'}
                onOpenChange={(open) => !open && setLeaveModalType(null)}
                onSuccess={fetchLeaves}
            />
            <InstitutionalExitModal
                leave={leaveForExit}
                open={!!leaveForExit}
                onOpenChange={(open) => !open && setLeaveForExit(null)}
                onSuccess={fetchLeaves}
            />
        </div>
    )
}
