"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InstitutionalLeavesTab } from "./tabs/institutional-leaves"
import { OutCampusLeavesTab } from "./tabs/out-campus-leaves"
import { OnCampusLeavesTab } from "./tabs/on-campus-leaves"
import { MovementHistoryTab } from "./tabs/movement-history"
import { OutsideStudentsPanel } from "./tabs/outside-students-panel"
import { UserCheck } from "lucide-react"
import api from "@/lib/api"

export default function AdminLeavesPage() {
    const [outsideCount, setOutsideCount] = useState(0)

    useEffect(() => {
        api.get('/leaves/outside-students')
            .then(res => { if (res.data.success) setOutsideCount(res.data.students?.length || 0) })
            .catch(() => {})
    }, [])

    return (
        <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Leave Management</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage institutional leaves, individual requests, and track student movements.</p>
            </div>

            <Tabs defaultValue="outside_now" className="w-full">
                <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full justify-start h-auto p-1 rounded-xl mb-6 shadow-sm overflow-x-auto space-x-1">
                    <TabsTrigger
                        value="outside_now"
                        className="data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 data-[state=active]:dark:bg-orange-900/30 data-[state=active]:dark:text-orange-400 rounded-lg py-2.5 px-4 font-medium relative"
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
                        value="institutional"
                        className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:dark:bg-emerald-900/30 data-[state=active]:dark:text-emerald-400 rounded-lg py-2.5 px-6 font-medium"
                    >
                        Institutional Leave
                    </TabsTrigger>
                    <TabsTrigger
                        value="out-campus"
                        className="data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:dark:bg-blue-900/30 data-[state=active]:dark:text-blue-400 rounded-lg py-2.5 px-6 font-medium"
                    >
                        Out-Campus Leave
                    </TabsTrigger>
                    <TabsTrigger
                        value="on-campus"
                        className="data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700 data-[state=active]:dark:bg-purple-900/30 data-[state=active]:dark:text-purple-400 rounded-lg py-2.5 px-6 font-medium"
                    >
                        On-Campus Leave
                    </TabsTrigger>
                    <TabsTrigger
                        value="movements"
                        className="data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 data-[state=active]:dark:bg-amber-900/30 data-[state=active]:dark:text-amber-400 rounded-lg py-2.5 px-6 font-medium"
                    >
                        Movement History
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="outside_now">
                    <OutsideStudentsPanel />
                </TabsContent>

                <TabsContent value="institutional">
                    <InstitutionalLeavesTab />
                </TabsContent>

                <TabsContent value="out-campus">
                    <OutCampusLeavesTab />
                </TabsContent>

                <TabsContent value="on-campus">
                    <OnCampusLeavesTab />
                </TabsContent>

                <TabsContent value="movements">
                    <MovementHistoryTab />
                </TabsContent>
            </Tabs>
        </div>
    )
}
