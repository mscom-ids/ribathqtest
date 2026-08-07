"use client"

import { useEffect, useState } from "react"
import { Ban, CalendarClock, CreditCard, FileText, Loader2, Plus, ReceiptText, RotateCcw, WalletCards } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import type { FinanceOpenItem, FinancePayment, StudentFinanceAccount } from "@/lib/finance-api"
import { financeApi, financeErrorMessage, studentFinanceId } from "@/lib/finance-api"
import { money, shortDate, shortDateTime, summaryValue } from "./finance-utils"

type AccountTab = "open" | "payments" | "rule"
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
    onAction: (action: "charge" | "payment", studentId: string) => void
    onCorrectionSuccess: (studentId: string) => Promise<void> | void
}) {
    const [tab, setTab] = useState<AccountTab>("open")
    const [isDesktop, setIsDesktop] = useState(false)
    const [correction, setCorrection] = useState<CorrectionTarget>(null)
    const [correctionReason, setCorrectionReason] = useState("")
    const [correctionSaving, setCorrectionSaving] = useState(false)

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

    function openCorrection(target: Exclude<CorrectionTarget, null>) {
        setCorrection(target)
        setCorrectionReason("")
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
                        </SheetHeader>

                        <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                            <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                                {([
                                    ["open", "Open items", FileText],
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
                                        const canVoid = canManageCorrections && obligationType !== "monthly_fee" && Number(item.paid_amount || 0) === 0
                                        return (
                                        <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-bold text-slate-900 dark:text-white">{item.description}</p>
                                                        <Badge variant="outline" className="capitalize">{item.type.replaceAll("_", " ")}</Badge>
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">Due {shortDate(item.due_date || item.month)}</p>
                                                </div>
                                                 <div className="shrink-0 text-right">
                                                     <p className="font-black text-rose-600 dark:text-rose-300">{money(item.balance)}</p>
                                                     {Number(item.paid_amount || 0) > 0 && <p className="text-xs text-emerald-600">Paid {money(item.paid_amount)}</p>}
                                                     {canVoid && (
                                                         <Button type="button" variant="ghost" size="xs" className="mt-1 text-slate-500 hover:text-rose-700" onClick={() => openCorrection({ kind: "obligation", item })}>
                                                             <Ban className="h-3 w-3" /> Void
                                                         </Button>
                                                     )}
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
                                                        <Button type="button" variant="ghost" size="xs" className="mt-1 text-slate-500 hover:text-rose-700" onClick={() => openCorrection({ kind: "payment", payment })}>
                                                            <RotateCcw className="h-3 w-3" /> Reverse
                                                        </Button>
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
                        <DialogTitle>{correction?.kind === "payment" ? "Reverse payment" : "Void finance item"}</DialogTitle>
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
                            {correction?.kind === "payment" ? "Reverse payment" : "Void item"}
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
