"use client"

import { useEffect, useState, type ElementType } from "react"
import { useRouter } from "next/navigation"
import {
    AlertTriangle,
    ArrowLeft,
    Calendar,
    CheckCircle,
    ClipboardCheck,
    Download,
    Loader2,
    RefreshCw,
    Search,
    UserCog,
    XCircle,
} from "lucide-react"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { useToast } from "@/hooks/use-toast"

type MentorReport = {
    id: string
    name: string
    role?: string
    phone?: string
    active?: boolean
    planned_classes: number
    cancelled_classes: number
    required_classes: number
    marked_classes: number
    not_marked_classes: number
    marking_percentage: number
    missing_percentage: number
}

type Totals = {
    planned_classes: number
    cancelled_classes: number
    required_classes: number
    marked_classes: number
    not_marked_classes: number
}

const emptyTotals: Totals = {
    planned_classes: 0,
    cancelled_classes: 0,
    required_classes: 0,
    marked_classes: 0,
    not_marked_classes: 0,
}

function toDateInputValue(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function getWeekRange(offsetWeeks = 0) {
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay() + offsetWeeks * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    if (offsetWeeks === 0 && end > today) end.setTime(today.getTime())
    return { start: toDateInputValue(start), end: toDateInputValue(end) }
}

function getMonthRange() {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return { start: toDateInputValue(start), end: toDateInputValue(today) }
}

function pct(value: number) {
    return `${Number(value || 0).toFixed(1).replace(".0", "")}%`
}

export default function MentorReportsPage() {
    const weekRange = getWeekRange()
    const [data, setData] = useState<MentorReport[]>([])
    const [totals, setTotals] = useState<Totals>(emptyTotals)
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    const [startDate, setStartDate] = useState(weekRange.start)
    const [endDate, setEndDate] = useState(weekRange.end)
    const [activePreset, setActivePreset] = useState("This Week")
    const { toast } = useToast()
    const router = useRouter()

    useEffect(() => {
        fetchReports()
    }, [startDate, endDate])

    const fetchReports = async () => {
        setLoading(true)
        try {
            const res = await cachedGet('/reports/mentors', { start_date: startDate, end_date: endDate }, 30_000)
            if (res.data?.success) {
                setData(res.data.data || [])
                setTotals(res.data.totals || emptyTotals)
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to load mentor marking report", variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    const applyPreset = (preset: "This Week" | "Last Week" | "This Month") => {
        const range = preset === "This Month" ? getMonthRange() : getWeekRange(preset === "Last Week" ? -1 : 0)
        setActivePreset(preset)
        setStartDate(range.start)
        setEndDate(range.end)
    }

    const filtered = data.filter(mentor => {
        const query = searchTerm.toLowerCase()
        return (
            mentor.name?.toLowerCase().includes(query) ||
            mentor.role?.toLowerCase().includes(query) ||
            mentor.phone?.toLowerCase().includes(query)
        )
    })

    const overallMarkedPercentage = totals.required_classes > 0
        ? Math.round((totals.marked_classes / totals.required_classes) * 1000) / 10
        : 0

    const handleDownloadCsv = () => {
        if (filtered.length === 0) {
            toast({ title: "No Data", description: "There is no mentor report data to export." })
            return
        }

        const headers = [
            "Mentor",
            "Role",
            "Phone",
            "Planned Classes",
            "Cancelled Classes",
            "Required Classes",
            "Marked Classes",
            "Not Marked Classes",
            "Marked %",
            "Not Marked %",
        ]
        const rows = filtered.map(mentor => [
            `"${mentor.name || "Unnamed Mentor"}"`,
            `"${mentor.role || "N/A"}"`,
            mentor.phone || "N/A",
            mentor.planned_classes || 0,
            mentor.cancelled_classes || 0,
            mentor.required_classes || 0,
            mentor.marked_classes || 0,
            mentor.not_marked_classes || 0,
            mentor.marking_percentage || 0,
            mentor.missing_percentage || 0,
        ])

        const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n")
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `Mentor_Marking_Report_${startDate}_to_${endDate}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    return (
        <div className="flex min-h-[calc(100vh-120px)] w-full flex-col gap-6">
            <div className="flex flex-col gap-5 rounded-[28px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <button
                        onClick={() => router.push("/admin")}
                        className="mb-5 flex items-center gap-2 text-[13px] font-bold text-white/65 transition-colors hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                            <UserCog className="h-6 w-6 text-emerald-300" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black tracking-tight">Mentor Marking Report</h1>
                            <p className="mt-1 text-sm font-medium text-white/65">
                                Percentage of required class attendance submitted by each mentor. Cancelled classes are excluded.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryPill icon={Calendar} label="Required" value={totals.required_classes} />
                    <SummaryPill icon={CheckCircle} label="Marked" value={totals.marked_classes} />
                    <SummaryPill icon={XCircle} label="Not Marked" value={totals.not_marked_classes} />
                    <SummaryPill icon={ClipboardCheck} label="Overall" value={pct(overallMarkedPercentage)} />
                </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {(["This Week", "Last Week", "This Month"] as const).map(preset => (
                            <button
                                key={preset}
                                onClick={() => applyPreset(preset)}
                                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
                                    activePreset === preset
                                        ? "bg-emerald-600 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                From
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={event => {
                                        setActivePreset("Custom")
                                        setStartDate(event.target.value)
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                To
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={event => {
                                        setActivePreset("Custom")
                                        setEndDate(event.target.value)
                                    }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                                />
                            </label>
                        </div>
                        <button
                            onClick={() => {
                                invalidateCache('/reports/mentors')
                                fetchReports()
                            }}
                            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-700"
                        >
                            <RefreshCw className="h-4 w-4" /> Refresh
                        </button>
                        <button
                            onClick={handleDownloadCsv}
                            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                        >
                            <Download className="h-4 w-4" /> Download CSV
                        </button>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                    <MetricCard label="Planned Slots" value={totals.planned_classes} tone="slate" />
                    <MetricCard label="Cancelled Slots" value={totals.cancelled_classes} tone="rose" />
                    <MetricCard label="Required After Cancel" value={totals.required_classes} tone="blue" />
                    <MetricCard label="Marked Percentage" value={pct(overallMarkedPercentage)} tone="emerald" />
                </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-black text-slate-900">Mentors</h2>
                        <p className="text-sm font-medium text-slate-500">
                            A class is counted as marked only when that mentor submitted attendance for that schedule and date.
                        </p>
                    </div>
                    <div className="relative w-full md:max-w-sm">
                        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={searchTerm}
                            onChange={event => setSearchTerm(event.target.value)}
                            placeholder="Search mentor, role, phone..."
                            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>
                </div>

                <div className="relative min-h-[360px] overflow-auto">
                    {loading ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
                            <Loader2 className="mb-4 h-8 w-8 animate-spin text-emerald-600" />
                            <span className="text-sm font-bold text-slate-500">Calculating mentor marking report...</span>
                        </div>
                    ) : null}

                    <table className="w-full min-w-[980px]">
                        <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                            <tr>
                                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Mentor</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black uppercase tracking-wider text-slate-500">Required</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black uppercase tracking-wider text-emerald-600">Marked</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black uppercase tracking-wider text-rose-600">Not Marked</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black uppercase tracking-wider text-slate-500">Cancelled</th>
                                <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Completion</th>
                                <th className="px-4 py-4 text-center text-[11px] font-black uppercase tracking-wider text-slate-500">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {!loading && filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="py-16 text-center text-sm font-bold text-slate-500">
                                        No mentor class marking data found for this period.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(mentor => (
                                    <tr key={mentor.id} className="transition hover:bg-slate-50/80">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700 ring-1 ring-emerald-100">
                                                    {(mentor.name || "M").split(" ").map(word => word[0]).join("").slice(0, 2)}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-slate-900">{mentor.name || "Unnamed Mentor"}</div>
                                                    <div className="text-xs font-semibold text-slate-500">
                                                        {mentor.role || "Mentor"} {mentor.phone ? `• ${mentor.phone}` : ""}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center text-base font-black text-slate-800">{mentor.required_classes || 0}</td>
                                        <td className="px-4 py-4 text-center text-base font-black text-emerald-600">{mentor.marked_classes || 0}</td>
                                        <td className="px-4 py-4 text-center text-base font-black text-rose-600">{mentor.not_marked_classes || 0}</td>
                                        <td className="px-4 py-4 text-center text-base font-black text-slate-500">{mentor.cancelled_classes || 0}</td>
                                        <td className="px-6 py-4">
                                            <div className="mb-2 flex items-center justify-between text-xs font-black">
                                                <span className="text-emerald-700">{pct(mentor.marking_percentage)} marked</span>
                                                <span className="text-rose-600">{pct(mentor.missing_percentage)} missed</span>
                                            </div>
                                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                                                    style={{ width: `${Math.min(100, Math.max(0, mentor.marking_percentage || 0))}%` }}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-center">
                                            {(mentor.required_classes || 0) === 0 ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
                                                    No Classes
                                                </span>
                                            ) : (mentor.not_marked_classes || 0) === 0 ? (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                                                    <CheckCircle className="h-3.5 w-3.5" /> Complete
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                                                    <AlertTriangle className="h-3.5 w-3.5" /> Pending
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

function SummaryPill({ icon: Icon, label, value }: { icon: ElementType; label: string; value: string | number }) {
    return (
        <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10">
            <Icon className="mb-3 h-5 w-5 text-emerald-200" />
            <div className="text-2xl font-black">{value}</div>
            <div className="text-xs font-bold text-white/60">{label}</div>
        </div>
    )
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: "slate" | "rose" | "blue" | "emerald" }) {
    const colors = {
        slate: "bg-slate-50 text-slate-700 ring-slate-100",
        rose: "bg-rose-50 text-rose-700 ring-rose-100",
        blue: "bg-blue-50 text-blue-700 ring-blue-100",
        emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    }

    return (
        <div className={`rounded-2xl p-4 ring-1 ${colors[tone]}`}>
            <div className="text-xs font-black uppercase tracking-wider opacity-70">{label}</div>
            <div className="mt-2 text-3xl font-black">{value}</div>
        </div>
    )
}
