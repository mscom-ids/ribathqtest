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
import { addStudentCharge } from "../../financeActions"

interface AddChargeModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
    students: any[]
    categories: any[]
}

export function AddChargeModal({ open, onOpenChange, onSuccess, students, categories }: AddChargeModalProps) {
    const [loading, setLoading] = useState(false)
    const [studentId, setStudentId] = useState("")
    const [categoryId, setCategoryId] = useState("")
    const [amount, setAmount] = useState("")
    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [description, setDescription] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!studentId || !categoryId || !amount || !date) {
            toast.error("Please fill all required fields")
            return
        }

        setLoading(true)
        
        try {
            const response = await addStudentCharge({
                student_id: studentId,
                category_id: categoryId,
                amount: Number(amount),
                date,
                description
            })

            if (response.success) {
                toast.success(response.message)
                setStudentId("")
                setCategoryId("")
                setAmount("")
                setDescription("")
                onOpenChange(false)
                if (onSuccess) onSuccess()
            } else {
                toast.error(response.error || "Failed to add charge")
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
                    <DialogTitle>Add Additional Charge</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        Add a specific charge to a student's ledger (e.g., Medical, Laundry).
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
                        <Label htmlFor="category">Charge Category</Label>
                        <Select value={categoryId} onValueChange={setCategoryId} required>
                            <SelectTrigger className="bg-[#131b29] border-slate-700">
                                <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2234] border-slate-700 text-slate-200">
                                {categories?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                        {c.name}
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
                            placeholder="e.g. 350"
                            className="bg-[#131b29] border-slate-700"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input 
                            id="date" 
                            type="date" 
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required 
                            className="bg-[#131b29] border-slate-700 [color-scheme:dark]"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Input 
                            id="description" 
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Clinic visit for fever"
                            className="bg-[#131b29] border-slate-700"
                        />
                    </div>

                    <DialogFooter className="pt-4">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="hover:bg-slate-800 text-slate-300">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
                            {loading ? "Adding..." : "Add Charge"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
