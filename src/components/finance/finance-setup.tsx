"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
    Banknote,
    CalendarCheck2,
    CheckCircle2,
    ClipboardList,
    IndianRupee,
    Loader2,
    Plus,
    ShieldCheck,
    Tag,
    UserRoundCog,
    X,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    createIdempotencyKey,
    decimalMoney,
    financeApi,
    financeErrorMessage,
    studentFinanceId,
    type FinancePermission,
    type FinanceSetup,
    type FinanceStudentBalance,
    type OpeningBalanceInput,
    type StudentFeeAgreementInput,
} from "@/lib/finance-api"
import { currentMonthValue, money, nextMonthValue, shortDate, todayValue } from "./finance-utils"
import { SearchableSelect } from "./searchable-select"

type SetupSection = "billing" | "rules" | "access" | "opening"

function billingDueDate(month: string) {
    return month + "-10"
}

export function FinanceSetupPanel({
    month,
    setup,
    students,
    onRefresh,
}: {
    month: string
    setup: FinanceSetup
    students: FinanceStudentBalance[]
    onRefresh: () => Promise<void> | void
}) {
    const [section, setSection] = useState<SetupSection>("billing")

    return (
        <div className="space-y-5">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-950">
                {([
                    ["billing", "Monthly billing", CalendarCheck2],
                    ["rules", "Fee rules", IndianRupee],
                    ["access", "Categories & access", ShieldCheck],
                    ["opening", "Opening balances", ClipboardList],
                ] as const).map(([value, label, Icon]) => (
                    <button
                        type="button"
                        key={value}
                        onClick={() => setSection(value)}
                        className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${section === value
                            ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                        }`}
                    >
                        <Icon className="h-4 w-4" /> {label}
                    </button>
                ))}
            </div>

            {section === "billing" && <MonthlyBillingSection month={month} onRefresh={onRefresh} />}
            {section === "rules" && <FeeRulesSection setup={setup} students={students} onRefresh={onRefresh} />}
            {section === "access" && <AccessSection setup={setup} onRefresh={onRefresh} />}
            {section === "opening" && <OpeningBalanceSection students={students} categories={setup.categories || []} onRefresh={onRefresh} />}
        </div>
    )
}

function MonthlyBillingSection({ month, onRefresh }: { month: string; onRefresh: () => Promise<void> | void }) {
    const [previewing, setPreviewing] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
    const [confirmingPublish, setConfirmingPublish] = useState(false)
    const [dueDate, setDueDate] = useState(billingDueDate(month))
    const publishKey = useRef("")

    useEffect(() => {
        setPreview(null)
        setConfirmingPublish(false)
        setDueDate(billingDueDate(month))
        publishKey.current = ""
    }, [month])

    async function loadPreview() {
        setPreviewing(true)
        try {
            const result = await financeApi.previewMonthlyFees(month)
            if (!result.success) throw new Error(result.error || "Could not preview monthly fees")
            const raw = result.preview ?? result.data ?? result
            setPreview(typeof raw === "object" && raw ? raw as Record<string, unknown> : {})
            setConfirmingPublish(false)
            publishKey.current = createIdempotencyKey("monthly-fees")
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not preview monthly fees"))
        } finally {
            setPreviewing(false)
        }
    }

    async function publish() {
        if (!preview) return
        setPublishing(true)
        try {
            const result = await financeApi.publishMonthlyFees(month, dueDate, publishKey.current || createIdempotencyKey("monthly-fees"))
            if (!result.success) throw new Error(result.error || "Could not publish monthly fees")
            toast.success(result.message || "Monthly fees published")
            setPreview(null)
            publishKey.current = ""
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not publish monthly fees"))
        } finally {
            setPublishing(false)
        }
    }

    const previewStudents = Number(preview?.student_count ?? preview?.students ?? preview?.to_create ?? 0)
    const previewTotal = Number(preview?.total_amount ?? preview?.total ?? 0)
    const previewExisting = Number(preview?.existing_count ?? preview?.existing ?? preview?.skipped ?? 0)
    const previewAdjusted = Number(preview?.exception_count ?? preview?.adjusted ?? 0)
    const previewUnconfigured = Number(preview?.unconfigured_count ?? preview?.unconfigured ?? 0)

    return (
        <SetupCard icon={CalendarCheck2} title="Preview and publish monthly fees" description="Publishing is idempotent. Existing published, partial, and paid dues remain unchanged.">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Billing month</p>
                    <p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                    <p className="mt-1 text-sm text-slate-500">Fee schedules and individual agreements active for this month will be snapshotted.</p>
                    <div className="mt-3 max-w-xs space-y-1.5">
                        <Label htmlFor="monthly-fee-due-date">Payment due date</Label>
                        <Input id="monthly-fee-due-date" type="date" required min={month + "-01"} value={dueDate} onChange={event => setDueDate(event.target.value)} />
                    </div>
                </div>
                <Button variant="outline" onClick={loadPreview} disabled={previewing} className="gap-2">
                    {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Preview
                </Button>
            </div>
            {preview && (
                <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                        <PreviewMetric label="New dues" value={previewStudents} />
                        <PreviewMetric label="Total" value={money(previewTotal)} />
                        <PreviewMetric label="Individual rules" value={previewAdjusted} />
                        <PreviewMetric label="Already exists" value={previewExisting} />
                        <PreviewMetric label="No fee rule" value={previewUnconfigured} />
                    </div>
                    {previewUnconfigured > 0 && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                            Publishing is blocked: {previewUnconfigured} student{previewUnconfigured === 1 ? "" : "s"} have no active fee rule for this month.
                        </div>
                    )}
                    <div className="mt-4 border-t border-blue-200 pt-4 dark:border-blue-900/60">
                        {!confirmingPublish ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-blue-800 dark:text-blue-200">{previewUnconfigured > 0 ? "Add the missing fee rules, then preview again." : "Individual agreements are already included. Publishing will snapshot these amounts."}</p>
                                <Button onClick={() => setConfirmingPublish(true)} disabled={previewUnconfigured > 0} className="gap-2 bg-blue-600 text-white hover:bg-blue-700">
                                    <CheckCircle2 className="h-4 w-4" /> Review publish
                                </Button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
                                <p className="font-bold text-amber-950 dark:text-amber-100">Publish monthly fees for this month?</p>
                                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">This posts immutable student dues. Future fee revisions will not change these published amounts.</p>
                                <div className="mt-3 flex justify-end gap-2">
                                    <Button variant="outline" onClick={() => setConfirmingPublish(false)} disabled={publishing}>Go back</Button>
                                    <Button onClick={publish} disabled={publishing} className="gap-2 bg-amber-700 text-white hover:bg-amber-800">
                                        {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                        {publishing ? "Publishing…" : "Confirm publish"}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </SetupCard>
    )
}

function FeeRulesSection({ setup, students, onRefresh }: { setup: FinanceSetup; students: FinanceStudentBalance[]; onRefresh: () => Promise<void> | void }) {
    const [schedule, setSchedule] = useState({ name: "", amount: "", effective_from: nextMonthValue() })
    const [agreement, setAgreement] = useState({ student_id: "", adjustment_type: "fixed" as StudentFeeAgreementInput["adjustment_type"], amount: "", effective_from: currentMonthValue(), effective_until: "", reason: "" })
    const [saving, setSaving] = useState<"schedule" | "agreement" | null>(null)

    async function addSchedule(event: React.FormEvent) {
        event.preventDefault()
        setSaving("schedule")
        try {
            const result = await financeApi.addFeeSchedule({ ...schedule, effective_from: schedule.effective_from + "-01", scope_type: "institution", amount: decimalMoney(schedule.amount) })
            if (!result.success) throw new Error(result.error || "Could not add fee revision")
            toast.success(result.message || "Future fee revision added")
            setSchedule(current => ({ ...current, name: "", amount: "" }))
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add fee revision"))
        } finally {
            setSaving(null)
        }
    }

    async function addAgreement(event: React.FormEvent) {
        event.preventDefault()
        setSaving("agreement")
        try {
            const result = await financeApi.addStudentFeeAgreement({
                ...agreement,
                effective_from: agreement.effective_from + "-01",
                effective_until: agreement.effective_until ? agreement.effective_until + "-01" : undefined,
                amount: agreement.adjustment_type === "waiver" ? "0.00" : decimalMoney(agreement.amount),
            })
            if (!result.success) throw new Error(result.error || "Could not add agreement")
            toast.success(result.message || "Individual fee agreement added")
            setAgreement(current => ({ ...current, student_id: "", amount: "", reason: "" }))
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add agreement"))
        } finally {
            setSaving(null)
        }
    }

    return (
        <div className="grid gap-5 xl:grid-cols-2">
            <SetupCard icon={IndianRupee} title="Base fee revisions" description="Create a future effective revision. Historical schedules and published months are never edited.">
                <div className="mb-5 space-y-2">
                    {(setup.schedules || []).slice(0, 4).map(item => {
                        const starts = String(item.effective_from || "").slice(0, 10)
                        const ends = item.effective_until ? String(item.effective_until).slice(0, 10) : ""
                        const today = todayValue()
                        const isCurrent = item.is_active !== false && starts <= today && (!ends || ends >= today)
                        const isScheduled = item.is_active !== false && starts > today
                        return (
                            <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.name || item.label || "Base monthly fee"}</p>
                                    <p className="text-xs text-slate-500">From {shortDate(item.effective_from)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-black text-slate-950 dark:text-white">{money(item.amount)}</p>
                                    {isCurrent && <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Current</Badge>}
                                    {isScheduled && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Scheduled</Badge>}
                                </div>
                            </div>
                        )
                    })}
                    {!setup.schedules?.length && <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No fee schedule is configured.</p>}
                </div>
                <form onSubmit={addSchedule} className="grid gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">Add revision</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Monthly amount"><Input type="number" min="0.01" step="0.01" required value={schedule.amount} onChange={event => setSchedule({ ...schedule, amount: event.target.value })} /></Field>
                        <Field label="Effective from"><Input type="month" required value={schedule.effective_from} onChange={event => setSchedule({ ...schedule, effective_from: event.target.value })} /></Field>
                    </div>
                    <Field label="Label"><Input required value={schedule.name} onChange={event => setSchedule({ ...schedule, name: event.target.value })} placeholder="Example: 2027 base fee" /></Field>
                    <Button type="submit" disabled={saving === "schedule" || Number(schedule.amount) <= 0} className="justify-self-end gap-2">
                        {saving === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add revision
                    </Button>
                </form>
            </SetupCard>

            <SetupCard icon={UserRoundCog} title="Individual fee agreement" description="Use a dated agreement when a student pays more or less than the institution base fee.">
                <form onSubmit={addAgreement} className="grid gap-4">
                    <SearchableSelect
                        label="Student"
                        placeholder="Choose student"
                        searchPlaceholder="Search by name or ID..."
                        items={students.map(student => { const id = studentFinanceId(student); return { id, label: `${student.name} (${id})` } })}
                        value={agreement.student_id}
                        onChange={v => setAgreement({ ...agreement, student_id: v })}
                        required
                        inputClassName="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Agreement type">
                            <select
                                value={agreement.adjustment_type}
                                onChange={event => {
                                    const adjustmentType = event.target.value as StudentFeeAgreementInput["adjustment_type"]
                                    setAgreement({ ...agreement, adjustment_type: adjustmentType, amount: adjustmentType === "waiver" ? "0" : agreement.amount })
                                }}
                                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                            >
                                <option value="fixed">Fixed monthly fee</option>
                                <option value="discount_amount">₹ discount</option>
                                <option value="discount_percent">% discount</option>
                                <option value="surcharge">₹ surcharge</option>
                                <option value="waiver">Full waiver</option>
                            </select>
                        </Field>
                        <Field label={agreement.adjustment_type === "discount_percent" ? "Percentage" : "Amount"}>
                            <Input
                                type="number"
                                min={agreement.adjustment_type === "waiver" ? "0" : "0.01"}
                                max={agreement.adjustment_type === "discount_percent" ? "100" : undefined}
                                step="0.01"
                                required={agreement.adjustment_type !== "waiver"}
                                disabled={agreement.adjustment_type === "waiver"}
                                value={agreement.amount}
                                onChange={event => setAgreement({ ...agreement, amount: event.target.value })}
                            />
                        </Field>
                        <Field label="Starts"><Input type="month" required value={agreement.effective_from} onChange={event => setAgreement({ ...agreement, effective_from: event.target.value })} /></Field>
                        <Field label="Ends (optional)"><Input type="month" value={agreement.effective_until} onChange={event => setAgreement({ ...agreement, effective_until: event.target.value })} /></Field>
                    </div>
                    <Field label="Reason"><Textarea rows={3} required value={agreement.reason} onChange={event => setAgreement({ ...agreement, reason: event.target.value })} placeholder="Approved reason for this fee" /></Field>
                    <Button type="submit" disabled={saving === "agreement" || !agreement.student_id || (agreement.adjustment_type !== "waiver" && Number(agreement.amount) <= 0)} className="justify-self-end gap-2">
                        {saving === "agreement" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add agreement
                    </Button>
                </form>
            </SetupCard>
        </div>
    )
}

function AccessSection({ setup, onRefresh }: { setup: FinanceSetup; onRefresh: () => Promise<void> | void }) {
    const categories = setup.categories || []
    const [form, setForm] = useState({ staff_id: "", capability: "charge:create", student_scope: "assigned", max_amount: "" })
    const [saving, setSaving] = useState(false)
    const [revoking, setRevoking] = useState<string | null>(null)
    const [categoryForm, setCategoryForm] = useState({ name: "", description: "" })
    const [accountForm, setAccountForm] = useState({ account_holder: "", account_type: "upi" as "upi" | "bank", details: "" })
    const [configSaving, setConfigSaving] = useState<string | null>(null)

    const permissions = setup.permissions || []
    const permissionRows = useMemo(() => permissions.filter(permission => permission.is_active !== false), [permissions])

    async function grant(event: React.FormEvent) {
        event.preventDefault()
        setSaving(true)
        try {
            const result = await financeApi.grantPermission({
                staff_id: form.staff_id,
                capability: form.capability,
                student_scope: form.student_scope,
                amount_limit: form.max_amount ? decimalMoney(form.max_amount) : undefined,
            })
            if (!result.success) throw new Error(result.error || "Could not grant access")
            toast.success(result.message || "Finance access granted")
            setForm(current => ({ ...current, staff_id: "", max_amount: "" }))
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not grant access"))
        } finally {
            setSaving(false)
        }
    }

    async function addCategory(event: React.FormEvent) {
        event.preventDefault()
        if (!categoryForm.name.trim()) return
        setConfigSaving("category:new")
        try {
            const result = await financeApi.addCategory({
                name: categoryForm.name.trim(),
                description: categoryForm.description.trim() || undefined,
            })
            if (!result.success) throw new Error(result.error || "Could not add category")
            toast.success(result.message || "Charge category added")
            setCategoryForm({ name: "", description: "" })
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add category"))
        } finally {
            setConfigSaving(null)
        }
    }

    async function toggleCategory(categoryId: string, isActive: boolean) {
        if (!isActive && !window.confirm("Disable this charge category? Existing ledger items will remain unchanged.")) return
        setConfigSaving("category:" + categoryId)
        try {
            const result = await financeApi.toggleCategory(categoryId, isActive)
            if (!result.success) throw new Error(result.error || "Could not update category")
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not update category"))
        } finally {
            setConfigSaving(null)
        }
    }

    async function addAccount(event: React.FormEvent) {
        event.preventDefault()
        if (!accountForm.account_holder.trim()) return
        setConfigSaving("account:new")
        try {
            const result = await financeApi.addPaymentAccount({
                account_holder: accountForm.account_holder.trim(),
                account_type: accountForm.account_type,
                details: accountForm.details.trim() || undefined,
            })
            if (!result.success) throw new Error(result.error || "Could not add receiving account")
            toast.success(result.message || "Receiving account added")
            setAccountForm({ account_holder: "", account_type: "upi", details: "" })
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add receiving account"))
        } finally {
            setConfigSaving(null)
        }
    }

    async function toggleAccount(accountId: string, isActive: boolean) {
        if (!isActive && !window.confirm("Disable this receiving account? Existing payments will remain unchanged.")) return
        setConfigSaving("account:" + accountId)
        try {
            const result = await financeApi.togglePaymentAccount(accountId, isActive)
            if (!result.success) throw new Error(result.error || "Could not update receiving account")
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not update receiving account"))
        } finally {
            setConfigSaving(null)
        }
    }

    async function revoke(permission: FinancePermission) {
        setRevoking(permission.id)
        try {
            const result = await financeApi.revokePermission(permission.id)
            if (!result.success) throw new Error(result.error || "Could not revoke access")
            toast.success(result.message || "Access revoked")
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not revoke access"))
        } finally {
            setRevoking(null)
        }
    }

    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,.75fr)]">
            <SetupCard icon={ShieldCheck} title="Staff finance access" description="Grant each action once. A grant applies to every active charge category; student scope controls which students the staff member can handle.">
                <form onSubmit={grant} className="grid gap-3 rounded-2xl bg-slate-50 p-4 dark:bg-slate-900 sm:grid-cols-2">
                    <SearchableSelect
                        label="Staff"
                        placeholder="Choose staff"
                        searchPlaceholder="Search by name or role..."
                        items={(setup.staff || []).map(staff => ({ id: staff.id, label: `${staff.name}${staff.role ? ` · ${staff.role}` : ""}` }))}
                        value={form.staff_id}
                        onChange={v => setForm({ ...form, staff_id: v })}
                        required
                        inputClassName="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <Field label="Action">
                        <select value={form.capability} onChange={event => setForm({ ...form, capability: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                            <option value="charge:create">Add charge</option>
                            <option value="payment:collect">Collect payment</option>
                            <option value="ledger:view">View student ledger</option>
                        </select>
                    </Field>
                    <Field label="Student scope">
                        <select value={form.student_scope} onChange={event => setForm({ ...form, student_scope: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                            <option value="assigned">Assigned students only</option>
                            <option value="all">All students</option>
                        </select>
                    </Field>
                    <Field label="Maximum per entry (optional)"><Input type="number" min="0.01" step="0.01" value={form.max_amount} onChange={event => setForm({ ...form, max_amount: event.target.value })} /></Field>
                    <div className="flex items-end sm:justify-end"><Button type="submit" disabled={saving || !form.staff_id} className="w-full gap-2 sm:w-auto">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Grant access</Button></div>
                </form>

                <div className="mt-5 space-y-2">
                    {!permissionRows.length ? <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No staff finance grants yet.</p> : permissionRows.map(permission => (
                        <div key={permission.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-800">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{permission.staff_name || setup.staff?.find(staff => staff.id === permission.staff_id)?.name || "Staff"}</p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                    {permission.capability || (permission.can_collect_payment ? "Collect payment" : "Add charge")} · {permission.scope_type || permission.student_scope || "assigned"}
                                </p>
                            </div>
                            <Button size="icon" variant="ghost" aria-label="Revoke finance access" disabled={revoking === permission.id} onClick={() => revoke(permission)} className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30">
                                {revoking === permission.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                            </Button>
                        </div>
                    ))}
                </div>
            </SetupCard>

            <div className="space-y-5">
                <SetupCard icon={Tag} title="Charge categories" description="Define medical, laundry, store, programme, textbook, or any other ledger item.">
                    <details className="group mb-4 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                        <summary className="cursor-pointer text-sm font-bold text-blue-700 dark:text-blue-300">Add charge category</summary>
                        <form onSubmit={addCategory} className="mt-3 grid gap-3">
                            <Input required value={categoryForm.name} onChange={event => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Category name" />
                            <Textarea rows={2} value={categoryForm.description} onChange={event => setCategoryForm({ ...categoryForm, description: event.target.value })} placeholder="Optional description" />
                            <Button type="submit" size="sm" disabled={configSaving === "category:new" || !categoryForm.name.trim()} className="justify-self-end gap-2">
                                {configSaving === "category:new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                            </Button>
                        </form>
                    </details>
                    <div className="space-y-2">
                        {categories.map(category => (
                            <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{category.name}</p>
                                    <p className="text-xs text-slate-500">Available to staff with charge access</p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={configSaving === "category:" + category.id}
                                    onClick={() => toggleCategory(category.id, category.is_active === false)}
                                    className={category.is_active === false ? "text-slate-500" : "text-emerald-700"}
                                >
                                    {configSaving === "category:" + category.id ? <Loader2 className="h-4 w-4 animate-spin" /> : category.is_active === false ? "Enable" : "Disable"}
                                </Button>
                            </div>
                        ))}
                        {!categories.length && <p className="text-sm text-slate-500">No categories configured.</p>}
                    </div>
                </SetupCard>
                <SetupCard icon={Banknote} title="Receiving accounts" description="Manage UPI and bank destinations available during collection.">
                    <details className="group mb-4 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
                        <summary className="cursor-pointer text-sm font-bold text-blue-700 dark:text-blue-300">Add receiving account</summary>
                        <form onSubmit={addAccount} className="mt-3 grid gap-3">
                            <Input required value={accountForm.account_holder} onChange={event => setAccountForm({ ...accountForm, account_holder: event.target.value })} placeholder="Account holder or label" />
                            <select value={accountForm.account_type} onChange={event => setAccountForm({ ...accountForm, account_type: event.target.value as "upi" | "bank" })} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950">
                                <option value="upi">UPI</option>
                                <option value="bank">Bank</option>
                            </select>
                            <Textarea rows={2} value={accountForm.details} onChange={event => setAccountForm({ ...accountForm, details: event.target.value })} placeholder="UPI ID or account details" />
                            <Button type="submit" size="sm" disabled={configSaving === "account:new" || !accountForm.account_holder.trim()} className="justify-self-end gap-2">
                                {configSaving === "account:new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
                            </Button>
                        </form>
                    </details>
                    <div className="space-y-2">
                        {(setup.accounts || []).map(account => (
                            <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800">
                                <div className="min-w-0"><p className="truncate font-bold text-slate-900 dark:text-white">{account.account_name || account.account_holder || "Account"}</p><p className="text-xs uppercase text-slate-500">{account.account_type}</p></div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={configSaving === "account:" + account.id}
                                    onClick={() => toggleAccount(account.id, account.is_active === false)}
                                    className={account.is_active === false ? "text-slate-500" : "text-emerald-700"}
                                >
                                    {configSaving === "account:" + account.id ? <Loader2 className="h-4 w-4 animate-spin" /> : account.is_active === false ? "Enable" : "Disable"}
                                </Button>
                            </div>
                        ))}
                        {!setup.accounts?.length && <p className="text-sm text-slate-500">No receiving accounts configured.</p>}
                    </div>
                </SetupCard>
            </div>
        </div>
    )
}

function OpeningBalanceSection({ students, categories, onRefresh }: { students: FinanceStudentBalance[]; categories: FinanceSetup["categories"]; onRefresh: () => Promise<void> | void }) {
    const [form, setForm] = useState({ student_id: "", amount: "", as_of_date: todayValue(), month: "", category_id: "", description: "Opening balance imported at finance launch" })
    const [staged, setStaged] = useState<OpeningBalanceInput["entries"]>([])
    const [saving, setSaving] = useState(false)
    const operationKey = useRef("")

    const draftValid = Boolean(form.student_id) && Number(form.amount) > 0
    const entryCount = staged.length + (draftValid ? 1 : 0)

    function updateForm(patch: Partial<typeof form>) {
        operationKey.current = ""
        setForm(current => ({ ...current, ...patch }))
    }

    function buildEntry(): OpeningBalanceInput["entries"][number] {
        return {
            student_id: form.student_id,
            amount: decimalMoney(form.amount),
            month: form.month || undefined,
            category_id: form.category_id || undefined,
            description: form.description.trim() || undefined,
        }
    }

    function stageDraft() {
        if (!draftValid) return
        setStaged(current => [...current, buildEntry()])
        operationKey.current = ""
        setForm(current => ({ ...current, student_id: "", amount: "", month: "", category_id: "" }))
    }

    function removeStaged(index: number) {
        setStaged(current => current.filter((_, itemIndex) => itemIndex !== index))
        operationKey.current = ""
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault()
        const entries = draftValid ? [...staged, buildEntry()] : staged
        if (!entries.length) return
        setSaving(true)
        try {
            const result = await financeApi.addOpeningBalances({
                as_of_date: form.as_of_date,
                idempotency_key: operationKey.current || (operationKey.current = createIdempotencyKey("opening-balance")),
                entries,
            })
            if (!result.success) throw new Error(result.error || "Could not add opening balances")
            toast.success(result.message || (entries.length === 1 ? "Opening balance added" : "Opening balances added"))
            operationKey.current = ""
            setStaged([])
            setForm(current => ({ ...current, student_id: "", amount: "", month: "", category_id: "" }))
            await onRefresh()
        } catch (error) {
            toast.error(financeErrorMessage(error, "Could not add opening balances"))
        } finally {
            setSaving(false)
        }
    }

    return (
        <SetupCard icon={ClipboardList} title="Opening balances" description="Bring earlier pending amounts into the new ledger without rewriting fake payment history.">
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                Use a due month and category when known. You can stage several student balances and post them together. An unpaid opening balance is corrected with an audited void, not a payment reversal or deletion.
            </div>
            <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
                <Field label="Balance as of">
                    <Input type="date" required value={form.as_of_date} onChange={event => updateForm({ as_of_date: event.target.value })} />
                </Field>
                <div className="hidden lg:block" />
                <SearchableSelect
                    label="Student"
                    placeholder="Choose student"
                    searchPlaceholder="Search by name or ID..."
                    items={students.map(student => { const id = studentFinanceId(student); return { id, label: `${student.name} (${id})` } })}
                    value={form.student_id}
                    onChange={v => updateForm({ student_id: v })}
                    inputClassName="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <Field label="Pending amount"><Input type="number" min="0.01" step="0.01" required={staged.length === 0} value={form.amount} onChange={event => updateForm({ amount: event.target.value })} /></Field>
                <Field label="Known due month (optional)"><Input type="month" value={form.month} onChange={event => updateForm({ month: event.target.value })} /></Field>
                <Field label="Category (optional)">
                    <select value={form.category_id} onChange={event => updateForm({ category_id: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <option value="">General opening balance</option>
                        {(categories || []).filter(category => category.is_active !== false).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                </Field>
                <div className="lg:col-span-2"><Field label="Description"><Textarea rows={2} value={form.description} onChange={event => updateForm({ description: event.target.value })} /></Field></div>

                {!!staged.length && (
                    <div className="space-y-2 rounded-2xl bg-slate-50 p-3 lg:col-span-2 dark:bg-slate-900">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ready to post · {staged.length}</p>
                        {staged.map((entry, index) => {
                            const studentName = students.find(student => studentFinanceId(student) === entry.student_id)?.name || entry.student_id
                            const categoryName = (categories || []).find(category => category.id === entry.category_id)?.name || "General"
                            return (
                                <div key={entry.student_id + ":" + index} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 text-sm dark:bg-slate-950">
                                    <div className="min-w-0"><p className="truncate font-bold text-slate-900 dark:text-white">{studentName}</p><p className="truncate text-xs text-slate-500">{categoryName}{entry.month ? " · " + entry.month : ""}</p></div>
                                    <div className="flex shrink-0 items-center gap-2"><span className="font-black">{money(entry.amount)}</span><Button type="button" size="icon" variant="ghost" aria-label="Remove staged balance" onClick={() => removeStaged(index)}><X className="h-4 w-4" /></Button></div>
                                </div>
                            )
                        })}
                    </div>
                )}

                <div className="flex flex-col gap-2 lg:col-span-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" disabled={!draftValid || saving} onClick={stageDraft} className="gap-2"><Plus className="h-4 w-4" /> Add another</Button>
                    <Button type="submit" disabled={saving || entryCount === 0} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Post {entryCount || ""} balance{entryCount === 1 ? "" : "s"}</Button>
                </div>
            </form>
        </SetupCard>
    )
}
function SetupCard({ icon: Icon, title, description, children }: { icon: typeof IndianRupee; title: string; description: string; children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Icon className="h-5 w-5" /></span>
                <div><h3 className="font-black text-slate-950 dark:text-white">{title}</h3><p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p></div>
            </div>
            {children}
        </section>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <label className="block space-y-1.5"><span className="text-sm font-medium leading-none">{label}</span>{children}</label>
}

function PreviewMetric({ label, value }: { label: string; value: string | number }) {
    return <div><p className="text-xs font-bold uppercase tracking-wide text-blue-600/70 dark:text-blue-300/70">{label}</p><p className="mt-1 text-xl font-black text-blue-950 dark:text-blue-100">{value}</p></div>
}
