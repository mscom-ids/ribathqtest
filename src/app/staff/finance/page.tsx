"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, IndianRupee, ShieldAlert, Receipt } from "lucide-react"

export default function StaffFinancePage() {
    // In the future this will be replaced with API data
    const realAssignedStudents: any[] = []

    return (
        <div className="w-full mx-auto px-4 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6 flex-1 bg-slate-50 dark:bg-slate-950 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Student Fees</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">View pending balances for your assigned students.</p>
                </div>
                <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    Read Only
                </Badge>
            </div>

            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Find a student..." 
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm md:text-base text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-sm"
                />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {realAssignedStudents.length > 0 ? (
                    realAssignedStudents.map(student => (
                        <Card key={student.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col justify-between">
                             {/* Future Implementation Placeholder */}
                        </Card>
                    ))
                ) : (
                    <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
                        <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-full mb-4">
                            <Receipt className="h-8 w-8 text-slate-400" />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-1">No fee records available</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
                            There is currently no fee data associated with your assigned students.
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
