"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, CreditCard, Loader2, Plus, ReceiptText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
    createIdempotencyKey,
    decimalMoney,
    financeApi,
    financeErrorMessage,
    studentFinanceId,
    type ChargeCategory,
    type FinanceStudentBalance,
    type PaymentAccount,
    type StudentFinanceAccount,
} from "@/lib/finance-api"
import { money, shortDate, todayValue } from "./finance-utils"
import { SearchableSelect } from "./searchable-select"

function useResponsiveSheetSide() {
    const [isDesktop, setIsDesktop] = useState(false)
    useEffect(() => {
        const media = window.matchMedia("(min-width: 640px)")
        const update = () => setIsDesktop(media.matches)
        update()
        media.addEventListener("change", update)
        return () => media.removeEventListener("change", update)
    }, [])
    return isDesktop ? "right" as const : "bottom" as const
}

function ActionStudentSelect({
    students,
    value,
    onChange,
}: {
    students: FinanceStudentBalance[]
    value: string
    onChange: (value: string) => void
}) {
    const items = useMemo(() => students.map(student => {
        const id = studentFinanceId(student)
        return { id, label: `${student.name} (${id}${student.standard ? ` · ${student.standard}` : ""})` }
    }), [students])

    return (
        <SearchableSelect
            label="Student"
            placeholder="Choose a student"
            searchPlaceholder="Search by name or ID..."
            items={items}
            value={value}
            onChange={onChange}
        />
    )
}

function actionSheetClass(side: "right" | "bottom") {
    return side === "right"
        ? "flex h-full w-full flex-col gap-0 border-slate-200 bg-white p-0 sm:max-w-lg dark:border-slate-800 dark:bg-slate-950"
        : "flex max-h-[92vh] flex-col gap-0 rounded-t-3xl border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950"
}

export function AddChargeSheet({
    open,
    onOpenChange,
    students,
    categories,
    initialStudentId,
    onSuccess,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    students: FinanceStudentBalance[]
    categories: ChargeCategory[]
    initialStudentId?: string
    onSuccess: (account?: StudentFinanceAccount) => void | Promise<void>
}) {
    const side = useResponsiveSheetSide()
    const [studentId, setStudentId] = useState("")
    const [categoryId, setCategoryId] = useState("")
    const [amount, setAmount] = useState("")
    const [date, setDate] = useState(todayValue())
    const dueDate = date
    const [description, setDescription] = useState("")
    const [saving, setSaving] = useState(false)
    const operationKey = useRef("")

    // Medical-specific fields
    const [illness, setIllness] = useState("")
    const [travelledWith, setTravelledWith] = useState("")
    const [doctorHospital, setDoctorHospital] = useState("")
    const [doctorFee, setDoctorFee] = useState("")
    const [medicineCost, setMedicineCost] = useState("")
    const [xrayCost, setXrayCost] = useState("")
    const [transportCost, setTransportCost] = useState("")
    const [otherCost, setOtherCost] = useState("")

    const selectedCategory = categories.find(c => c.id === categoryId)
    const isMedical = selectedCategory ? /medical/i.test(selectedCategory.name) : false

    const medicalTotal = useMemo(() => {
        if (!isMedical) return 0
        return [doctorFee, medicineCost, xrayCost, transportCost, otherCost]
            .reduce((sum, v) => sum + (Number(v) || 0), 0)
    }, [isMedical, doctorFee, medicineCost, xrayCost, transportCost, otherCost])

    // Sync medical total into amount
    useEffect(() => {
        if (isMedical) setAmount(medicalTotal > 0 ? medicalTotal.toFixed(2) : "")
    }, [isMedical, medicalTotal])

    function resetMedicalFields() {
        setIllness(""); setTravelledWith(""); setDoctorHospital("")
        setDoctorFee(""); setMedicineCost(""); setXrayCost("")
        setTransportCost(""); setOtherCost("")
    }

    useEffect(() => {
        if (!open) return
        setStudentId(initialStudentId || "")
        setCategoryId(categories[0]?.id || "")
        setAmount("")
        setDate(todayValue())
        setDescription("")
        resetMedicalFields()
        operationKey.current = createIdempotencyKey("charge")
    }, [open, initialStudentId, categories])

    function buildDescription() {
        if (!isMedical) return description.trim() || undefined
        const parts: string[] = []
        if (illness.trim()) parts.push(`Illness: ${illness.trim()}`)
        if (travelledWith.trim()) parts.push(`Travelled with: ${travelledWith.trim()}`)
        if (doctorHospital.trim()) parts.push(`Doctor/Hospital: ${doctorHospital.trim()}`)
        const costs: string[] = []
        if (Number(doctorFee) > 0) costs.push(`Doctor fee: ₹${Number(doctorFee).toFixed(2)}`)
        if (Number(medicineCost) > 0) costs.push(`Medicine: ₹${Number(medicineCost).toFixed(2)}`)
        if (Number(xrayCost) > 0) costs.push(`X-ray: ₹${Number(xrayCost).toFixed(2)}`)
        if (Number(transportCost) > 0) costs.push(`Transport: ₹${Number(transportCost).toFixed(2)}`)
        if (Number(otherCost) > 0) costs.push(`Other: ₹${Number(otherCost).toFixed(2)}`)
        if (costs.length) parts.push(costs.join(", "))
        if (description.trim()) parts.push(description.trim())
        return parts.join(" | ") || "Medical charge"
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault()
        if (!studentId || !categoryId || Number(amount) <= 0) return
        setSaving(true)
        try {
            const result = await financeApi.addCharge({
                student_id: studentId,
                category_id: categoryId,
                amount: decimalMoney(amount),
                date,
                due_date: dueDate,
                description: buildDescription(),
                idempotency_key: operationKey.current || (operationKey.current = createIdempotencyKey("charge")),
            })
            if (!result.success) throw new Error(result.error || "Could not add charge")
            toast.success(result.message || "Charge added")
            operationKey.current = ""
            await onSuccess(result.account)
            onOpenChange(false)
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add charge"))
        } finally {
            setSaving(false)
        }
    }

    const medicalInputClass = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side={side} className={actionSheetClass(side)}>
                <SheetHeader className="border-b border-slate-200 px-5 pb-4 pt-6 text-left dark:border-slate-800">
                    <SheetTitle>Add charge</SheetTitle>
                    <SheetDescription>{isMedical ? "Record a medical expense with itemized costs." : "Add an authorized medical, store, laundry, or other item to the student account."}</SheetDescription>
                </SheetHeader>
                <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                        <ActionStudentSelect students={students} value={studentId} onChange={setStudentId} />
                        <div className="space-y-2">
                            <Label htmlFor="charge-category">Category</Label>
                            <select
                                id="charge-category"
                                required
                                value={categoryId}
                                onChange={event => setCategoryId(event.target.value)}
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                {!categories.length && <option value="">No authorized categories</option>}
                                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                        </div>

                        {isMedical ? (
                            <>
                                {/* Medical detail fields */}
                                <div className="space-y-2">
                                    <Label htmlFor="med-illness">Illness / Medical condition</Label>
                                    <Input id="med-illness" value={illness} onChange={e => setIllness(e.target.value)} placeholder="e.g. Fever, fracture, eye infection" />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="med-travelled">Travelled with (mentor)</Label>
                                        <Input id="med-travelled" value={travelledWith} onChange={e => setTravelledWith(e.target.value)} placeholder="Mentor name" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="med-doctor">Doctor / Hospital name</Label>
                                        <Input id="med-doctor" value={doctorHospital} onChange={e => setDoctorHospital(e.target.value)} placeholder="Doctor or hospital" />
                                    </div>
                                </div>

                                {/* Itemized costs */}
                                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                                    <p className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Cost breakdown</p>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                            <Label htmlFor="med-doctor-fee" className="text-xs">Doctor fee</Label>
                                            <input id="med-doctor-fee" type="number" inputMode="decimal" min="0" step="0.01" value={doctorFee} onChange={e => setDoctorFee(e.target.value)} placeholder="0.00" className={medicalInputClass} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="med-medicine" className="text-xs">Medicine</Label>
                                            <input id="med-medicine" type="number" inputMode="decimal" min="0" step="0.01" value={medicineCost} onChange={e => setMedicineCost(e.target.value)} placeholder="0.00" className={medicalInputClass} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="med-xray" className="text-xs">X-ray</Label>
                                            <input id="med-xray" type="number" inputMode="decimal" min="0" step="0.01" value={xrayCost} onChange={e => setXrayCost(e.target.value)} placeholder="0.00" className={medicalInputClass} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="med-transport" className="text-xs">Auto / Transport</Label>
                                            <input id="med-transport" type="number" inputMode="decimal" min="0" step="0.01" value={transportCost} onChange={e => setTransportCost(e.target.value)} placeholder="0.00" className={medicalInputClass} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="med-other" className="text-xs">Other charges</Label>
                                            <input id="med-other" type="number" inputMode="decimal" min="0" step="0.01" value={otherCost} onChange={e => setOtherCost(e.target.value)} placeholder="0.00" className={medicalInputClass} />
                                        </div>
                                        <div className="flex items-end">
                                            <div className="w-full rounded-lg bg-emerald-50 px-3 py-2.5 text-center dark:bg-emerald-950/40">
                                                <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Total</p>
                                                <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">₹{medicalTotal.toFixed(2)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="charge-date">Charge date</Label>
                                    <Input id="charge-date" type="date" required value={date} onChange={event => setDate(event.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="charge-description">Additional notes</Label>
                                    <Textarea id="charge-description" rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Any extra details (optional)" />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="charge-amount">Amount</Label>
                                        <Input id="charge-amount" inputMode="decimal" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="charge-date">Charge date</Label>
                                        <Input id="charge-date" type="date" required value={date} onChange={event => setDate(event.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="charge-description">Description</Label>
                                    <Textarea id="charge-description" rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Short reason or bill reference" />
                                </div>
                            </>
                        )}

                        <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                            This creates a new ledger item. Existing dues and payments are not changed.
                        </div>
                    </div>
                    <SheetFooter className="border-t border-slate-200 p-4 dark:border-slate-800">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving || !categories.length || !studentId || Number(amount) <= 0} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {saving ? "Adding…" : "Add charge"}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    )
}

export function CollectPaymentSheet({
    open,
    onOpenChange,
    students,
    accounts,
    initialStudentId,
    initialAccount,
    onSuccess,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    students: FinanceStudentBalance[]
    accounts: PaymentAccount[]
    initialStudentId?: string
    initialAccount?: StudentFinanceAccount | null
    onSuccess: (account?: StudentFinanceAccount) => void | Promise<void>
}) {
    const side = useResponsiveSheetSide()
    const [studentId, setStudentId] = useState("")
    const [studentAccount, setStudentAccount] = useState<StudentFinanceAccount | null>(null)
    const [accountLoading, setAccountLoading] = useState(false)
    const [amount, setAmount] = useState("")
    const [paymentDate, setPaymentDate] = useState(todayValue())
    const [method, setMethod] = useState("cash")
    const [paymentAccountId, setPaymentAccountId] = useState("")
    const [reference, setReference] = useState("")
    const [notes, setNotes] = useState("")
    const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState(false)
    const operationKey = useRef("")

    useEffect(() => {
        if (!open) return
        const nextStudent = initialStudentId || ""
        setStudentId(nextStudent)
        setAmount("")
        setPaymentDate(todayValue())
        setMethod("cash")
        setPaymentAccountId("")
        setReference("")
        setNotes("")
        setAllocationAmounts({})
        setStudentAccount(studentFinanceId(initialAccount?.student) === nextStudent ? initialAccount || null : null)
        operationKey.current = createIdempotencyKey("payment")
    }, [open, initialStudentId, initialAccount])

    useEffect(() => {
        if (!open || !studentId) {
            setStudentAccount(null)
            return
        }
        if (studentFinanceId(studentAccount?.student) === studentId) return
        let active = true
        setAccountLoading(true)
        financeApi.getStudentAccount(studentId)
            .then(result => {
                if (!active) return
                if (!result.success) throw new Error(result.error || "Could not load account")
                setStudentAccount(result.account)
            })
            .catch(error => {
                if (active) toast.error(financeErrorMessage(error, "Could not load account"))
            })
            .finally(() => { if (active) setAccountLoading(false) })
        return () => { active = false }
    }, [open, studentId, studentAccount])

    const allocationEntries = useMemo(
        () => (studentAccount?.open_items || []).map(item => ({
            item,
            obligationId: item.obligation_id || item.id,
            amount: Number(allocationAmounts[item.obligation_id || item.id] || 0),
        })).filter(entry => entry.amount > 0),
        [studentAccount?.open_items, allocationAmounts],
    )
    const allocatedAmount = useMemo(
        () => allocationEntries.reduce((total, entry) => total + entry.amount, 0),
        [allocationEntries],
    )
    const paymentAmount = Number(amount) || 0
    const allocationComplete = paymentAmount > 0 && Math.abs(allocatedAmount - paymentAmount) < 0.005

    async function submit(event: React.FormEvent) {
        event.preventDefault()
        if (!studentId || Number(amount) <= 0) return
        if (method !== "cash" && !paymentAccountId) return
        setSaving(true)
        try {
            const result = await financeApi.recordPayment({
                student_id: studentId,
                amount: decimalMoney(amount),
                method,
                date: paymentDate,
                payment_account_id: method === "cash" ? undefined : paymentAccountId,
                reference_number: reference.trim() || undefined,
                notes: notes.trim() || undefined,
                allocations: allocationEntries.map(({ obligationId, amount: allocationAmount }) => ({
                    obligation_id: obligationId,
                    amount: decimalMoney(allocationAmount),
                })),
                idempotency_key: operationKey.current || (operationKey.current = createIdempotencyKey("payment")),
            })
            if (!result.success) throw new Error(result.error || "Could not record payment")
            toast.success(result.message || "Payment recorded")
            operationKey.current = ""
            await onSuccess(result.account)
            onOpenChange(false)
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not record payment"))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side={side} className={actionSheetClass(side)}>
                <SheetHeader className="border-b border-slate-200 px-5 pb-4 pt-6 text-left dark:border-slate-800">
                    <SheetTitle>Collect payment</SheetTitle>
                    <SheetDescription>Choose which due items receive this payment. The server verifies the final allocation.</SheetDescription>
                </SheetHeader>
                <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
                        <ActionStudentSelect students={students} value={studentId} onChange={value => { setStudentId(value); setStudentAccount(null); setAllocationAmounts({}) }} />
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="payment-amount">Amount received</Label>
                                <Input id="payment-amount" inputMode="decimal" type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-date">Payment date</Label>
                                <Input id="payment-date" type="date" required value={paymentDate} onChange={event => setPaymentDate(event.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-method">Method</Label>
                                <select id="payment-method" value={method} onChange={event => { setMethod(event.target.value); setPaymentAccountId("") }} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                    <option value="cash">Cash</option>
                                    <option value="upi">UPI</option>
                                    <option value="bank">Bank transfer</option>
                                </select>
                            </div>
                        </div>
                        {method !== "cash" && (
                            <div className="space-y-2">
                                <Label htmlFor="receiving-account">Receiving account</Label>
                                <select id="receiving-account" required value={paymentAccountId} onChange={event => setPaymentAccountId(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                    <option value="">Choose account</option>
                                    {accounts.filter(account => account.is_active !== false && account.account_type === method).map(account => (
                                        <option key={account.id} value={account.id}>{account.account_name || account.account_holder || account.account_type}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="payment-reference">Receipt / reference</Label>
                                <Input id="payment-reference" value={reference} onChange={event => setReference(event.target.value)} placeholder="Optional" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="payment-notes">Notes</Label>
                                <Input id="payment-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Optional" />
                            </div>
                        </div>

                        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Manual payment allocation</p>
                                    <p className="text-xs text-slate-500">Enter the amount to apply to each due item.</p>
                                </div>
                                {accountLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                            </div>
                            {!studentId ? (
                                <p className="mt-4 text-sm text-slate-500">Choose a student to allocate their payment.</p>
                            ) : !(studentAccount?.open_items || []).length ? (
                                <p className="mt-4 text-sm text-slate-500">This student has no outstanding due items.</p>
                            ) : (
                                <div className="mt-4 space-y-2">
                                    {(studentAccount?.open_items || []).map(item => {
                                        const obligationId = item.obligation_id || item.id
                                        return (
                                        <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-slate-950">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold text-slate-800 dark:text-slate-200">{item.description}</p>
                                                <p className="text-xs text-slate-500">Due {shortDate(item.due_date || item.month)} · balance {money(item.balance)}</p>
                                            </div>
                                            <Input
                                                aria-label={`Amount for ${item.description}`}
                                                className="h-9 w-28 shrink-0 text-right"
                                                inputMode="decimal"
                                                type="number"
                                                min="0"
                                                max={item.balance}
                                                step="0.01"
                                                value={allocationAmounts[obligationId] || ""}
                                                onChange={event => setAllocationAmounts(current => ({ ...current, [obligationId]: event.target.value }))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    )})}
                                    <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${allocationComplete ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"}`}>
                                        <span className="flex items-center gap-2">{allocationComplete && <CheckCircle2 className="h-4 w-4" />} Allocated</span>
                                        <span>{money(allocatedAmount)} of {money(paymentAmount)}</span>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                    <SheetFooter className="border-t border-slate-200 p-4 dark:border-slate-800">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={saving || accountLoading || !studentId || !allocationComplete || (method !== "cash" && !paymentAccountId)} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                            {saving ? "Recording…" : "Record payment"}
                        </Button>
                    </SheetFooter>
                </form>
            </SheetContent>
        </Sheet>
    )
}
