"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { useState, useEffect } from "react"
import { RecordPaymentModal } from "../modals/record-payment-modal"
import { AddChargeModal } from "../modals/add-charge-modal"
import { getPaymentFormData } from "../../financeActions"

export default function PaymentsTab() {
    const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
    const [addChargeOpen, setAddChargeOpen] = useState(false)
    
    const [students, setStudents] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])
    const [accounts, setAccounts] = useState<any[]>([])

    const fetchData = async () => {
        const res = await getPaymentFormData()
        if (res.success) {
            setStudents(res.students || [])
            setCategories(res.categories || [])
            setAccounts(res.accounts || [])
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    return (
        <Card className="bg-[#121624] border-slate-800/60 shadow-sm rounded-xl overflow-hidden animate-in fade-in duration-500">
            <div className="p-6 sm:px-8 border-b border-slate-800/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Payment Records</h3>
                    <p className="text-sm text-slate-400 mt-1">Record new payments and view payment history.</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    <Button 
                        variant="outline" 
                        className="flex-1 sm:flex-none border-amber-500/30 text-amber-400 hover:bg-amber-500/10 bg-transparent"
                        onClick={() => setAddChargeOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Charge
                    </Button>
                    <Button 
                        className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-900/20"
                        onClick={() => setRecordPaymentOpen(true)}
                    >
                        <Plus className="mr-2 h-4 w-4" />
                        Record Payment
                    </Button>
                </div>
            </div>
            
            <div className="p-6 sm:p-8">
                <div className="flex flex-col items-center justify-center pt-10 pb-16 text-slate-500">
                    <div className="h-16 w-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                        <Plus className="h-8 w-8 text-slate-600" />
                    </div>
                    <p className="font-medium text-slate-300">No payments recorded yet.</p>
                    <p className="text-sm mt-2 text-center max-w-sm">Use the buttons above to record a new payment or add an extra charge to a student's ledger.</p>
                </div>
            </div>

            <RecordPaymentModal 
                open={recordPaymentOpen} 
                onOpenChange={setRecordPaymentOpen} 
                students={students}
                accounts={accounts}
                onSuccess={fetchData}
            />
            <AddChargeModal 
                open={addChargeOpen} 
                onOpenChange={setAddChargeOpen} 
                students={students}
                categories={categories}
                onSuccess={fetchData}
            />
        </Card>
    )
}
