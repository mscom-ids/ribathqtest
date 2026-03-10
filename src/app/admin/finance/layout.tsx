"use client"

import { useState } from "react"
import { PasscodeLock } from "./passcode-lock"

export default function FinanceLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [isUnlocked, setIsUnlocked] = useState(false)

    if (!isUnlocked) {
        return <PasscodeLock onUnlock={() => setIsUnlocked(true)} />
    }

    return (
        <div className="w-full max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Finance & Accounting</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage fees, payments, charges, and salary.</p>
                </div>
            </div>
            {children}
        </div>
    )
}
