"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCw, IndianRupee, CheckCircle2, Clock, AlertTriangle, Trash2 } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { generateMonthlyFees, getMonthlyFeesForCurrentMonth, deleteMonthlyFeesForMonth } from "../../financeActions"

export default function MonthlyFeesTab() {
    const [generating, setGenerating] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [loading, setLoading] = useState(true)
    const [fees, setFees] = useState<any[]>([])

    const fetchFees = async () => {
        setLoading(true)
        try {
            const res = await getMonthlyFeesForCurrentMonth()
            if (res.success) {
                setFees(res.data || [])
            }
        } catch (err: any) {
            console.error('Error fetching fees:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchFees()
    }, [])

    const handleGenerate = async () => {
        setGenerating(true)
        try {
            const response = await generateMonthlyFees()
            if (response.success) {
                toast.success(response.message)
                fetchFees()
            } else {
                toast.error(response.error || "Failed to generate fees.")
            }
        } catch (error) {
            toast.error("An error occurred while generating fees.")
        } finally {
            setGenerating(false)
        }
    }

    const handleReset = async () => {
        if (!confirm('This will delete all PENDING (unpaid) fee records for this month. Continue?')) return
        setResetting(true)
        try {
            const res = await deleteMonthlyFeesForMonth()
            if (res.success) {
                toast.success(res.message)
                fetchFees()
            } else toast.error(res.error)
        } catch { toast.error('Failed to reset') }
        finally { setResetting(false) }
    }

    const statusBadge = (status: string) => {
        switch (status) {
            case 'paid':
                return <span className="text-[11px] uppercase font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap"><CheckCircle2 className="h-3.5 w-3.5" />Paid</span>
            case 'partial':
                return <span className="text-[11px] uppercase font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap"><Clock className="h-3.5 w-3.5" />Partial</span>
            case 'overdue':
                return <span className="text-[11px] uppercase font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap"><AlertTriangle className="h-3.5 w-3.5" />Overdue</span>
            default:
                return <span className="text-[11px] uppercase font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md flex items-center gap-1.5 whitespace-nowrap"><Clock className="h-3.5 w-3.5" />Pending</span>
        }
    }

    const now = new Date()
    const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })

    return (
        <Card className="bg-white border-slate-100 shadow-sm rounded-xl overflow-hidden animate-in fade-in duration-500">
            <div className="p-6 sm:px-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Monthly Fee Records — {monthLabel}</h3>
                    <p className="text-sm text-slate-400 mt-1">Manage monthly fee allocations for all students.</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    {fees.length > 0 && (
                        <Button
                            variant="outline"
                            className="flex-1 sm:flex-none border-red-500/30 text-red-400 hover:bg-red-500/10 bg-transparent"
                            onClick={handleReset}
                            disabled={resetting}
                        >
                            <Trash2 className={`mr-2 h-4 w-4 ${resetting ? 'animate-spin' : ''}`} />
                            {resetting ? "Resetting..." : "Reset Pending"}
                        </Button>
                    )}
                    <Button 
                        className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20"
                        onClick={handleGenerate}
                        disabled={generating}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
                        {generating ? "Generating..." : "Generate Monthly Fees"}
                    </Button>
                </div>
            </div>
            <div className="p-6 sm:p-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <div className="h-8 w-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
                        <p className="text-sm font-medium">Loading fee records...</p>
                    </div>
                ) : fees.length === 0 ? (
                    <div className="flex flex-col items-center justify-center pt-10 pb-16 text-slate-500">
                        <div className="h-16 w-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                            <IndianRupee className="h-8 w-8 text-slate-600" />
                        </div>
                        <p className="font-medium text-slate-300">No monthly fees found.</p>
                        <p className="text-sm mt-2 text-center max-w-sm">Click "Generate Monthly Fees" to create records for the current month.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6">
                            <div className="bg-[#1a2234] border border-slate-100 rounded-xl p-4 text-center shadow-sm">
                                <p className="text-3xl font-extrabold text-blue-400 mb-1">{fees.length}</p>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Students</p>
                            </div>
                            <div className="bg-[#1a2234] border border-slate-100 rounded-xl p-4 text-center shadow-sm">
                                <p className="text-3xl font-extrabold text-emerald-400 mb-1">{fees.filter(f => f.status === 'paid').length}</p>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Paid</p>
                            </div>
                            <div className="bg-[#1a2234] border border-slate-100 rounded-xl p-4 text-center shadow-sm">
                                <p className="text-3xl font-extrabold text-amber-400 mb-1">{fees.filter(f => f.status === 'partial').length}</p>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Partial</p>
                            </div>
                            <div className="bg-[#1a2234] border border-slate-100 rounded-xl p-4 text-center shadow-sm">
                                <p className="text-3xl font-extrabold text-red-400 mb-1">{fees.filter(f => f.status === 'pending' || f.status === 'overdue').length}</p>
                                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pending</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {fees.map((fee) => (
                                <div key={fee.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#1a2234] border border-slate-100 hover:border-slate-200 hover:bg-[#1d273b] transition-all gap-4 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner">
                                            {(fee.students?.name || fee.student_id).charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-200">{fee.students?.name || fee.student_id}</p>
                                            <p className="text-xs font-medium text-slate-500 tracking-wide mt-0.5">{fee.student_id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 w-full sm:w-auto pl-14 sm:pl-0">
                                        <div className="text-left sm:text-right">
                                            <p className="text-sm font-bold text-slate-200 flex items-center gap-0.5">
                                                <IndianRupee className="h-3.5 w-3.5 text-slate-500" />{fee.final_fee?.toLocaleString()}
                                            </p>
                                            {fee.paid_amount > 0 && (
                                                <p className="text-xs font-medium text-emerald-400 mt-0.5">Paid: ₹{fee.paid_amount?.toLocaleString()}</p>
                                            )}
                                        </div>
                                        {statusBadge(fee.status)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    )
}
