"use client"

import { Card } from "@/components/ui/card"
import { Search, Loader2, IndianRupee, TrendingDown, CreditCard, Wallet, ChevronRight } from "lucide-react"
import { useState, useEffect } from "react"
import { getActiveStudents, getStudentLedger } from "../../financeActions"

export default function StudentLedgerTab() {
    const [students, setStudents] = useState<any[]>([])
    const [filteredStudents, setFilteredStudents] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState("")
    const [loading, setLoading] = useState(true)
    const [selectedStudent, setSelectedStudent] = useState<any>(null)
    const [ledger, setLedger] = useState<any>(null)
    const [ledgerLoading, setLedgerLoading] = useState(false)

    useEffect(() => {
        async function loadStudents() {
            const res = await getActiveStudents()
            if (res.success && res.data) {
                setStudents(res.data)
                setFilteredStudents(res.data)
            }
            setLoading(false)
        }
        loadStudents()
    }, [])

    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredStudents(students)
        } else {
            const q = searchQuery.toLowerCase()
            setFilteredStudents(students.filter(s =>
                s.name?.toLowerCase().includes(q) || s.adm_no?.toLowerCase().includes(q)
            ))
        }
    }, [searchQuery, students])

    const handleSelectStudent = async (student: any) => {
        setSelectedStudent(student)
        setLedgerLoading(true)
        setLedger(null)
        try {
            const res = await getStudentLedger(student.adm_no)
            if (res.success) {
                setLedger(res)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLedgerLoading(false)
        }
    }

    return (
        <div className="flex flex-col md:flex-row gap-6 min-h-[600px] animate-in fade-in duration-500">
            {/* Student List Panel */}
            <Card className="w-full md:w-80 shrink-0 flex flex-col bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800/60">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search students..."
                            className="w-full bg-[#1a2234] border border-slate-800/60 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                    <div className="flex justify-between items-center mt-3 px-1">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Students list</p>
                        <p className="text-xs font-bold text-slate-400 bg-slate-800/50 px-2 py-0.5 rounded-full">{filteredStudents.length}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-600" />
                        </div>
                    ) : filteredStudents.map(student => (
                        <button
                            key={student.adm_no}
                            onClick={() => handleSelectStudent(student)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                                selectedStudent?.adm_no === student.adm_no
                                    ? 'bg-blue-500/10 border border-blue-500/20 shadow-sm'
                                    : 'hover:bg-[#1a2234] border border-transparent hover:shadow-sm'
                            }`}
                        >
                            <div className="h-10 w-10 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner overflow-hidden">
                                {student.photo_url ? (
                                    <img src={student.photo_url} className="h-full w-full object-cover" alt="" />
                                ) : (
                                    student.name?.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className={`text-sm font-bold truncate ${selectedStudent?.adm_no === student.adm_no ? 'text-blue-400' : 'text-slate-200'}`}>
                                    {student.name}
                                </p>
                                <p className="text-xs font-medium text-slate-500 mt-0.5">{student.adm_no} · {student.standard}</p>
                            </div>
                            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${selectedStudent?.adm_no === student.adm_no ? 'text-blue-400 translate-x-1' : 'text-slate-600'}`} />
                        </button>
                    ))}
                </div>
            </Card>

            {/* Ledger Detail Panel */}
            <div className="flex-1 min-w-0">
                {!selectedStudent ? (
                    <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl h-full flex items-center justify-center min-h-[400px]">
                        <div className="text-center space-y-4 text-slate-500 max-w-sm mx-auto p-6">
                            <div className="h-20 w-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-2">
                                <CreditCard className="h-10 w-10 text-slate-600" />
                            </div>
                            <h3 className="text-lg font-medium text-slate-300">No Student Selected</h3>
                            <p className="text-sm">Select a student from the list on the left to view their detailed financial ledger, fee history, and recent payments.</p>
                        </div>
                    </Card>
                ) : ledgerLoading ? (
                    <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl h-full flex items-center justify-center min-h-[400px]">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    </Card>
                ) : ledger ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                        {/* Student Header */}
                        <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl p-6 sm:p-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative z-10">
                                <div>
                                    <h3 className="text-2xl font-extrabold text-white tracking-tight">{selectedStudent.name}</h3>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs font-medium text-slate-400 bg-[#1a2234] px-2.5 py-1 rounded-md border border-slate-800">Adm: {selectedStudent.adm_no}</span>
                                        <span className="text-xs font-medium text-slate-400 bg-[#1a2234] px-2.5 py-1 rounded-md border border-slate-800">{selectedStudent.standard || 'N/A'}</span>
                                        <span className="text-xs font-medium text-slate-400 bg-[#1a2234] px-2.5 py-1 rounded-md border border-slate-800">Batch {selectedStudent.batch_year || 'N/A'}</span>
                                    </div>
                                </div>
                                <div className="text-left sm:text-right bg-[#1a2234] p-4 rounded-xl border border-slate-800/60 shadow-inner w-full sm:w-auto">
                                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Total Pending Balance</p>
                                    <p className="text-3xl font-extrabold text-rose-400">₹{(ledger.totalDue || 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Stats Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl p-5 flex items-center gap-4 hover:border-slate-700 transition-colors">
                                <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 shrink-0">
                                    <TrendingDown className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-400 tracking-wide">Monthly Fees</p>
                                    <p className="text-2xl font-bold text-white">{(ledger.fees || []).length}</p>
                                </div>
                            </Card>
                            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl p-5 flex items-center gap-4 hover:border-slate-700 transition-colors">
                                <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 shrink-0">
                                    <IndianRupee className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-400 tracking-wide">Charges</p>
                                    <p className="text-2xl font-bold text-white">{(ledger.charges || []).length}</p>
                                </div>
                            </Card>
                            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl p-5 flex items-center gap-4 hover:border-slate-700 transition-colors">
                                <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                                    <Wallet className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-400 tracking-wide">Store Credit</p>
                                    <p className="text-2xl font-bold text-white">₹{(ledger.storeCredit || 0).toLocaleString()}</p>
                                </div>
                            </Card>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Monthly Fees */}
                            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl flex flex-col h-[400px]">
                                <div className="p-5 border-b border-slate-800/60">
                                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                                        <TrendingDown className="h-4 w-4 text-blue-400" />
                                        Fee History
                                    </h4>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4">
                                    {(ledger.fees || []).length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                            <p className="text-sm">No monthly fee records.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {(ledger.fees || []).map((fee: any) => (
                                                <div key={fee.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#1a2234] border border-slate-800/60 hover:border-slate-700 transition-colors gap-3">
                                                    <div>
                                                        <p className="text-sm font-bold text-white">
                                                            {new Date(fee.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                                                        </p>
                                                        <p className="text-xs font-medium text-slate-500 mt-0.5">Base: ₹{Number(fee.base_fee).toLocaleString()} · Final: ₹{Number(fee.final_fee).toLocaleString()}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                                                        <div className="text-left sm:text-right">
                                                            <p className="text-sm font-bold text-white">₹{Number(fee.balance || 0).toLocaleString()}</p>
                                                            <p className="text-xs font-medium text-emerald-400 mt-0.5">Paid: ₹{Number(fee.paid_amount || 0).toLocaleString()}</p>
                                                        </div>
                                                        <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-md whitespace-nowrap border ${
                                                            fee.status === 'paid' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                            fee.status === 'partial' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                                            'text-rose-400 bg-rose-500/10 border-rose-500/20'
                                                        }`}>{fee.status}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <div className="space-y-6 flex flex-col">
                                {/* Recent Payments */}
                                <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl flex-1 flex flex-col min-h-[200px]">
                                    <div className="p-5 border-b border-slate-800/60">
                                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                                            <Wallet className="h-4 w-4 text-emerald-400" />
                                            Recent Payments
                                        </h4>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {(ledger.payments || []).length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                                <p className="text-sm">No payments recorded.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {(ledger.payments || []).slice(0, 5).map((payment: any) => (
                                                    <div key={payment.id} className="flex items-center justify-between p-4 rounded-xl bg-[#1a2234] border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                                <IndianRupee className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-white">₹{Number(payment.amount).toLocaleString()}</p>
                                                                <p className="text-xs font-medium text-slate-500 mt-0.5">
                                                                    {payment.payment_method?.toUpperCase()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-xs font-medium text-slate-400">{new Date(payment.created_at).toLocaleDateString('en-IN')}</p>
                                                            {payment.receipt_number && <p className="text-[10px] text-slate-500 mt-0.5">#{payment.receipt_number}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Card>

                                {/* Additional Charges */}
                                <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl flex-1 flex flex-col min-h-[175px]">
                                    <div className="p-5 border-b border-slate-800/60">
                                        <h4 className="text-base font-bold text-white flex items-center gap-2">
                                            <IndianRupee className="h-4 w-4 text-amber-400" />
                                            Extra Charges
                                        </h4>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-4">
                                        {(ledger.charges || []).length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                                <p className="text-sm">No additional charges.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {(ledger.charges || []).slice(0, 5).map((charge: any) => (
                                                    <div key={charge.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#1a2234] border border-slate-800/60 hover:border-slate-700 transition-colors">
                                                        <div>
                                                            <p className="text-sm font-bold text-white">{charge.charge_categories?.name || 'Charge'}</p>
                                                            <p className="text-xs font-medium text-slate-500 mt-0.5">{new Date(charge.date).toLocaleDateString('en-IN')}</p>
                                                        </div>
                                                        <div className="text-right flex items-center gap-3">
                                                            <p className="text-sm font-bold text-white">₹{Number(charge.amount).toLocaleString()}</p>
                                                            {charge.is_settled ? (
                                                                <span className="text-[9px] uppercase font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">Settled</span>
                                                            ) : (
                                                                <span className="text-[9px] uppercase font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md">Pending</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}
