"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
    AlertCircle,
    ArrowRight,
    CalendarDays,
    CreditCard,
    IndianRupee,
    Landmark,
    Loader2,
    Plus,
    ReceiptText,
    RefreshCw,
    Search,
    Settings2,
    ShieldAlert,
    Tag,
    TrendingDown,
    WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
    allowedFinanceCategoryIds,
    financeApi,
    financeErrorMessage,
    hasFinanceCapability,
    studentFinanceId,
    type FinanceActivity,
    type FinanceMode,
    type FinanceStudentBalance,
    type FinanceView,
    type FinanceWorkspaceResponse,
    type StudentFinanceAccount,
} from "@/lib/finance-api"
import { AddChargeSheet, CollectPaymentSheet } from "./finance-action-sheets"
import { FinanceSetupPanel } from "./finance-setup"
import { currentMonthValue, money, shortDateTime, summaryValue } from "./finance-utils"
import { StudentAccountSheet } from "./student-account-sheet"

type WorkspaceAction = "charge" | "payment" | null

const VIEW_META: Record<FinanceView, { label: string; icon: typeof Landmark }> = {
    overview: { label: "Overview", icon: Landmark },
    dues: { label: "Dues", icon: WalletCards },
    transactions: { label: "Recent activity", icon: ReceiptText },
    setup: { label: "Setup", icon: Settings2 },
}

export function FinanceWorkspace({ mode, initialView = "overview" }: { mode: FinanceMode; initialView?: FinanceView }) {
    const [view, setView] = useState<FinanceView>(mode === "staff" && initialView === "setup" ? "overview" : initialView)
    const [month, setMonth] = useState(currentMonthValue())
    const [search, setSearch] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [status, setStatus] = useState("")
    const [workspace, setWorkspace] = useState<FinanceWorkspaceResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState("")
    const [accountOpen, setAccountOpen] = useState(false)
    const [accountLoading, setAccountLoading] = useState(false)
    const [account, setAccount] = useState<StudentFinanceAccount | null>(null)
    const [action, setAction] = useState<WorkspaceAction>(null)
    const [actionStudentId, setActionStudentId] = useState("")
    const workspaceRequest = useRef(0)

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
        return () => window.clearTimeout(timer)
    }, [search])

    const loadWorkspace = useCallback(async (silent = false) => {
        const requestId = ++workspaceRequest.current
        if (silent) setRefreshing(true)
        else setLoading(true)
        setError("")
        try {
            const result = await financeApi.getWorkspace({
                month,
                search: debouncedSearch || undefined,
                status: status || undefined,
                limit: 100,
            })
            if (requestId !== workspaceRequest.current) return
            if (!result.success) throw new Error(result.error || "Finance workspace could not be loaded")
            setWorkspace(result)
        } catch (requestError) {
            if (requestId !== workspaceRequest.current) return
            setError(financeErrorMessage(requestError, "Finance workspace could not be loaded"))
        } finally {
            if (requestId === workspaceRequest.current) {
                setLoading(false)
                setRefreshing(false)
            }
        }
    }, [month, debouncedSearch, status])

    useEffect(() => { void loadWorkspace() }, [loadWorkspace])

    const capabilities = workspace?.capabilities
    const capability = useCallback((keys: string[], adminFallback = true) => {
        if (!capabilities) return mode === "admin" && adminFallback
        return keys.some(key => hasFinanceCapability(capabilities, key, false))
    }, [capabilities, mode])

    const canViewOverview = capability(["can_view_overview", "view_overview", "finance:view"])
    const canViewDues = capability(["can_view_dues", "view_dues", "ledger:view", "can_collect_payment", "can_add_charge"])
    const canViewTransactions = capability(["can_view_transactions", "view_transactions", "transactions:view", "can_collect_payment", "can_add_charge"])
    const canAddCharge = capability(["can_add_charge", "add_charge", "charge:create"])
    const canCollectPayment = capability(["can_collect_payment", "can_record_payment", "collect_payment", "payment:collect"])
    const canManageFinance = capability(["can_manage_setup", "manage_setup", "finance:manage"])
    const canManageSetup = mode === "admin" && canManageFinance

    const availableViews = useMemo(() => {
        const values: FinanceView[] = []
        if (canViewOverview) values.push("overview")
        if (canViewDues) values.push("dues")
        if (canViewTransactions) values.push("transactions")
        if (canManageSetup) values.push("setup")
        return values
    }, [canViewOverview, canViewDues, canViewTransactions, canManageSetup])

    useEffect(() => {
        if (availableViews.length && !availableViews.includes(view)) setView(availableViews[0])
    }, [availableViews, view])

    const students = workspace?.students || []
    const setup = workspace?.setup || {}
    const categories = useMemo(() => {
        const source = setup.categories || workspace?.categories || []
        if (mode === "admin") return source.filter(category => category.is_active !== false)
        const allowed = allowedFinanceCategoryIds(capabilities)
        return source.filter(category => category.is_active !== false && (!allowed.length || allowed.includes(category.id)))
    }, [setup.categories, workspace?.categories, mode, capabilities])
    const accounts = (setup.accounts || workspace?.accounts || []).filter(account => account.is_active !== false)

    function selectView(next: FinanceView) {
        setView(next)
        if (typeof window !== "undefined") {
            const url = new URL(window.location.href)
            url.searchParams.set("view", next)
            window.history.replaceState(window.history.state, "", url)
        }
    }

    async function openStudentAccount(student: FinanceStudentBalance | string) {
        const studentId = typeof student === "string" ? student : studentFinanceId(student)
        if (!studentId) return
        setAccountOpen(true)
        setAccountLoading(true)
        setAccount(null)
        try {
            const result = await financeApi.getStudentAccount(studentId)
            if (!result.success) throw new Error(result.error || "Student account could not be loaded")
            setAccount(result.account)
        } catch (requestError) {
            setError(financeErrorMessage(requestError, "Student account could not be loaded"))
        } finally {
            setAccountLoading(false)
        }
    }

    function openAction(nextAction: Exclude<WorkspaceAction, null>, studentId = "") {
        setActionStudentId(studentId)
        setAction(nextAction)
    }

    async function afterMutation(nextAccount?: StudentFinanceAccount) {
        if (nextAccount) setAccount(nextAccount)
        await loadWorkspace(true)
    }

    async function afterCorrection(studentId: string) {
        setAccountLoading(true)
        try {
            const [result] = await Promise.all([
                financeApi.getStudentAccount(studentId),
                loadWorkspace(true),
            ])
            if (!result.success) throw new Error(result.error || "Student account could not be refreshed")
            setAccount(result.account)
        } catch (requestError) {
            setError(financeErrorMessage(requestError, "The correction was recorded, but the student account could not be refreshed"))
        } finally {
            setAccountLoading(false)
        }
    }

    if (loading && !workspace) return <FinanceWorkspaceSkeleton />

    if (!loading && mode === "staff" && !availableViews.length && !canAddCharge && !canCollectPayment) {
        return <FinanceAccessState />
    }

    return (
        <main className="min-h-full bg-slate-50 px-3 py-4 dark:bg-slate-950 sm:px-5 sm:py-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1500px] space-y-5">
                <header className="sticky top-0 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <div className="flex min-w-0 items-center gap-3 xl:w-72">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Landmark className="h-5 w-5" /></span>
                            <div className="min-w-0">
                                <h1 className="truncate text-lg font-black text-slate-950 dark:text-white">{mode === "admin" ? "Finance" : "Student finance"}</h1>
                                <p className="truncate text-xs text-slate-500">{mode === "admin" ? "Fees, collections and student accounts" : "Authorized finance actions"}</p>
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                            <label className="relative min-w-0 flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search student name or admission number"
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:focus:ring-blue-950"
                                />
                            </label>
                            <label className="relative shrink-0">
                                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900 sm:w-44" />
                            </label>
                            {(canAddCharge || canCollectPayment) && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button className="h-10 shrink-0 gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"><Plus className="h-4 w-4" /> New</Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-52">
                                        <DropdownMenuLabel>Finance action</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {canAddCharge && <DropdownMenuItem onSelect={() => openAction("charge")}><Tag className="mr-2 h-4 w-4" /> Add student charge</DropdownMenuItem>}
                                        {canCollectPayment && <DropdownMenuItem onSelect={() => openAction("payment")}><CreditCard className="mr-2 h-4 w-4" /> Collect payment</DropdownMenuItem>}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                            <Button variant="outline" size="icon" aria-label="Refresh finance workspace" disabled={refreshing} onClick={() => loadWorkspace(true)} className="hidden h-10 w-10 shrink-0 sm:inline-flex">
                                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    </div>

                    <div className="mt-3 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3 dark:border-slate-800">
                        {availableViews.map(value => {
                            const meta = VIEW_META[value]
                            const Icon = meta.icon
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => selectView(value)}
                                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-bold transition ${view === value
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                                    }`}
                                >
                                    <Icon className="h-4 w-4" /> {meta.label}
                                </button>
                            )
                        })}
                    </div>
                </header>

                {error && (
                    <div className="flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                        <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
                        <button onClick={() => setError("")} className="font-bold">Dismiss</button>
                    </div>
                )}

                {view === "overview" && (
                    <OverviewPanel mode={mode} workspace={workspace} canViewSummary={mode === "admin" || capability(["can_view_summary", "view_summary"])} canAddCharge={canAddCharge} canCollectPayment={canCollectPayment} onAction={openAction} />
                )}
                {view === "dues" && (
                    <DuesPanel students={students} status={status} onStatusChange={setStatus} onOpenStudent={openStudentAccount} />
                )}
                {view === "transactions" && <TransactionsPanel activity={workspace?.recent_activity || []} />}
                {view === "setup" && canManageSetup && <FinanceSetupPanel month={month} setup={setup} students={students} onRefresh={() => loadWorkspace(true)} />}
            </div>

            <StudentAccountSheet
                open={accountOpen}
                onOpenChange={setAccountOpen}
                account={account}
                loading={accountLoading}
                canAddCharge={canAddCharge}
                canCollectPayment={canCollectPayment}
                canManageCorrections={canManageFinance}
                onAction={(nextAction, studentId) => { setAccountOpen(false); openAction(nextAction, studentId) }}
                onCorrectionSuccess={afterCorrection}
            />
            <AddChargeSheet
                open={action === "charge"}
                onOpenChange={open => { if (!open) setAction(null) }}
                students={students}
                categories={categories}
                initialStudentId={actionStudentId}
                onSuccess={afterMutation}
            />
            <CollectPaymentSheet
                open={action === "payment"}
                onOpenChange={open => { if (!open) setAction(null) }}
                students={students}
                accounts={accounts}
                initialStudentId={actionStudentId}
                initialAccount={account}
                onSuccess={afterMutation}
            />
        </main>
    )
}

function OverviewPanel({
    mode,
    workspace,
    canViewSummary,
    canAddCharge,
    canCollectPayment,
    onAction,
}: {
    mode: FinanceMode
    workspace: FinanceWorkspaceResponse | null
    canViewSummary: boolean
    canAddCharge: boolean
    canCollectPayment: boolean
    onAction: (action: "charge" | "payment", studentId?: string) => void
}) {
    const summary = workspace?.summary
    const expected = summaryValue(summary, "expected")
    const collected = summaryValue(summary, "collected")
    const outstanding = summaryValue(summary, "outstanding", "pending")
    const overdue = summaryValue(summary, "overdue")

    return (
        <div className="space-y-5">
            {canViewSummary && (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <MetricCard label="Expected this month" value={money(expected)} icon={IndianRupee} tone="blue" />
                        <MetricCard label="Collected this month" value={money(collected)} icon={CreditCard} tone="emerald" />
                        <MetricCard label="Outstanding all time" value={money(outstanding)} icon={WalletCards} tone="amber" />
                        <MetricCard label="Overdue all time" value={money(overdue)} icon={TrendingDown} tone="rose" />
                    </div>
                </>
            )}

            {mode === "staff" && (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900/60 dark:bg-blue-950/30">
                    <p className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">Your authorized actions</p>
                    <h2 className="mt-1 text-xl font-black text-blue-950 dark:text-blue-100">Record finance items without viewing institution totals</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-blue-800 dark:text-blue-200">Only categories and student scope approved by the administrator are available. Every entry records who created it.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {canAddCharge && <Button onClick={() => onAction("charge")} className="gap-2 bg-blue-600 text-white hover:bg-blue-700"><Tag className="h-4 w-4" /> Add charge</Button>}
                        {canCollectPayment && <Button onClick={() => onAction("payment")} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><CreditCard className="h-4 w-4" /> Collect payment</Button>}
                    </div>
                </section>
            )}

            <ActivityPanel activity={workspace?.recent_activity || []} title={mode === "staff" ? "Your recent finance work" : "Recent finance activity"} />
        </div>
    )
}

function DuesPanel({ students, status, onStatusChange, onOpenStudent }: { students: FinanceStudentBalance[]; status: string; onStatusChange: (value: string) => void; onOpenStudent: (student: FinanceStudentBalance) => void }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <div><h2 className="font-black text-slate-950 dark:text-white">Student dues</h2><p className="text-sm text-slate-500">Open a student for fee lines, charges, payments, and their active fee rule.</p></div>
                <select value={status} onChange={event => onStatusChange(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
                    <option value="">All balances</option><option value="pending">Has pending balance</option><option value="overdue">Overdue</option>
                </select>
            </div>

            {!students.length ? (
                <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center"><WalletCards className="h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-900 dark:text-white">No matching students</p><p className="mt-1 text-sm text-slate-500">Adjust the search or balance filter.</p></div>
            ) : (
                <>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900"><tr><th className="px-5 py-3">Student</th><th className="px-4 py-3">Current month</th><th className="px-4 py-3">Overdue</th><th className="px-4 py-3">Total due</th><th className="px-5 py-3 text-right">Account</th></tr></thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {students.map(student => {
                                    const id = studentFinanceId(student)
                                    return <tr key={id} className="hover:bg-slate-50 dark:hover:bg-slate-900/70"><td className="px-5 py-4"><p className="font-bold text-slate-900 dark:text-white">{student.name}</p><p className="text-xs text-slate-500">{id}{student.standard ? ` · ${student.standard}` : ""}</p></td><td className="px-4 py-4 font-semibold">{money(student.current_month_due)}</td><td className="px-4 py-4 font-semibold text-rose-600">{money(student.overdue)}</td><td className="px-4 py-4 font-black text-slate-950 dark:text-white">{money(student.total_due ?? student.outstanding)}</td><td className="px-5 py-4 text-right"><Button size="sm" variant="ghost" onClick={() => onOpenStudent(student)} className="gap-1 text-blue-700 dark:text-blue-300">View <ArrowRight className="h-4 w-4" /></Button></td></tr>
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                        {students.map(student => {
                            const id = studentFinanceId(student)
                            return <button key={id} type="button" onClick={() => onOpenStudent(student)} className="block w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-900"><div className="flex items-start justify-between gap-4"><div><p className="font-bold text-slate-950 dark:text-white">{student.name}</p><p className="mt-0.5 text-xs text-slate-500">{id}{student.standard ? ` · ${student.standard}` : ""}</p></div><p className="font-black text-rose-600">{money(student.total_due ?? student.outstanding)}</p></div><div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>Overdue {money(student.overdue)}</span><span className="inline-flex items-center gap-1 font-bold text-blue-700 dark:text-blue-300">Open account <ArrowRight className="h-3.5 w-3.5" /></span></div></button>
                        })}
                    </div>
                </>
            )}
        </section>
    )
}

function TransactionsPanel({ activity }: { activity: FinanceActivity[] }) {
    return <ActivityPanel activity={activity} title="Recent activity" />
}

function ActivityPanel({ activity, title }: { activity: FinanceActivity[]; title: string }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="border-b border-slate-200 p-4 sm:p-5 dark:border-slate-800"><h2 className="font-black text-slate-950 dark:text-white">{title}</h2><p className="mt-1 text-sm text-slate-500">Latest 20 permitted payments and charges. Open a student account for full history.</p></div>
            {!activity.length ? <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center"><ReceiptText className="h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-900 dark:text-white">No recent activity</p></div> : <div className="divide-y divide-slate-100 dark:divide-slate-800">{activity.map(item => <div key={item.id} className="flex items-start justify-between gap-4 p-4 sm:px-5"><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.type?.includes("payment") ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40"}`}>{item.type?.includes("payment") ? <CreditCard className="h-4 w-4" /> : <Tag className="h-4 w-4" />}</span><div className="min-w-0"><p className="truncate font-bold text-slate-900 dark:text-white">{item.student_name || item.description || "Finance activity"}</p><p className="mt-0.5 truncate text-sm text-slate-500">{item.description || item.category_name || item.type?.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-400">{shortDateTime(item.created_at || item.date)}{item.recorded_by_name ? ` · ${item.recorded_by_name}` : ""}</p></div></div><p className={`shrink-0 font-black ${item.type?.includes("payment") ? "text-emerald-600" : "text-slate-950 dark:text-white"}`}>{money(item.amount)}</p></div>)}</div>}
        </section>
    )
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof IndianRupee; tone: "blue" | "emerald" | "amber" | "rose" }) {
    const tones = { blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300", emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300", rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300" }
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 break-words text-xl font-black leading-tight text-slate-950 dark:text-white sm:text-2xl">{value}</p></div>
}

function FinanceAccessState() {
    return <main className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-slate-50 p-5 dark:bg-slate-950"><div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><ShieldAlert className="h-7 w-7" /></span><h1 className="mt-5 text-xl font-black text-slate-950 dark:text-white">Finance access is not assigned</h1><p className="mt-2 text-sm leading-relaxed text-slate-500">An administrator can authorize a specific action such as Medical charges, Store charges, or payment collection. No finance data is exposed until access is granted.</p></div></main>
}

function FinanceWorkspaceSkeleton() {
    return <main className="min-h-full bg-slate-50 p-4 dark:bg-slate-950 sm:p-6"><div className="mx-auto max-w-[1500px] space-y-5"><div className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-950"><div className="flex gap-3"><Skeleton className="h-10 w-64" /><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-36" /></div><Skeleton className="mt-4 h-10 w-96 max-w-full" /></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-72 rounded-2xl" /></div></main>
}
