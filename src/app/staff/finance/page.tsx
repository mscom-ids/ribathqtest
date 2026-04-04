"use client"

import Link from "next/link"
import { Landmark, ArrowLeft, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function StaffFinancePage() {
    return (
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-slate-50 dark:bg-[#020617] px-4">
            <div className="w-full max-w-md">
                {/* Card */}
                <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 px-8 py-10 flex flex-col items-center text-center gap-5">

                    {/* Icon */}
                    <div className="h-16 w-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shadow-sm">
                        <Landmark className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    {/* Badge */}
                    <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-semibold px-3 py-1 rounded-full">
                        <Clock className="h-3 w-3" />
                        Coming Soon
                    </span>

                    {/* Text */}
                    <div className="space-y-2">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                            Finance Module
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                            This feature is currently under development and will be available soon. Check back later for fee tracking and payment history.
                        </p>
                    </div>

                    {/* Divider */}
                    <div className="w-full border-t border-slate-100 dark:border-slate-800" />

                    {/* Action */}
                    <Link href="/staff" className="w-full">
                        <Button
                            variant="outline"
                            className="w-full gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Dashboard
                        </Button>
                    </Link>
                </div>

                {/* Footer note */}
                <p className="text-center text-xs text-slate-400 mt-4">
                    Need help? Contact your administrator.
                </p>
            </div>
        </div>
    )
}
