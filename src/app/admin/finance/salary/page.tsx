"use client"

import { Card } from "@/components/ui/card"

export default function SalaryTab() {
    return (
        <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden animate-in fade-in duration-500">
            <div className="p-6 sm:px-8 border-b border-slate-800/60">
                <h3 className="text-xl font-bold text-white tracking-tight">Staff Salary Management</h3>
                <p className="text-sm text-slate-400 mt-1">Manage payroll, deductions, and salary payments.</p>
            </div>
            
            <div className="p-20 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mb-6 shadow-inner">
                    <span className="text-3xl">🚧</span>
                </div>
                <h4 className="text-2xl font-bold text-white mb-3 tracking-tight">Under Construction</h4>
                <p className="text-slate-400 max-w-sm text-sm">
                    The salary module is currently being built. It will be available in a future update.
                </p>
            </div>
        </Card>
    )
}
