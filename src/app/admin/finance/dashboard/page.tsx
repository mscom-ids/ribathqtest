"use client"

import { Card } from "@/components/ui/card"
import { Building2, IndianRupee, Wallet, Banknote, Smartphone, Landmark, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { getFinanceDashboardData } from "../../financeActions"

export default function FeeDashboardTab() {
    const [data, setData] = useState({
        expected: 0, collected: 0, pending: 0,
        cashCollected: 0, upiCollected: 0, bankCollected: 0
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            const res = await getFinanceDashboardData()
            if (res.success) {
                setData({
                    expected: res.expected || 0,
                    collected: res.collected || 0,
                    pending: res.pending || 0,
                    cashCollected: res.cashCollected || 0,
                    upiCollected: res.upiCollected || 0,
                    bankCollected: res.bankCollected || 0,
                })
            }
            setLoading(false)
        }
        loadData()
    }, [])

    const now = new Date()
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
    const collectionPct = data.expected > 0 ? Math.round((data.collected / data.expected) * 100) : 0

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Month Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">{monthLabel} — Fee Overview</h3>
                {!loading && data.expected > 0 && (
                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${collectionPct >= 80 ? 'bg-emerald-500/10 text-emerald-400' : collectionPct >= 50 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'}`}>
                        {collectionPct}% Collected
                    </span>
                )}
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">Expected Fees</p>
                            {loading ? (
                                <div className="h-9 w-24 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-3xl font-extrabold text-white tracking-tight">₹{data.expected.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
                            <Building2 className="h-5 w-5" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">Fees Collected</p>
                            {loading ? (
                                <div className="h-9 w-24 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-3xl font-extrabold text-emerald-400 tracking-tight">₹{data.collected.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
                            <IndianRupee className="h-5 w-5" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">Total Pending</p>
                            {loading ? (
                                <div className="h-9 w-24 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-3xl font-extrabold text-rose-400 tracking-tight">₹{data.pending.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg">
                            <Wallet className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
            </div>

            {/* Collection Progress Bar */}
            {!loading && data.expected > 0 && (
                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 rounded-xl">
                    <p className="text-sm font-medium text-slate-400 mb-4 tracking-wide">Collection Progress</p>
                    <div className="w-full bg-slate-800/50 rounded-full h-3 overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r from-emerald-500 to-emerald-400"
                            style={{ width: `${Math.min(collectionPct, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-3 text-xs font-medium text-slate-500">
                        <span>₹0</span>
                        <span>₹{data.expected.toLocaleString()}</span>
                    </div>
                </Card>
            )}

            {/* Payment Method Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">Cash</p>
                            {loading ? (
                                <div className="h-7 w-20 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-2xl font-bold text-emerald-400">₹{data.cashCollected.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-slate-800/50 text-slate-300 rounded-full">
                            <Banknote className="h-5 w-5" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">UPI</p>
                            {loading ? (
                                <div className="h-7 w-20 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-2xl font-bold text-purple-400">₹{data.upiCollected.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-slate-800/50 text-slate-300 rounded-full">
                            <Smartphone className="h-5 w-5" />
                        </div>
                    </div>
                </Card>

                <Card className="bg-[#121624] border-slate-800/60 shadow-sm p-6 hover:border-slate-700 transition-all rounded-xl">
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-sm font-medium text-slate-400 tracking-wide mb-1">Bank Transfer</p>
                            {loading ? (
                                <div className="h-7 w-20 bg-slate-800/50 animate-pulse rounded mt-1" />
                            ) : (
                                <h3 className="text-2xl font-bold text-blue-400">₹{data.bankCollected.toLocaleString()}</h3>
                            )}
                        </div>
                        <div className="p-3 bg-slate-800/50 text-slate-300 rounded-full">
                            <Landmark className="h-5 w-5" />
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
