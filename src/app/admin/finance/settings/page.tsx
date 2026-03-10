"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, ToggleLeft, ToggleRight, IndianRupee, Calendar, Tag, Building2, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
    getFeePlans, addFeePlan, deleteFeePlan,
    getChargeCategories, addChargeCategory, toggleChargeCategory,
    getPaymentAccounts, addPaymentAccount, togglePaymentAccount
} from "../../financeActions"

export default function FinanceSettingsTab() {
    // Fee Plans
    const [feePlans, setFeePlans] = useState<any[]>([])
    const [fpLoading, setFpLoading] = useState(true)
    const [newFpAmount, setNewFpAmount] = useState("")
    const [newFpDate, setNewFpDate] = useState("")
    const [newFpLabel, setNewFpLabel] = useState("")
    const [fpAdding, setFpAdding] = useState(false)

    // Charge Categories
    const [categories, setCategories] = useState<any[]>([])
    const [catLoading, setCatLoading] = useState(true)
    const [newCatName, setNewCatName] = useState("")
    const [newCatDesc, setNewCatDesc] = useState("")
    const [catAdding, setCatAdding] = useState(false)

    // Payment Accounts
    const [accounts, setAccounts] = useState<any[]>([])
    const [accLoading, setAccLoading] = useState(true)
    const [newAccHolder, setNewAccHolder] = useState("")
    const [newAccType, setNewAccType] = useState("upi")
    const [newAccDetails, setNewAccDetails] = useState("")
    const [accAdding, setAccAdding] = useState(false)

    const fetchAll = async () => {
        setFpLoading(true); setCatLoading(true); setAccLoading(true)
        const [fp, cat, acc] = await Promise.all([
            getFeePlans(), getChargeCategories(), getPaymentAccounts()
        ])
        setFeePlans(fp.data || []); setFpLoading(false)
        setCategories(cat.data || []); setCatLoading(false)
        setAccounts(acc.data || []); setAccLoading(false)
    }

    useEffect(() => { fetchAll() }, [])

    // Fee Plan Handlers
    const handleAddFeePlan = async () => {
        if (!newFpAmount || !newFpDate) { toast.error("Amount and date are required"); return }
        setFpAdding(true)
        const res = await addFeePlan({ amount: Number(newFpAmount), effective_from: newFpDate, label: newFpLabel || undefined })
        if (res.success) {
            toast.success("Fee plan added")
            setNewFpAmount(""); setNewFpDate(""); setNewFpLabel("")
            const fp = await getFeePlans(); setFeePlans(fp.data || [])
        } else toast.error(res.error)
        setFpAdding(false)
    }

    const handleDeleteFeePlan = async (id: string) => {
        const res = await deleteFeePlan(id)
        if (res.success) {
            toast.success("Fee plan removed")
            setFeePlans(prev => prev.filter(p => p.id !== id))
        } else toast.error(res.error)
    }

    // Category Handlers
    const handleAddCategory = async () => {
        if (!newCatName) { toast.error("Category name is required"); return }
        setCatAdding(true)
        const res = await addChargeCategory({ name: newCatName, description: newCatDesc || undefined })
        if (res.success) {
            toast.success("Category added")
            setNewCatName(""); setNewCatDesc("")
            const cat = await getChargeCategories(); setCategories(cat.data || [])
        } else toast.error(res.error)
        setCatAdding(false)
    }

    const handleToggleCategory = async (id: string, active: boolean) => {
        const res = await toggleChargeCategory(id, !active)
        if (res.success) {
            setCategories(prev => prev.map(c => c.id === id ? { ...c, is_active: !active } : c))
        } else toast.error(res.error)
    }

    // Account Handlers
    const handleAddAccount = async () => {
        if (!newAccHolder) { toast.error("Account holder name is required"); return }
        setAccAdding(true)
        const res = await addPaymentAccount({ account_holder: newAccHolder, account_type: newAccType, details: newAccDetails || undefined })
        if (res.success) {
            toast.success("Account added")
            setNewAccHolder(""); setNewAccDetails("")
            const acc = await getPaymentAccounts(); setAccounts(acc.data || [])
        } else toast.error(res.error)
        setAccAdding(false)
    }

    const handleToggleAccount = async (id: string, active: boolean) => {
        const res = await togglePaymentAccount(id, !active)
        if (res.success) {
            setAccounts(prev => prev.map(a => a.id === id ? { ...a, is_active: !active } : a))
        } else toast.error(res.error)
    }

    return (
        <div className="space-y-6 max-w-5xl animate-in fade-in duration-500">
            {/* Fee Plans */}
            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <IndianRupee className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Fee Plans</h3>
                </div>
                <p className="text-sm text-slate-400 mb-8 pl-13">Configure historical and current standard fee amounts. The latest plan effective before today is used for monthly fee generation.</p>
                
                <div className="flex flex-col sm:flex-row gap-4 mb-6 bg-[#1a2234] p-4 rounded-xl border border-slate-800/60 shadow-inner">
                    <Input type="number" placeholder="Amount (₹)" value={newFpAmount} onChange={e => setNewFpAmount(e.target.value)} className="bg-[#121624] border-slate-700 focus-visible:ring-emerald-500/50 flex-1" />
                    <Input type="date" value={newFpDate} onChange={e => setNewFpDate(e.target.value)} className="bg-[#121624] border-slate-700 flex-1" />
                    <Input placeholder="Label (e.g. 2024 Base)" value={newFpLabel} onChange={e => setNewFpLabel(e.target.value)} className="bg-[#121624] border-slate-700 flex-1" />
                    <Button onClick={handleAddFeePlan} disabled={fpAdding} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20 w-full sm:w-auto">
                        {fpAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Add Plan</>}
                    </Button>
                </div>

                {fpLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
                ) : feePlans.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 bg-[#1a2234] rounded-xl border border-dashed border-slate-700">
                        <IndianRupee className="h-8 w-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No fee plans configured.</p>
                        <p className="text-xs mt-1">Add one above to enable monthly fee generation.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {feePlans.map((plan, i) => (
                            <div key={plan.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-sm ${i === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[#1a2234] border-slate-800/60 hover:border-slate-700'}`}>
                                <div className="flex items-center gap-4 sm:gap-6">
                                    <div>
                                        <p className={`text-lg font-bold ${i === 0 ? 'text-emerald-400' : 'text-white'}`}>₹{Number(plan.amount).toLocaleString()}<span className="text-sm font-medium text-slate-500">/month</span></p>
                                        <p className="text-xs font-medium text-slate-500 mt-0.5">Effective from {new Date(plan.effective_from).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {plan.label && <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md">{plan.label}</span>}
                                        {i === 0 && <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-md">ACTIVE RATE</span>}
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteFeePlan(plan.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 rounded-full">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Charge Categories */}
            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Tag className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Charge Categories</h3>
                </div>
                <p className="text-sm text-slate-400 mb-8 pl-13">Manage categories for additional student charges (Medical, Laundry, Store, etc.).</p>
                
                <div className="flex flex-col sm:flex-row gap-4 mb-6 bg-[#1a2234] p-4 rounded-xl border border-slate-800/60 shadow-inner">
                    <Input placeholder="Category name" value={newCatName} onChange={e => setNewCatName(e.target.value)} className="bg-[#121624] border-slate-700 focus-visible:ring-blue-500/50 flex-1" />
                    <Input placeholder="Description (optional)" value={newCatDesc} onChange={e => setNewCatDesc(e.target.value)} className="bg-[#121624] border-slate-700 focus-visible:ring-blue-500/50 flex-[2]" />
                    <Button onClick={handleAddCategory} disabled={catAdding} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-900/20 w-full sm:w-auto">
                        {catAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Add Category</>}
                    </Button>
                </div>

                {catLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
                ) : categories.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 bg-[#1a2234] rounded-xl border border-dashed border-slate-700">
                        <Tag className="h-8 w-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No charge categories yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {categories.map(cat => (
                            <div key={cat.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-sm ${cat.is_active ? 'bg-[#1a2234] border-slate-800/60 hover:border-slate-700' : 'bg-transparent border-slate-800/30 opacity-50'}`}>
                                <div>
                                    <p className="text-sm font-bold text-white">{cat.name}</p>
                                    {cat.description && <p className="text-xs font-medium text-slate-500 mt-1">{cat.description}</p>}
                                </div>
                                <button onClick={() => handleToggleCategory(cat.id, cat.is_active)} className={`p-1 rounded-full transition-colors ${cat.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}>
                                    {cat.is_active ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Payment Accounts */}
            <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
                        <Building2 className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Payment Accounts</h3>
                </div>
                <p className="text-sm text-slate-400 mb-8 pl-13">Setup valid receivers for UPI and Bank payments.</p>
                
                <div className="flex flex-col sm:flex-row gap-4 mb-6 bg-[#1a2234] p-4 rounded-xl border border-slate-800/60 shadow-inner">
                    <Input placeholder="Account holder name" value={newAccHolder} onChange={e => setNewAccHolder(e.target.value)} className="bg-[#121624] border-slate-700 focus-visible:ring-amber-500/50 flex-1" />
                    <select value={newAccType} onChange={e => setNewAccType(e.target.value)} className="bg-[#121624] border border-slate-700 rounded-md px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500/50">
                        <option value="upi">UPI</option>
                        <option value="bank">Bank</option>
                    </select>
                    <Input placeholder="UPI ID or Bank details" value={newAccDetails} onChange={e => setNewAccDetails(e.target.value)} className="bg-[#121624] border-slate-700 focus-visible:ring-amber-500/50 flex-[2]" />
                    <Button onClick={handleAddAccount} disabled={accAdding} className="bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-900/20 w-full sm:w-auto">
                        {accAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" />Add Account</>}
                    </Button>
                </div>

                {accLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
                ) : accounts.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 bg-[#1a2234] rounded-xl border border-dashed border-slate-700">
                        <Building2 className="h-8 w-8 mx-auto mb-3 opacity-20" />
                        <p className="text-sm font-medium">No payment accounts configured.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {accounts.map(acc => (
                            <div key={acc.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-sm ${acc.is_active ? 'bg-[#1a2234] border-slate-800/60 hover:border-slate-700' : 'bg-transparent border-slate-800/30 opacity-50'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-xs font-bold ${acc.account_type === 'upi' ? 'text-purple-400 bg-purple-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                                        {acc.account_type.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">{acc.account_holder}</p>
                                        {acc.details && <p className="text-xs font-medium text-slate-500 mt-0.5 tracking-wide">{acc.details}</p>}
                                    </div>
                                </div>
                                <button onClick={() => handleToggleAccount(acc.id, acc.is_active)} className={`p-1 rounded-full transition-colors ${acc.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-500 hover:bg-slate-800 hover:text-white'}`}>
                                    {acc.is_active ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Security */}
            <Card className="bg-rose-950/10 border-rose-900/30 shadow-sm rounded-xl overflow-hidden p-6 sm:p-8">
                <h3 className="text-lg font-bold text-rose-400 mb-2">Security</h3>
                <p className="text-sm text-slate-400 mb-6">Change the Finance access passcode required to view these pages.</p>
                <button className="px-5 py-2.5 bg-[#1a2234] text-white border border-slate-800 hover:bg-slate-800 hover:border-slate-700 rounded-lg text-sm font-medium transition-all shadow-sm">
                    Change Passcode
                </button>
            </Card>
        </div>
    )
}
