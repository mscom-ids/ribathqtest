"use client"

import { useEffect, useState } from "react"
import { UserCheck, Building2, MapPin, ArrowLeftRight, History } from "lucide-react"
import { InstitutionalLeavesTab } from "./tabs/institutional-leaves"
import { OutCampusLeavesTab } from "./tabs/out-campus-leaves"
import { OnCampusLeavesTab } from "./tabs/on-campus-leaves"
import { MovementHistoryTab } from "./tabs/movement-history"
import { OutsideStudentsPanel } from "./tabs/outside-students-panel"
import api from "@/lib/api"

type TabKey = "outside_now" | "institutional" | "out-campus" | "on-campus" | "movements"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "outside_now", label: "Outside", icon: UserCheck },
    { key: "institutional", label: "Institution", icon: Building2 },
    { key: "out-campus", label: "Out-Campus", icon: MapPin },
    { key: "on-campus", label: "On-Campus", icon: ArrowLeftRight },
    { key: "movements", label: "History", icon: History },
]

export default function AdminLeavesPage() {
    const [outsideCount, setOutsideCount] = useState(0)
    const [activeTab, setActiveTab] = useState<TabKey>("outside_now")

    useEffect(() => {
        api.get('/leaves/outside-students')
            .then(res => { if (res.data.success) setOutsideCount(res.data.students?.length || 0) })
            .catch(() => {})
    }, [])

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#020617]">
            <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">

                {/* ── Header ── */}
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">Leave Management</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Manage institutional leaves, individual requests, and track student movements.
                    </p>
                </div>

                {/* ── Mobile: Vertical pill list / Desktop: Horizontal segmented bar ── */}
                {/* Mobile stacked, desktop inline */}
                <div className="flex flex-col sm:flex-row sm:rounded-xl sm:bg-gray-100 sm:dark:bg-gray-800 sm:p-1 sm:gap-1 gap-2">
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`
                                    flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all
                                    sm:flex-1 sm:justify-center sm:py-2 sm:px-2 sm:rounded-lg
                                    ${isActive
                                        ? "bg-white dark:bg-gray-700 text-slate-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600 sm:border-0 sm:shadow-sm"
                                        : "bg-white dark:bg-[#0f172a] text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 sm:bg-transparent sm:dark:bg-transparent sm:border-0 hover:text-slate-700 dark:hover:text-gray-200"
                                    }
                                `}
                            >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{tab.label}</span>
                                {tab.key === "outside_now" && outsideCount > 0 && (
                                    <span className="ml-auto sm:ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold bg-orange-500 text-white shrink-0">
                                        {outsideCount}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* ── Tab Content ── */}
                <div>
                    {activeTab === "outside_now" && <OutsideStudentsPanel />}
                    {activeTab === "institutional" && <InstitutionalLeavesTab />}
                    {activeTab === "out-campus" && <OutCampusLeavesTab />}
                    {activeTab === "on-campus" && <OnCampusLeavesTab />}
                    {activeTab === "movements" && <MovementHistoryTab />}
                </div>
            </div>
        </div>
    )
}
