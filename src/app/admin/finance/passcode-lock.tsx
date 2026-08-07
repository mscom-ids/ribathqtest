"use client"

import { ShieldCheck } from "lucide-react"

export function PasscodeLock() {
    return (
        <div className="flex min-h-64 items-center justify-center p-6">
            <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600" />
                <h2 className="mt-3 font-black text-slate-950 dark:text-white">Finance access is protected</h2>
                <p className="mt-2 text-sm text-slate-500">Your signed-in account role and finance permissions control access.</p>
            </div>
        </div>
    )
}