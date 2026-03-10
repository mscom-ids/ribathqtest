"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, IndianRupee, ShieldAlert } from "lucide-react"

// Mock data reflecting realistic staff view
const mockAssignedStudents = [
    {
        id: "ADM001",
        name: "Ahmed Ali",
        batch: "10th Standard A",
        pendingFees: [
            { label: "Monthly Fee", amount: 22000, isBase: true },
            { label: "Medical", amount: 350, isBase: false },
            { label: "Laundry", amount: 200, isBase: false }
        ]
    },
    {
        id: "ADM002",
        name: "Zaid Khan",
        batch: "10th Standard A",
        pendingFees: [
            { label: "Monthly Fee", amount: 7000, isBase: true },
            { label: "Store", amount: 120, isBase: false }
        ]
    },
    {
        id: "ADM003",
        name: "Omar Farooq",
        batch: "10th Standard A",
        pendingFees: [] // Fully paid
    }
]

export default function StaffFinancePage() {
    return (
        <div className="space-y-6 max-w-[1200px] mx-auto animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Student Fees Summary</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">View pending balances for your assigned students.</p>
                </div>
                <Badge variant="outline" className="bg-slate-800/50 text-slate-300 border-slate-700">
                    <ShieldAlert className="mr-1 h-3 w-3" />
                    Read Only
                </Badge>
            </div>

            <Card className="bg-[#1a2234] border-slate-800">
                <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="relative w-full max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Find a student..." 
                            className="w-full bg-[#131b29] border border-slate-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                    </div>
                </div>
                
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {mockAssignedStudents.map(student => {
                            const totalPending = student.pendingFees.reduce((acc, curr) => acc + curr.amount, 0)
                            
                            return (
                                <Card key={student.id} className="bg-[#131b29] border-slate-800/50 p-5 flex flex-col justify-between hover:border-slate-700/80 transition-colors">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="text-base font-bold text-white">{student.name}</h3>
                                                <p className="text-xs text-slate-400">{student.id} • {student.batch}</p>
                                            </div>
                                            {totalPending === 0 ? (
                                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20">Cleared</Badge>
                                            ) : (
                                                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20">Pending</Badge>
                                            )}
                                        </div>
                                        
                                        {totalPending > 0 ? (
                                            <div className="mt-4 space-y-2">
                                                {student.pendingFees.map((fee, idx) => (
                                                    <div key={idx} className="flex justify-between items-center text-sm">
                                                        <span className={`${fee.isBase ? 'text-slate-300 font-medium' : 'text-slate-400'}`}>
                                                            {fee.label}
                                                        </span>
                                                        <span className="text-slate-300">
                                                            ₹{fee.amount}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-4 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10 text-emerald-400/80 text-sm flex items-center justify-center">
                                                No pending dues
                                            </div>
                                        )}
                                    </div>
                                    
                                    {totalPending > 0 && (
                                        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center">
                                            <span className="text-sm font-medium text-slate-400">Total Due</span>
                                            <span className="text-lg font-bold text-red-400 flex items-center">
                                                <IndianRupee className="h-4 w-4 mr-0.5" />
                                                {totalPending}
                                            </span>
                                        </div>
                                    )}
                                </Card>
                            )
                        })}
                    </div>
                </div>
            </Card>
        </div>
    )
}
