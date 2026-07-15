const fs = require('fs');
const path = 'd:\\NewRQP\\src\\components\\admin\\reports\\management-report-page.tsx';

const code = `"use client"

import Link from "next/link"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import {
    BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download,
    FileText, Printer, Search, Users, XCircle,
} from "lucide-react"
import { cachedGet } from "@/lib/api-cache"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

export type ManagementReportKind = "attendance" | "progress" | "faculty"

type AcademicYear = { id: string; name: string; start_date: string; end_date: string; is_current?: boolean }
type GroupFilter = { group_id: string; department: string; standard: string; division: string }
type Filters = { academic_years?: AcademicYear[]; groups?: GroupFilter[] }
type Pagination = { total: number; limit: number; offset: number; has_more: boolean }
type StudentRow = {
    adm_no: string; name: string; standard: string; division?: string; cells?: Record<string, string>
    present?: number; absent?: number; leave?: number; pending?: number; cancelled?: number; total?: number
    percentage?: number; attendance_percentage?: number; recited_days?: number; new_entries?: number
    recent_entries?: number; juz_entries?: number
}
type FacultyRow = {
    id: string; name: string; role_label?: string; assigned_students?: number; planned_classes: number
    cancelled_classes: number; required_classes: number; marked_classes: number; not_marked_classes: number
    marking_percentage: number
}
type ReportResponse = {
    success: boolean; data?: StudentRow[] | FacultyRow[]; dates?: string[]; filters?: Filters
    pagination?: Pagination; summary?: Record<string, any>; totals?: Record<string, number>
    academic_year?: AcademicYear; period?: { start_date: string; end_date: string }
    schedules?: { id: string; name: string; summary: Record<string, number>; data: StudentRow[] }[]
}

const tabs = [
    { kind: "attendance", label: "Attendance Report", icon: CalendarDays },
    { kind: "progress", label: "Progress Report", icon: BarChart3 },
    { kind: "faculty", label: "Faculty Report", icon: Users },
] as const

function localDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return year + "-" + month + "-" + day
}

function initialRange() {
    const today = new Date()
    return {
        start: localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: localDate(today),
    }
}

function csvCell(value: unknown) {
    const text = String(value ?? "")
    return '"' + text.replaceAll('"', '""') + '"'
}

function downloadCsv(name: string, rows: unknown[][]) {
    const blob = new Blob([rows.map(row => row.map(csvCell).join(",")).join("\n")], {
        type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
}

function StatCard({ label, value, tone = "slate" }: { label: string; value: ReactNode; tone?: string }) {
    const tones: Record<string, string> = {
        blue: "border-blue-200 bg-blue-50 text-blue-700",
        green: "border-emerald-200 bg-emerald-50 text-emerald-700",
        orange: "border-orange-200 bg-orange-50 text-orange-700",
        red: "border-rose-200 bg-rose-50 text-rose-700",
        slate: "border-slate-200 bg-white text-slate-700",
    }
    return (
        <div className={"min-w-0 rounded-lg border p-4 flex-1 " + (tones[tone] || tones.slate)}>
            <div className="text-[11px] font-bold uppercase text-slate-500">{label}</div>
            <div className="mt-1 truncate text-2xl font-black">{value}</div>
        </div>
    )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="grid min-w-0 gap-1 text-[11px] font-bold uppercase text-slate-500">
            {label}
            {children}
        </label>
    )
}

const inputClass = "h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"

function statusStyle(value: string) {
    if (value === "P") return "bg-emerald-50 text-emerald-700 border border-emerald-200"
    if (value === "A") return "bg-rose-50 text-rose-700 border border-rose-200"
    if (value === "L") return "bg-amber-50 text-amber-700 border border-amber-200"
    if (value === "C") return "bg-slate-100 text-slate-500 border border-slate-200"
    if (value === "N") return "bg-blue-50 text-blue-600 border border-blue-200"
    if (value === "I") return "bg-blue-100 text-blue-700 border border-blue-300"
    if (value === "FL") return "bg-violet-50 text-violet-700 border border-violet-200"
    if (value === "SM") return "bg-indigo-50 text-indigo-700 border border-indigo-200"
    if (value === "IL") return "bg-cyan-50 text-cyan-700 border border-cyan-200"
    return "text-slate-300"
}

function getStandardLabel(standard: string, department: string) {
    if (department === "hifz") {
        const hifzMap: Record<string, string> = {
            "5th": "Hifz - 1",
            "5th Standard": "Hifz - 1",
            "6th": "Hifz - 2",
            "6th Standard": "Hifz - 2",
            "7th": "Hifz - 3",
            "7th Standard": "Hifz - 3",
            "8th": "Hifz - 4",
            "8th Standard": "Hifz - 4",
            "9th": "Hifz - 5",
            "9th Standard": "Hifz - 5",
            "10th": "Hifz - 6",
            "10th Standard": "Hifz - 6",
            "Plus One": "Hifz - 7",
            "+1 (Plus One)": "Hifz - 7",
            "Plus Two": "Hifz - 8",
            "+2 (Plus Two)": "Hifz - 8",
        }
        return hifzMap[standard] || (standard.startsWith("Hifz") ? standard : \`Hifz - \${standard}\`)
    }
    return standard
}

export function ManagementReportPage({ kind }: { kind: ManagementReportKind }) {
    const pathname = usePathname()
    const range = useMemo(initialRange, [])
    const [startDate, setStartDate] = useState(range.start)
    const [endDate, setEndDate] = useState(range.end)
    const [academicYearId, setAcademicYearId] = useState("")
    const [department, setDepartment] = useState(kind === "faculty" ? "active" : "hifz")
    const [standard, setStandard] = useState("")
    const [division, setDivision] = useState("")
    const [search, setSearch] = useState("")
    const deferredSearch = useDeferredValue(search)
    const [page, setPage] = useState(1)
    const [response, setResponse] = useState<ReportResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [selectedSchedule, setSelectedSchedule] = useState<string>("")

    const endpoint = kind === "faculty"
        ? "/reports/management/faculty"
        : "/reports/management/" + kind

    // Fetch report data on filter changes
    useEffect(() => {
        let active = true
        setLoading(true)
        setError("")

        const fetchReport = async () => {
            try {
                const params = kind === "faculty"
                    ? {
                        start_date: startDate, end_date: endDate,
                        academic_year_id: academicYearId || undefined,
                        filter: department, search: deferredSearch || undefined,
                        sort: "highest_percentage", limit: 50, offset: (page - 1) * 50,
                    }
                    : {
                        start_date: startDate, end_date: endDate,
                        academic_year_id: kind === "attendance" ? undefined : (academicYearId || undefined),
                        department, standard: standard || undefined, division: division || undefined,
                        search: deferredSearch || undefined, limit: 50, offset: (page - 1) * 50,
                    }
                
                const result = await cachedGet(endpoint, params, 60000)
                if (!active) return

                if (!result.data?.success) throw new Error(result.data?.error || "Report request failed")
                setResponse(result.data)

                if (result.data.schedules?.length) {
                    setSelectedSchedule(prev => {
                        const exists = result.data.schedules.some((s: any) => s.id === prev)
                        return exists ? prev : result.data.schedules[0].id
                    })
                }

                if (!academicYearId && result.data.academic_year?.id) {
                    setAcademicYearId(result.data.academic_year.id)
                }
            } catch (requestError: any) {
                if (!active) return
                setError(requestError?.response?.data?.error || requestError?.message || "Unable to load this report.")
            } finally {
                if (active) setLoading(false)
            }
        }

        fetchReport()

        return () => {
            active = false
        }
    }, [kind, startDate, endDate, academicYearId, department, standard, division, deferredSearch, page, endpoint])

    const filters = response?.filters || {}
    const years = filters.academic_years || []
    const groups = filters.groups || []
    const departmentGroups = useMemo(
        () => groups.filter(group => group.department === department),
        [department, groups],
    )
    const standards = useMemo(
        () => Array.from(new Set(departmentGroups.map(group => group.standard))).filter(Boolean),
        [departmentGroups],
    )
    const divisions = useMemo(
        () => Array.from(new Set(
            departmentGroups.filter(group => !standard || group.standard === standard).map(group => group.division),
        )).filter(Boolean),
        [departmentGroups, standard],
    )
    const standardOptionsKey = standards.join("\u001f")
    const divisionOptionsKey = divisions.join("\u001f")
    const pagination = response?.pagination || { total: 0, limit: 50, offset: 0, has_more: false }
    const title = tabs.find(tab => tab.kind === kind)?.label || "Report"

    // Reset standard/division if they are no longer in the filtered list
    useEffect(() => {
        if (kind === "faculty") return
        if (standard && !standards.includes(standard)) {
            setStandard("")
            setDivision("")
            return
        }
        if (division && !divisions.includes(division)) setDivision("")
    }, [division, divisionOptionsKey, divisions, kind, standard, standardOptionsKey, standards])

    const exportReport = () => {
        if (!response?.data?.length && !response?.schedules?.length) return
        if (kind === "attendance") {
            const dates = response.dates || []
            const sched = response.schedules?.find(s => s.id === selectedSchedule) || response.schedules?.[0]
            const rows = (sched?.data || []) as StudentRow[]
            downloadCsv(
                "attendance-report-" + (sched?.name || "all") + "-" + startDate + "-to-" + endDate + ".csv",
                [
                    ["Admission No", "Student", "Class", "Division", ...dates, "Present", "Absent", "Leave", "Total", "%"],
                    ...rows.map(row => [
                        row.adm_no, row.name, row.standard, row.division || "-",
                        ...dates.map(date => row.cells?.[date] || "-"),
                        row.present, row.absent, row.leave, row.total, row.percentage,
                    ]),
                ],
            )
            return
        }
        if (kind === "progress") {
            const rows = response.data as StudentRow[]
            downloadCsv(
                "progress-report-" + startDate + "-to-" + endDate + ".csv",
                [
                    ["Admission No", "Student", "Class", "Division", "Present", "Absent", "Leave", "Cancelled", "Pending", "Attendance %", "Recited Days", "New", "Recent", "Juz"],
                    ...rows.map(row => [
                        row.adm_no, row.name, row.standard, row.division || "-", row.present, row.absent,
                        row.leave, row.cancelled, row.pending, row.attendance_percentage, row.recited_days,
                        row.new_entries, row.recent_entries, row.juz_entries,
                    ]),
                ],
            )
            return
        }
        const rows = response.data as FacultyRow[]
        downloadCsv(
            "faculty-report-" + startDate + "-to-" + endDate + ".csv",
            [
                ["Faculty", "Role", "Students", "Planned", "Attended", "Pending", "Cancelled", "Required", "%"],
                ...rows.map(row => [
                    row.name, row.role_label || "Mentor", row.assigned_students || 0, row.planned_classes,
                    row.marked_classes, row.not_marked_classes, row.cancelled_classes, row.required_classes,
                    row.marking_percentage,
                ]),
            ],
        )
    }

    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
            <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase text-blue-600">Management Reports</p>
                    <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        Academic-year roster data with cancellations excluded from completion calculations.
                    </p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <Printer className="h-4 w-4" /> Print
                    </button>
                    <button onClick={exportReport} className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50" disabled={kind === "attendance" ? !response?.schedules?.length : !response?.data?.length}>
                        <Download className="h-4 w-4" /> Export
                    </button>
                </div>
            </header>

            <nav className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 print:hidden">
                {tabs.map(tab => {
                    const active = pathname.endsWith("/" + tab.kind)
                    return (
                        <Link
                            key={tab.kind}
                            href={"/admin/management-reports/" + tab.kind}
                            className={
                                "inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold " +
                                (active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")
                            }
                        >
                            <tab.icon className="h-4 w-4" /> {tab.label}
                        </Link>
                    )
                })}
            </nav>

            {/* Summary cards at the top */}
            {!loading && !error && (
                <Summary kind={kind} response={response} selectedSchedule={selectedSchedule} />
            )}

            {/* Redesigned clean filter layout */}
            <section className="rounded-lg border border-slate-200 bg-white p-4 print:hidden flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                    <Field label="Department">
                        <select className={inputClass} value={department} onChange={event => {
                            setDepartment(event.target.value)
                            setStandard("")
                            setDivision("")
                            setPage(1)
                        }}>
                            {kind === "faculty" && <option value="active">All Teaching Staff</option>}
                            <option value="hifz">Hifz</option>
                            <option value="madrasa">Madrasa</option>
                            <option value="school">School</option>
                        </select>
                    </Field>
                    
                    {kind !== "faculty" && kind !== "attendance" && (
                        <Field label="Academic Year">
                            <select className={inputClass} value={academicYearId} onChange={event => {
                                setAcademicYearId(event.target.value)
                                setPage(1)
                            }}>
                                {!academicYearId && <option value="">Current year</option>}
                                {years.map(year => <option key={year.id} value={year.id}>{year.name}</option>)}
                            </select>
                        </Field>
                    )}

                    <Field label="From">
                        <input className={inputClass} type="date" value={startDate} onChange={event => {
                            setStartDate(event.target.value)
                            setPage(1)
                        }} />
                    </Field>
                    <Field label="To">
                        <input className={inputClass} type="date" value={endDate} onChange={event => {
                            setEndDate(event.target.value)
                            setPage(1)
                        }} />
                    </Field>
                    <label className="relative grid min-w-0 gap-1 text-[11px] font-bold uppercase text-slate-500 sm:col-span-2">
                        Search
                        <Search className="absolute bottom-3 left-3 h-4 w-4 text-slate-400" />
                        <input className={inputClass + " pl-9"} value={search} onChange={event => {
                            setSearch(event.target.value)
                            setPage(1)
                        }} placeholder="Student, ID, or faculty" />
                    </label>
                </div>

                {/* Batch/Class selectors - Chip-style UX */}
                {kind !== "faculty" && (
                    <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold uppercase text-slate-500">Batch / Class</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                            <button
                                onClick={() => { setStandard(""); setDivision(""); setPage(1); }}
                                className={"px-4 py-1.5 text-sm font-semibold rounded-full border transition-all " + (!standard ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                            >
                                All Batches
                            </button>
                            {standards.map(value => (
                                <button
                                    key={value}
                                    onClick={() => { setStandard(value); setDivision(""); setPage(1); }}
                                    className={"px-4 py-1.5 text-sm font-semibold rounded-full border transition-all " + (standard === value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                >
                                    {getStandardLabel(value, department)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Division selector buttons/chips */}
                {kind !== "faculty" && standard && divisions.length > 0 && (
                    <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                        <span className="text-[11px] font-bold uppercase text-slate-500">Division</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                            <button
                                onClick={() => { setDivision(""); setPage(1); }}
                                className={"px-4 py-1.5 text-sm font-semibold rounded border transition-all " + (!division ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                            >
                                All
                            </button>
                            {divisions.map(value => (
                                <button
                                    key={value}
                                    onClick={() => { setDivision(value); setPage(1); }}
                                    className={"px-4 py-1.5 text-sm font-semibold rounded border transition-all " + (division === value ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")}
                                >
                                    {value}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            {loading ? (
                <div className="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
                    <ThreeBallLoader label={"Loading " + title.toLowerCase() + "..."} />
                </div>
            ) : error ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
                    <XCircle className="mx-auto h-7 w-7 text-rose-500" />
                    <p className="mt-2 font-semibold text-rose-800">{error}</p>
                    <button onClick={() => { setPage(1); setError(""); }} className="mt-3 rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Try again</button>
                </div>
            ) : (
                <>
                    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                        {kind === "attendance" && (
                            <>
                                {response?.schedules && response.schedules.length > 0 ? (
                                    <>
                                        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 p-2">
                                            {response.schedules.map(sched => (
                                                <button
                                                    key={sched.id}
                                                    onClick={() => setSelectedSchedule(sched.id)}
                                                    className={"px-4 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap " + (selectedSchedule === sched.id ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-200")}
                                                >
                                                    {sched.name}
                                                </button>
                                            ))}
                                        </div>
                                        <AttendanceTable response={response} selectedSchedule={selectedSchedule} />
                                    </>
                                ) : (
                                    <div className="p-8 text-center text-slate-500">
                                        No attendance records found for the selected filters.
                                    </div>
                                )}
                            </>
                        )}
                        {kind === "progress" && (
                            response?.data && response.data.length > 0 ? (
                                <ProgressTable rows={response.data as StudentRow[]} />
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    No progress records found for the selected filters.
                                </div>
                            )
                        )}
                        {kind === "faculty" && (
                            response?.data && response.data.length > 0 ? (
                                <FacultyTable rows={response.data as FacultyRow[]} />
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    No faculty records found for the selected filters.
                                </div>
                            )
                        )}
                    </section>
                    
                    <div className="flex items-center justify-between text-sm text-slate-500 print:hidden">
                        <span>
                            {pagination.total ? pagination.offset + 1 : 0} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button aria-label="Previous page" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="min-w-9 text-center font-semibold text-slate-700">{page}</span>
                            <button aria-label="Next page" disabled={!pagination.has_more} onClick={() => setPage(value => value + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white">
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

function Summary({ kind, response, selectedSchedule }: { kind: ManagementReportKind; response: ReportResponse | null; selectedSchedule?: string }) {
    if (kind === "faculty") {
        const totals = response?.totals || {}
        const percent = totals.required_classes ? Math.round((totals.marked_classes || 0) / totals.required_classes * 1000) / 10 : 0
        return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Attended" value={totals.marked_classes || 0} tone="green" />
                <StatCard label="Pending" value={totals.not_marked_classes || 0} tone="red" />
                <StatCard label="Cancelled" value={totals.cancelled_classes || 0} tone="orange" />
                <StatCard label="Completion" value={percent + "%"} tone="blue" />
            </div>
        )
    }
    
    if (kind === "progress") {
        const summary = response?.summary || {}
        return (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Students" value={summary.students || 0} tone="blue" />
                <StatCard label="Present Marks" value={summary.present || 0} tone="green" />
                <StatCard label="Absent Marks" value={summary.absent || 0} tone="red" />
                <StatCard label="Recited Days" value={summary.recited_days || 0} tone="orange" />
            </div>
        )
    }
    
    // Attendance
    const schedule = response?.schedules?.find(s => s.id === selectedSchedule) || response?.schedules?.[0]
    const schedSummary = schedule?.summary || { total_classes: 0, completed: 0, cancelled: 0, pending: 0 }
    
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Classes" value={schedSummary.total_classes || 0} tone="blue" />
            <StatCard label="Attendance Taken" value={schedSummary.completed || 0} tone="green" />
            <StatCard label="Canceled" value={schedSummary.cancelled || 0} tone="orange" />
            <StatCard label="Remaining" value={schedSummary.pending || 0} tone="red" />
        </div>
    )
}

function EmptyRows({ columns }: { columns: number }) {
    return (
        <tr>
            <td colSpan={columns} className="h-40 px-4 text-center text-sm text-slate-500">
                No report data matches these filters.
            </td>
        </tr>
    )
}

function AttendanceTable({ response, selectedSchedule }: { response: ReportResponse | null; selectedSchedule: string }) {
    const schedule = response?.schedules?.find(s => s.id === selectedSchedule) || response?.schedules?.[0]
    const dates = response?.dates || []
    const rows = (schedule?.data || []) as StudentRow[]
    
    return (
        <>
            <div className="overflow-auto max-h-[600px] border-b border-slate-100">
                <table className="min-w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="sticky left-0 z-30 min-w-60 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left"># Student Name</th>
                            {dates.map(date => <th key={date} className="min-w-12 border-b border-r border-slate-200 px-2 py-3 text-center">{Number(date.slice(8))}</th>)}
                            {["Present", "Absent", "Leave", "Total", "%"].map(label => <th key={label} className="min-w-16 border-b border-slate-200 px-2 py-3 text-center">{label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {!rows.length && <EmptyRows columns={dates.length + 6} />}
                        {rows.map((row, idx) => (
                            <tr key={row.adm_no} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50">
                                    <div className="flex gap-2">
                                        <span className="text-slate-500 w-4">{idx + 1}</span>
                                        <div>
                                            <div className="font-semibold text-slate-900 uppercase">{row.name}</div>
                                            <div className="text-xs text-slate-500">{row.adm_no}</div>
                                        </div>
                                    </div>
                                </td>
                                {dates.map(date => {
                                    const value = row.cells?.[date] || "-"
                                    const displayVal = value === 'P' ? '✓' : value === 'A' ? 'X' : value === '-' ? '#' : value
                                    return (
                                        <td key={date} title={date} className="border-r border-slate-100 px-2 py-3 text-center">
                                            <span className={"inline-grid h-7 w-7 place-items-center rounded text-xs font-bold " + statusStyle(value)}>
                                                {displayVal}
                                            </span>
                                        </td>
                                    )
                                })}
                                <td className="px-2 text-center font-semibold text-emerald-700">{row.present || 0}</td>
                                <td className="px-2 text-center font-semibold text-rose-700">{row.absent || 0}</td>
                                <td className="px-2 text-center text-amber-700">{row.leave || 0}</td>
                                <td className="px-2 text-center font-semibold text-slate-700">{row.total || 0}</td>
                                <td className="px-2 text-center font-bold text-slate-900">{row.percentage || 0}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
                <span><b className="text-emerald-700">✓</b> Present</span>
                <span><b className="text-rose-700">X</b> Absent</span>
                <span><b className="text-amber-700">L</b> Leave</span>
                <span><b className="text-slate-500">C</b> Cancelled</span>
                <span><b className="text-slate-700">#</b> No Schedule</span>
                <span><b className="text-blue-700">I</b> Institutional Leave</span>
                <span><b className="text-violet-700">FL</b> Faculty Long Leave</span>
                <span><b className="text-indigo-700">SM</b> Student Movements</span>
                <span><b className="text-cyan-700">IL</b> Internal Leave</span>
            </div>
        </>
    )
}

function ProgressTable({ rows }: { rows: StudentRow[] }) {
    return (
        <div className="overflow-auto">
            <table className="min-w-[1050px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        {["Student", "Class", "Present", "Absent", "Leave", "Cancelled", "Pending", "Attendance", "Recited Days", "New", "Recent", "Juz"].map(label => <th key={label} className="border-b border-slate-200 px-4 py-3 text-left">{label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {!rows.length && <EmptyRows columns={12} />}
                    {rows.map(row => (
                        <tr key={row.adm_no} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3"><div className="font-semibold text-slate-900">{row.name}</div><div className="text-xs text-slate-500">{row.adm_no}</div></td>
                            <td className="px-4">{row.standard}{row.division ? " - " + row.division : ""}</td>
                            <td className="px-4 font-semibold text-emerald-700">{row.present || 0}</td>
                            <td className="px-4 font-semibold text-rose-700">{row.absent || 0}</td>
                            <td className="px-4 text-amber-700">{row.leave || 0}</td>
                            <td className="px-4 text-slate-500">{row.cancelled || 0}</td>
                            <td className="px-4 text-blue-700">{row.pending || 0}</td>
                            <td className="px-4 font-bold">{row.attendance_percentage || 0}%</td>
                            <td className="px-4 font-semibold">{row.recited_days || 0}</td>
                            <td className="px-4">{row.new_entries || 0}</td>
                            <td className="px-4">{row.recent_entries || 0}</td>
                            <td className="px-4">{row.juz_entries || 0}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function FacultyTable({ rows }: { rows: FacultyRow[] }) {
    return (
        <div className="overflow-auto">
            <table className="min-w-[950px] w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                        {["Faculty", "Role", "Students", "Planned", "Attended", "Pending", "Cancelled", "Required", "Completion"].map(label => <th key={label} className="border-b border-slate-200 px-4 py-3 text-left">{label}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {!rows.length && <EmptyRows columns={9} />}
                    {rows.map(row => (
                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                            <td className="px-4 text-slate-600">{row.role_label || "Mentor"}</td>
                            <td className="px-4">{row.assigned_students || 0}</td>
                            <td className="px-4">{row.planned_classes || 0}</td>
                            <td className="px-4 font-semibold text-emerald-700">{row.marked_classes || 0}</td>
                            <td className="px-4 font-semibold text-rose-700">{row.not_marked_classes || 0}</td>
                            <td className="px-4 text-slate-500">{row.cancelled_classes || 0}</td>
                            <td className="px-4">{row.required_classes || 0}</td>
                            <td className="px-4">
                                <span className={"inline-flex rounded px-2 py-1 text-xs font-bold " + (row.marking_percentage >= 80 ? "bg-emerald-50 text-emerald-700" : row.marking_percentage >= 60 ? "bg-orange-50 text-orange-700" : "bg-rose-50 text-rose-700")}>
                                    {row.marking_percentage || 0}%
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
`;

fs.writeFileSync(path, code, 'utf8');
console.log('Frontend rewritten successfully.');
