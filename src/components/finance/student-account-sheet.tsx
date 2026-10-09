"use client"

import { useEffect, useState } from "react"
import { Ban, CalendarClock, CreditCard, FileText, Loader2, Pencil, Plus, ReceiptText, RotateCcw, Tag, WalletCards } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import type { ChargeCategory, FinanceOpenItem, FinancePayment, PaymentAccount, StudentFinanceAccount } from "@/lib/finance-api"
import { createIdempotencyKey, financeApi, financeErrorMessage, studentFinanceId } from "@/lib/finance-api"
import { currentMonthValue, money, shortDate, shortDateTime, summaryValue } from "./finance-utils"

type AccountTab = "open" | "records" | "payments" | "rule"
type CorrectionTarget =
    | { kind: "payment"; payment: FinancePayment }
    | { kind: "obligation"; item: FinanceOpenItem }
    | null

export function StudentAccountSheet({
    open,
    onOpenChange,
    account,
    loading,
    canAddCharge,
    canCollectPayment,
    canManageCorrections,
    categories,
    paymentAccounts,
    onAction,
    onCorrectionSuccess,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    account: StudentFinanceAccount | null
    loading: boolean
    canAddCharge: boolean
    canCollectPayment: boolean
    canManageCorrections: boolean
    categories: ChargeCategory[]
    paymentAccounts: PaymentAccount[]
    onAction: (action: "charge" | "payment", studentId: string) => void
    onCorrectionSuccess: (studentId: string) => Promise<void> | void
}) {
    const [tab, setTab] = useState<AccountTab>("open")
    const [isDesktop, setIsDesktop] = useState(false)
    const [correction, setCorrection] = useState<CorrectionTarget>(null)
    const [correctionReason, setCorrectionReason] = useState("")
    const [correctionSaving, setCorrectionSaving] = useState(false)
    const [editing, setEditing] = useState<Exclude<CorrectionTarget, null> | null>(null)
    const [editReason, setEditReason] = useState("")
    const [editAmount, setEditAmount] = useState("")
    const [editDate, setEditDate] = useState("")
    const [editDescription, setEditDescription] = useState("")
    const [editCategoryId, setEditCategoryId] = useState("")
    const [editMethod, setEditMethod] = useState("cash")
    const [editAccountId, setEditAccountId] = useState("")
    const [editReceipt, setEditReceipt] = useState("")
    const [editNotes, setEditNotes] = useState("")
    const [editAllocations, setEditAllocations] = useState<Record<string, string>>({})
    const [editSaving, setEditSaving] = useState(false)
    const [discountOpen, setDiscountOpen] = useState(false)
    const [discountMonth, setDiscountMonth] = useState(currentMonthValue())
    const [discountType, setDiscountType] = useState<"amount" | "waiver">("amount")
    const [discountAmount, setDiscountAmount] = useState("")
    const [discountReason, setDiscountReason] = useState("")
    const [discountSaving, setDiscountSaving] = useState(false)

    useEffect(() => {
        const media = window.matchMedia("(min-width: 640px)")
        const update = () => setIsDesktop(media.matches)
        update()
        media.addEventListener("change", update)
        return () => media.removeEventListener("change", update)
    }, [])

    useEffect(() => {
        if (open) setTab("open")
    }, [open])

    const studentId = studentFinanceId(account?.student)
    const due = Number(account?.summary?.total_due ?? summaryValue(account?.summary, "outstanding", "pending"))
    const credit = Number(account?.summary?.credit_balance ?? account?.summary?.credits ?? 0)
    const publishedMonthlyDue = account?.obligation_history?.find(item => item.type === "monthly_fee"
        && item.status !== "void" && String(item.month || item.service_month || "").slice(0, 7) === discountMonth)
    const discountValue = Number(discountAmount)
    const discountedFee = publishedMonthlyDue && discountType === "amount"
        ? Math.max(0, Number(publishedMonthlyDue.amount) - (Number.isFinite(discountValue) ? discountValue : 0))
        : 0

    function openDiscount(month?: string | null) {
        setDiscountMonth(month ? String(month).slice(0, 7) : currentMonthValue())
        setDiscountType("amount")
        setDiscountAmount("")
        setDiscountReason("")
        setDiscountOpen(true)
    }

    async function submitDiscount(event: React.FormEvent) {
        event.preventDefault()
        if (!studentId || discountReason.trim().length < 3 || !discountMonth) return
        setDiscountSaving(true)
        try {
            const reason = `${discountType === "waiver" ? "Full monthly waiver" : "One-month discount"}: ${discountReason.trim()}`
            if (publishedMonthlyDue) {
                if (Number(publishedMonthlyDue.paid_amount || 0) > 0) throw new Error("Reverse the payment allocated to this month before applying a discount or waiver.")
                if (discountType === "amount" && (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue > Number(publishedMonthlyDue.amount))) {
                    throw new Error("Enter a discount greater than zero and no more than the published monthly fee.")
                }
                const correctedAmount = discountType === "waiver" ? 0 : discountedFee
                const result = await financeApi.correctPublishedMonthlyFee(publishedMonthlyDue.id, {
                    amount: correctedAmount.toFixed(2), reason, idempotency_key: createIdempotencyKey("monthly-discount"),
                })
                if (!result.success) throw new Error(result.error || "Could not apply monthly discount")
            } else {
                if (discountType === "amount" && (!Number.isFinite(discountValue) || discountValue <= 0)) {
                    throw new Error("Enter a discount greater than zero.")
                }
                const result = await financeApi.addStudentFeeAgreement({
                    student_id: studentId,
                    adjustment_type: discountType === "waiver" ? "waiver" : "discount_amount",
                    amount: discountType === "waiver" ? "0.00" : discountValue.toFixed(2),
                    effective_from: `${discountMonth}-01`,
                    effective_until: `${discountMonth}-01`,
                    reason,
                })
                if (!result.success) throw new Error(result.error || "Could not schedule monthly discount")
            }
            toast.success(publishedMonthlyDue ? "Published monthly fee corrected" : "One-month discount scheduled")
            setDiscountOpen(false)
            await onCorrectionSuccess(studentId)
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not apply monthly discount"))
        } finally {
            setDiscountSaving(false)
        }
    }

    function openCorrection(target: Exclude<CorrectionTarget, null>) {
        setCorrection(target)
        setCorrectionReason("")
    }

    function openEdit(target: Exclude<CorrectionTarget, null>) {
        setEditing(target)
        setEditReason("")
        if (target.kind === "obligation") {
            setEditAmount(String(target.item.amount))
            setEditDate(String(target.item.due_date || target.item.month || "").slice(0, 10))
            setEditDescription(target.item.description)
            setEditCategoryId(target.item.category_id || "")
        } else {
            const payment = target.payment
            setEditAmount(String(payment.amount))
            setEditDate(String(payment.date || "").slice(0, 10))
            setEditMethod(payment.payment_method || payment.method || "cash")
            setEditAccountId(payment.payment_account_id || "")
            setEditReceipt(payment.receipt_number || payment.reference_number || "")
            setEditNotes(payment.notes || "")
            setEditAllocations(Object.fromEntries((payment.allocations || []).map(item => [item.obligation_id || item.item_id || item.open_item_id || "", String(item.amount)])))
        }
    }

    async function submitEdit(event: React.FormEvent) {
        event.preventDefault()
        if (!editing || !studentId || editReason.trim().length < 3) return
        setEditSaving(true)
        try {
            const result = editing.kind === "obligation" && editing.item.type === "monthly_fee"
                ? await financeApi.correctPublishedMonthlyFee(editing.item.id, {
                    amount: editAmount, reason: editReason.trim(), idempotency_key: createIdempotencyKey("monthly-fee-correction"),
                })
                : editing.kind === "obligation"
                ? await financeApi.replaceCharge(editing.item.id, {
                    category_id: editCategoryId, amount: editAmount, date: editDate, due_date: editDate,
                    description: editDescription, reason: editReason.trim(), idempotency_key: createIdempotencyKey("charge-edit"),
                })
                : await financeApi.replacePayment(editing.payment.id, {
                    amount: editAmount, method: editMethod, payment_account_id: editAccountId || undefined,
                    receipt_number: editReceipt || undefined, date: editDate, notes: editNotes || undefined,
                    allocations: Object.entries(editAllocations).filter(([, value]) => Number(value) > 0)
                        .map(([obligation_id, amount]) => ({ obligation_id, amount })),
                    reason: editReason.trim(), idempotency_key: createIdempotencyKey("payment-edit"),
                })
            if (!result.success) throw new Error(result.error || "Could not edit finance record")
            toast.success(result.message || "Finance record edited")
            setEditing(null)
            await onCorrectionSuccess(studentId)
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not edit finance record"))
        } finally {
            setEditSaving(false)
        }
    }

    function closeCorrection() {
        if (correctionSaving) return
        setCorrection(null)
        setCorrectionReason("")
    }

    async function submitCorrection(event: React.FormEvent) {
        event.preventDefault()
        const reason = correctionReason.trim()
        if (!correction || !reason || !studentId) return
        setCorrectionSaving(true)
        try {
            const result = correction.kind === "payment"
                ? await financeApi.reversePayment(correction.payment.id, reason)
                : await financeApi.voidObligation(correction.item.obligation_id || correction.item.id, reason)
            if (!result.success) throw new Error(result.error || "Finance correction could not be recorded")
            toast.success(result.message || (correction.kind === "payment" ? "Payment reversed" : "Finance item voided"))
            setCorrection(null)
            setCorrectionReason("")
            await onCorrectionSuccess(studentId)
        } catch (error) {
            toast.error(financeErrorMessage(error, "Finance correction could not be recorded"))
        } finally {
            setCorrectionSaving(false)
        }
    }

    return (
        <>
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side={isDesktop ? "right" : "bottom"}
                className={isDesktop
                    ? "flex h-full w-full flex-col gap-0 border-slate-200 bg-white p-0 sm:max-w-xl dark:border-slate-800 dark:bg-slate-950"
                    : "flex max-h-[92vh] flex-col gap-0 rounded-t-3xl border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950"
                }
            >
                {loading ? (
                    <div className="flex min-h-80 flex-1 items-center justify-center">
                        <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                    </div>
                ) : !account ? (
                    <div className="flex min-h-80 flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">
                        Student account could not be loaded.
                    </div>
                ) : (
                    <>
                        <SheetHeader className="border-b border-slate-200 px-5 pb-5 pt-6 text-left dark:border-slate-800">
                            <div className="pr-8">
                                <SheetTitle className="text-xl font-black text-slate-950 dark:text-white">{account.student.name}</SheetTitle>
                                <SheetDescription className="mt-1">
                                    {studentId}{account.student.standard ? ` · ${account.student.standard}` : ""}
                                </SheetDescription>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/30">
                                    <p className="text-xs font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">Outstanding</p>
                                    <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-200">{money(due)}</p>
                                </div>
                                <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
                                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">Credit</p>
                                    <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-200">{money(credit)}</p>
                                </div>
                            </div>
                            {canManageCorrections && <Button type="button" variant="outline" size="sm" className="mt-3 w-full gap-2 border-blue-200 text-blue-700" onClick={() => openDiscount()}>
                                <Tag className="h-4 w-4" /> Monthly discount / waiver
                            </Button>}
                        </SheetHeader>

                        <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                                {([
                                    ["open", "Open items", FileText],
                                    ["records", "Records", ReceiptText],
                                    ["payments", "Payments", ReceiptText],
                                    ["rule", "Fee rule", CalendarClock],
                                ] as const).map(([value, label, Icon]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setTab(value)}
                                        className={`inline-flex h-9 flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition ${tab === value
                                            ? "bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-white"
                                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" /> {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                            {tab === "open" && (
                                <div className="space-y-3">
                                    {!account.open_items?.length ? (
                                        <EmptyState icon={WalletCards} title="Nothing pending" description="This student has no open fee or charge items." />
                                    ) : account.open_items.map(item => {
                                        const obligationType = item.obligation_type || item.type
                                        const isUnpaidCharge = canManageCorrections && obligationType === "charge" && Number(item.paid_amount || 0) === 0
                                        return (
                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-bold text-slate-900 dark:text-white">{item.description}</p>
                                                        <Badge variant="outline" className="capitalize">{item.type.replaceAll("_", " ")}</Badge>
                                                        <Badge variant="outline" className={Number(item.paid_amount || 0) > 0 ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-600"}>
                                                            {Number(item.paid_amount || 0) > 0 ? "Part-paid" : "Unpaid"}
                                                        </Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">Due {shortDate(item.due_date || item.month)}</p>
                                                </div>
                                                 <div className="shrink-0 text-right">
                                                     <p className="font-black text-rose-600 dark:text-rose-300">{money(item.balance)}</p>
                                                     {Number(item.paid_amount || 0) > 0 && <p className="text-xs text-emerald-600">Paid {money(item.paid_amount)}</p>}
                                                     {isUnpaidCharge && (
                                                         <div className="mt-1 flex justify-end gap-1">
                                                             <Button type="button" variant="ghost" size="xs" onClick={() => openEdit({ kind: "obligation", item })}><Pencil className="h-3 w-3" /> Edit</Button>
                                                             <Button type="button" variant="ghost" size="xs" className="text-rose-700" onClick={() => openCorrection({ kind: "obligation", item })}><Ban className="h-3 w-3" /> Delete</Button>
                                                         </div>
                                                     )}
                                                     {canManageCorrections && obligationType === "monthly_fee" && <Button type="button" variant="ghost" size="xs" className="mt-1 text-blue-700" onClick={() => openDiscount(item.month)}>
                                                         <Tag className="h-3 w-3" /> Discount / waive
                                                     </Button>}
                                                 </div>
                                             </div>
                                         </div>
                                        )
                                    })}
                                </div>
                            )}

                            {tab === "payments" && (
                                <div className="space-y-3">
                                    {!account.payments?.length ? (
                                        <EmptyState icon={CreditCard} title="No payments yet" description="Recorded payments and allocations will appear here." />
                                    ) : account.payments.map(payment => {
                                        const reversed = payment.status === "reversed"
                                        const canReverse = canManageCorrections && payment.status === "posted" && payment.allocation_status === "strict"
                                        const canEditPayment = canReverse
                                            && Math.abs((payment.allocations || []).reduce((sum, item) => sum + Number(item.amount || 0), 0) - Number(payment.amount)) < 0.005
                                            && (payment.allocations || []).every(allocation => account.obligation_history?.some(item => item.id === (allocation.obligation_id || allocation.item_id || allocation.open_item_id)))
                                        return (
                                        <div key={payment.id} className={`rounded-2xl border p-4 ${reversed ? "border-rose-200 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-bold text-slate-900 dark:text-white">{payment.payment_method || payment.method || "Payment"}</p>
                                                        <Badge variant={reversed ? "destructive" : "outline"} className={reversed ? "" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}>
                                                            {reversed ? "Reversed" : "Posted"}
                                                        </Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">{shortDateTime(payment.created_at || payment.date)}</p>
                                                    {(payment.receipt_number || payment.reference_number) && (
                                                        <p className="mt-1 text-xs text-slate-500">Receipt #{payment.receipt_number || payment.reference_number}</p>
                                                    )}
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={`font-black ${reversed ? "text-rose-700 line-through dark:text-rose-300" : "text-emerald-600 dark:text-emerald-300"}`}>{money(payment.amount)}</p>
                                                    {canReverse && (
                                                        <div className="mt-1 flex justify-end gap-1">
                                                            {canEditPayment && <Button type="button" variant="ghost" size="xs" onClick={() => openEdit({ kind: "payment", payment })}><Pencil className="h-3 w-3" /> Correct payment</Button>}
                                                            <Button type="button" variant="ghost" size="xs" className="text-rose-700" onClick={() => openCorrection({ kind: "payment", payment })}><Ban className="h-3 w-3" /> Delete</Button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {reversed && payment.reversal_reason && <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-rose-700 dark:bg-slate-950/40 dark:text-rose-300">Reason: {payment.reversal_reason}</p>}
                                            {!!payment.allocations?.length && (
                                                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                                                    <p className="mb-1 font-semibold text-slate-500">{reversed ? "Original allocations (restored)" : "Allocations"}</p>
                                                    {payment.allocations.map((allocation, index) => (
                                                        <div key={allocation.id || `${payment.id}-${index}`} className={`flex justify-between gap-4 text-slate-500 ${reversed ? "line-through" : ""}`}>
                                                            <span className="truncate">{allocation.description || "Allocated item"}</span>
                                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{money(allocation.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        )
                                    })}
                                </div>
                            )}

                            {tab === "records" && (
                                <div className="space-y-3">
                                    {!account.obligation_history?.length ? (
                                        <EmptyState icon={ReceiptText} title="No finance records" description="Charges and published dues will appear here." />
                                    ) : account.obligation_history.map(item => {
                                        const isCharge = item.type === "charge"
                                        const canCorrect = canManageCorrections && (isCharge || item.type === "monthly_fee") && item.status !== "void" && Number(item.paid_amount || 0) === 0
                                        return <div key={item.id} className={`rounded-2xl border p-4 ${item.status === "void" ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-slate-900">{item.description}</p>
                                                    <p className="mt-1 text-xs text-slate-500">{item.category_name || item.type.replaceAll("_", " ")} · {shortDate(item.due_date || item.month)} · {item.status}</p>
                                                    {item.void_reason && <p className="mt-2 text-xs text-rose-700">Correction: {item.void_reason}</p>}
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={item.status === "void" ? "font-bold text-slate-500 line-through" : "font-bold text-slate-900"}>{money(item.amount)}</p>
                                                    {canCorrect && <div className="mt-1 flex gap-1">
                                                        <Button type="button" size="xs" variant="ghost" onClick={() => openEdit({ kind: "obligation", item })}><Pencil className="h-3 w-3" /> {isCharge ? "Edit" : "Correct"}</Button>
                                                        {isCharge && <Button type="button" size="xs" variant="ghost" className="text-rose-700" onClick={() => openCorrection({ kind: "obligation", item })}><Ban className="h-3 w-3" /> Delete</Button>}
                                                    </div>}
                                                    {canManageCorrections && (isCharge || item.type === "monthly_fee") && item.status !== "void" && Number(item.paid_amount || 0) > 0 &&
                                                        <p className="mt-1 max-w-36 text-xs text-slate-500">Reverse allocated payment first</p>}
                                                </div>
                                            </div>
                                        </div>
                                    })}
                                </div>
                            )}

                            {tab === "rule" && (
                                account.active_fee_rule ? (
                                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
                                        <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Active monthly fee</p>
                                        <p className="mt-2 text-3xl font-black text-blue-950 dark:text-blue-100">{money(account.active_fee_rule.amount)}</p>
                                        <p className="mt-2 font-semibold text-blue-900 dark:text-blue-200">{account.active_fee_rule.label || account.active_fee_rule.source || "Current fee rule"}</p>
                                        <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">Effective from {shortDate(account.active_fee_rule.effective_from)}</p>
                                        <p className="mt-4 text-xs leading-relaxed text-blue-700/80 dark:text-blue-300/80">Published monthly dues remain unchanged when a future fee revision is added.</p>
                                    </div>
                                ) : <EmptyState icon={CalendarClock} title="No active fee rule" description="Create a base schedule or individual agreement in Setup." />
                            )}
                        </div>

                        {(canAddCharge || canCollectPayment) && (
                            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                                {canAddCharge && (
                                    <Button variant="outline" className="gap-2" onClick={() => onAction("charge", studentId)}>
                                        <Plus className="h-4 w-4" /> Add charge
                                    </Button>
                                )}
                                {canCollectPayment && (
                                    <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onAction("payment", studentId)}>
                                        <CreditCard className="h-4 w-4" /> Collect payment
                                    </Button>
                                )}
                            </div>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
        <Dialog open={Boolean(correction)} onOpenChange={nextOpen => { if (!nextOpen) closeCorrection() }}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submitCorrection} className="space-y-5">
                    <DialogHeader>
                        <DialogTitle>{correction?.kind === "payment" ? "Delete payment" : "Delete finance item"}</DialogTitle>
                        <DialogDescription>
                            {correction?.kind === "payment"
                                ? "The payment allocations will be restored as pending. The original payment remains in the audit history as reversed."
                                : "The unpaid item will be removed from pending totals. The original item remains in the audit history as voided."}
                        </DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">Reason</span>
                        <Textarea required minLength={3} maxLength={500} rows={3} value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} placeholder="Explain why this correction is required" />
                    </label>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={correctionSaving} onClick={closeCorrection}>Cancel</Button>
                        <Button type="submit" variant="destructive" disabled={correctionSaving || correctionReason.trim().length < 3}>
                            {correctionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : correction?.kind === "payment" ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                            {correction?.kind === "payment" ? "Reverse and remove" : "Void and remove"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        <Dialog open={discountOpen} onOpenChange={nextOpen => { if (!discountSaving) setDiscountOpen(nextOpen) }}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={submitDiscount} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Monthly discount or waiver</DialogTitle>
                        <DialogDescription>Give this student a discount for one month, such as an approved absence for vacation or illness. This does not change other months.</DialogDescription>
                    </DialogHeader>
                    <label className="block space-y-1 text-sm font-semibold">Month
                        <Input required type="month" value={discountMonth} onChange={event => setDiscountMonth(event.target.value)} />
                    </label>
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                        {publishedMonthlyDue
                            ? `Published fee: ${money(publishedMonthlyDue.amount)}${Number(publishedMonthlyDue.paid_amount || 0) > 0 ? ` · already paid ${money(publishedMonthlyDue.paid_amount)}` : ""}`
                            : "This month has not been published. The discount will apply when monthly fees are published."}
                    </p>
                    <label className="block space-y-1 text-sm font-semibold">Adjustment
                        <select className="h-10 w-full rounded-lg border px-3" value={discountType} onChange={event => setDiscountType(event.target.value as "amount" | "waiver")}>
                            <option value="amount">Discount by an amount</option>
                            <option value="waiver">Waive the full monthly fee</option>
                        </select>
                    </label>
                    {discountType === "amount" && <label className="block space-y-1 text-sm font-semibold">Discount amount
                        <Input required type="number" min="0.01" max={publishedMonthlyDue ? Number(publishedMonthlyDue.amount) : undefined} step="0.01" value={discountAmount} onChange={event => setDiscountAmount(event.target.value)} placeholder="e.g. 3000" />
                    </label>}
                    {publishedMonthlyDue && discountType === "amount" && discountValue > 0 &&
                        <p className="text-sm font-semibold text-blue-700">Corrected monthly fee: {money(discountedFee)}</p>}
                    <label className="block space-y-1 text-sm font-semibold">Reason
                        <Textarea required minLength={3} maxLength={440} value={discountReason} onChange={event => setDiscountReason(event.target.value)} placeholder="Vacation, illness, or other approved reason" />
                    </label>
                    {publishedMonthlyDue && Number(publishedMonthlyDue.paid_amount || 0) > 0 &&
                        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This month has a payment allocated to it. Reverse that payment in the Payments tab before changing the published fee, then record it against the corrected fee.</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={discountSaving} onClick={() => setDiscountOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={discountSaving || discountReason.trim().length < 3 || (publishedMonthlyDue && Number(publishedMonthlyDue.paid_amount || 0) > 0) || (discountType === "amount" && (!Number.isFinite(discountValue) || discountValue <= 0 || Boolean(publishedMonthlyDue && discountValue > Number(publishedMonthlyDue.amount))))}>
                            {discountSaving && <Loader2 className="h-4 w-4 animate-spin" />} {publishedMonthlyDue ? "Apply correction" : "Schedule discount"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        <Dialog open={Boolean(editing)} onOpenChange={nextOpen => { if (!nextOpen && !editSaving) setEditing(null) }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitEdit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>{editing?.kind === "payment" ? "Edit payment" : editing?.item.type === "monthly_fee" ? "Correct published monthly due" : "Edit charge"}</DialogTitle>
                        <DialogDescription>The original entry is retained as reversed or voided. The corrected entry is posted atomically with an audit reason.</DialogDescription>
                    </DialogHeader>
                    {editing?.kind === "obligation" && editing.item.type !== "monthly_fee" && <>
                        <label className="block space-y-1 text-sm font-semibold">Category
                            <select required className="h-10 w-full rounded-lg border px-3" value={editCategoryId} onChange={event => setEditCategoryId(event.target.value)}>
                                {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                        </label>
                        <label className="block space-y-1 text-sm font-semibold">Description
                            <Textarea required maxLength={500} value={editDescription} onChange={event => setEditDescription(event.target.value)} />
                        </label>
                    </>}
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block space-y-1 text-sm font-semibold">Amount
                            <Input required type="number" min={editing?.kind === "obligation" && editing.item.type === "monthly_fee" ? "0" : "0.01"} step="0.01" value={editAmount} onChange={event => setEditAmount(event.target.value)} />
                        </label>
                        <label className="block space-y-1 text-sm font-semibold">{editing?.kind === "payment" ? "Payment date" : "Due date"}
                            <Input required type="date" value={editDate} onChange={event => setEditDate(event.target.value)} />
                        </label>
                    </div>
                    {editing?.kind === "obligation" && editing.item.type === "monthly_fee" &&
                        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This changes only this student’s published fee for {shortDate(editing.item.month)}. The original bill remains in history. Use ₹0 for a full waiver.</p>}
                    {editing?.kind === "payment" && <>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block space-y-1 text-sm font-semibold">Method
                                <select className="h-10 w-full rounded-lg border px-3" value={editMethod} onChange={event => { setEditMethod(event.target.value); setEditAccountId("") }}>
                                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option>
                                </select>
                            </label>
                            {editMethod !== "cash" && <label className="block space-y-1 text-sm font-semibold">Receiving account
                                <select required className="h-10 w-full rounded-lg border px-3" value={editAccountId} onChange={event => setEditAccountId(event.target.value)}>
                                    <option value="">Choose account</option>
                                    {paymentAccounts.filter(account => account.account_type === editMethod || account.id === editAccountId).map(account =>
                                        <option key={account.id} value={account.id}>{account.account_holder || account.account_name || account.account_type}</option>)}
                                </select>
                            </label>}
                        </div>
                        <label className="block space-y-1 text-sm font-semibold">Receipt / reference
                            <Input value={editReceipt} onChange={event => setEditReceipt(event.target.value)} />
                        </label>
                        <label className="block space-y-1 text-sm font-semibold">Notes
                            <Textarea value={editNotes} onChange={event => setEditNotes(event.target.value)} />
                        </label>
                        <div className="space-y-2 rounded-xl border bg-slate-50 p-3">
                            <p className="text-sm font-bold">Payment allocation</p>
                            {(account?.obligation_history || []).filter(item => item.status !== "void" && Number(item.balance) >= 0).map(item => {
                                const originalAllocation = Number(editing.payment.allocations?.find(allocation =>
                                    (allocation.obligation_id || allocation.item_id || allocation.open_item_id) === item.id)?.amount || 0)
                                return <label key={item.id} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="min-w-0 truncate">{item.description} · available {money(Number(item.balance) + originalAllocation)}</span>
                                    <Input className="h-9 w-24 shrink-0" aria-label={`Allocation for ${item.description}`} type="number" min="0" max={Number(item.balance) + originalAllocation} step="0.01"
                                        value={editAllocations[item.id] || ""} onChange={event => setEditAllocations(current => ({ ...current, [item.id]: event.target.value }))} />
                                </label>
                            })}
                            <p className="text-xs text-slate-600">Allocated {money(Object.values(editAllocations).reduce((sum, value) => sum + (Number(value) || 0), 0))} of {money(Number(editAmount) || 0)}</p>
                        </div>
                    </>}
                    <label className="block space-y-1 text-sm font-semibold">Reason for edit
                        <Textarea required minLength={3} maxLength={500} rows={2} value={editReason} onChange={event => setEditReason(event.target.value)} placeholder="Why is this correction needed?" />
                    </label>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={editSaving} onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="submit" disabled={editSaving || editReason.trim().length < 3 || (editing?.kind === "payment" && Math.abs(Object.values(editAllocations).reduce((sum, value) => sum + (Number(value) || 0), 0) - (Number(editAmount) || 0)) > 0.005)}>
                            {editSaving && <Loader2 className="h-4 w-4 animate-spin" />} Save correction
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        </>
    )
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof WalletCards; title: string; description: string }) {
    return (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 text-center dark:border-slate-800">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-900">
                <Icon className="h-5 w-5" />
            </span>
            <p className="font-bold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>
        </div>
    )
}
