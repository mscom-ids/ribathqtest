"use client"

import { useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { recordStudentPayment } from "../../financeActions"

interface RecordPaymentModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
    students: any[]
    accounts: any[]
}

export function RecordPaymentModal({ open, onOpenChange, onSuccess, students, accounts }: RecordPaymentModalProps) {
    const [loading, setLoading] = useState(false)
    const [method, setMethod] = useState("cash")
    const [studentId, setStudentId] = useState("")
    const [amount, setAmount] = useState("")
    const [accountId, setAccountId] = useState("")
    const [receipt, setReceipt] = useState("")
    const [notes, setNotes] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!studentId || !amount) {
            toast.error("Please fill all required fields")
            return
        }
        setLoading(true)
        
        try {
            const response = await recordStudentPayment({
                student_id: studentId,
                amount: Number(amount),
                payment_method: method,
                account_id: (method !== "cash" && accountId) ? accountId : undefined,
                reference_number: receipt,
                notes
            })

            if (response.success) {
                toast.success(response.message)
                setStudentId("")
                setAmount("")
                setAccountId("")
                setReceipt("")
                setNotes("")
                onOpenChange(false)
                if (onSuccess) onSuccess()
            } else {
                toast.error(response.error || "Failed to record payment")
            }
        } catch (error) {
            toast.error("An unexpected error occurred")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-[#0f1420] border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Enter payment details. The amount will automatically settle the oldest pending fees first.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div className="space-y-2">
                        <Label htmlFor="student">Student</Label>
                        <Select value={studentId} onValueChange={setStudentId} required>
                            <SelectTrigger className="bg-[#131b29] border-slate-700">
                                <SelectValue placeholder="Select student" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2234] border-slate-700 text-slate-200">
                                {students?.map(s => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name} ({s.admission_number || s.id.substring(0, 5)})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount (₹)</Label>
                        <Input 
                            id="amount" 
                            type="number" 
                            min="1" 
                            required
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="e.g. 5000"
                            className="bg-[#131b29] border-slate-700"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="method">Payment Method</Label>
                        <Select value={method} onValueChange={setMethod} required>
                            <SelectTrigger className="bg-[#131b29] border-slate-700">
                                <SelectValue placeholder="Select method" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2234] border-slate-700 text-slate-200">
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="upi">UPI</SelectItem>
                                <SelectItem value="bank">Bank Transfer</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {(method === "upi" || method === "bank") && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <Label htmlFor="account">Receiving Account</Label>
                            <Select value={accountId} onValueChange={setAccountId} required>
                                <SelectTrigger className="bg-[#131b29] border-slate-700">
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#1a2234] border-slate-700 text-slate-200">
                                    {accounts?.map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.account_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="receipt">Receipt Number (Optional)</Label>
                        <Input 
                            id="receipt" 
                            value={receipt}
                            onChange={(e) => setReceipt(e.target.value)}
                            placeholder="e.g. RCP-1024"
                            className="bg-[#131b29] border-slate-700"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Input 
                            id="notes" 
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Any additional remarks..."
                            className="bg-[#131b29] border-slate-700"
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-slate-800 text-slate-300">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {loading ? "Recording..." : "Record Payment"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
