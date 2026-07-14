"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Database, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"

type AcademicYear = {
    id: string
    name: string
    start_date: string
    end_date: string
    is_current?: boolean
    year_locked?: boolean
}

type Health = {
    active_students: number
    school_enrollments: number
    madrasa_enrollments: number
    snapshots: number
    active_hifz_profiles: number
    active_students_missing_snapshot: number
}

type MigrationReport = {
    id: string
    migration_name: string
    total_students: number
    school_enrollments_created: number
    madrasa_enrollments_created: number
    hifz_profiles_created: number
    snapshots_created: number
    skipped_missing_standard: number
    created_at: string
    warnings?: string[]
}

export default function AcademicHistoryPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [selectedYear, setSelectedYear] = useState("")
    const [health, setHealth] = useState<Health | null>(null)
    const [reports, setReports] = useState<MigrationReport[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    const selected = useMemo(() => years.find((year) => year.id === selectedYear), [selectedYear, years])

    async function load() {
        setLoading(true)
        setError("")
        try {
            const yearsRes = await api.get("/academic-history/years")
            const yearRows = yearsRes.data?.data || []
            setYears(yearRows)
            const activeYear = selectedYear || yearRows.find((year: AcademicYear) => year.is_current)?.id || yearRows[0]?.id || ""
            setSelectedYear(activeYear)

            const [healthRes, reportsRes] = await Promise.all([
                activeYear ? api.get("/academic-history/health", { params: { academic_year_id: activeYear } }) : Promise.resolve({ data: { health: null } }),
                api.get("/academic-history/migration-reports"),
            ])
            setHealth(healthRes.data?.health || null)
            setReports(reportsRes.data?.data || [])
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || "Unable to load academic history status")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (!selectedYear) return
        api.get("/academic-history/health", { params: { academic_year_id: selectedYear } })
            .then((res) => setHealth(res.data?.health || null))
            .catch((err) => setError(err?.response?.data?.error || err?.message || "Unable to load academic history status"))
    }, [selectedYear])

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-5">
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Academic Year</p>
                                <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">History Layer</h1>
                                <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-500">
                                    Verify academic-year snapshots, enrollment history, Hifz profiles, and migration reports.
                                </p>
                            </div>
                        </div>
                        <Button onClick={load} disabled={loading} variant="outline" className="gap-2">
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </section>

                {error && (
                    <section className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm font-bold leading-6">{error}</p>
                    </section>
                )}

                <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <Database className="h-5 w-5 text-slate-700" />
                            <h2 className="text-lg font-black text-slate-950">Academic Year</h2>
                        </div>
                        <select
                            value={selectedYear}
                            onChange={(event) => setSelectedYear(event.target.value)}
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
                        >
                            {years.map((year) => (
                                <option key={year.id} value={year.id}>{year.name}</option>
                            ))}
                        </select>
                        <div className="mt-4 space-y-2">
                            <Info label="Current" value={selected?.is_current ? "Yes" : "No"} />
                            <Info label="Locked" value={selected?.year_locked ? "Yes" : "No"} />
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <h2 className="text-lg font-black text-slate-950">Snapshot Health</h2>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Metric label="Active Students" value={health?.active_students ?? "-"} />
                            <Metric label="School Enrollments" value={health?.school_enrollments ?? "-"} />
                            <Metric label="Snapshots" value={health?.snapshots ?? "-"} />
                            <Metric label="Madrasa Enrollments" value={health?.madrasa_enrollments ?? "-"} />
                            <Metric label="Hifz Profiles" value={health?.active_hifz_profiles ?? "-"} />
                            <Metric label="Missing Snapshots" value={health?.active_students_missing_snapshot ?? "-"} tone={health?.active_students_missing_snapshot ? "amber" : "emerald"} />
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-center gap-2">
                        <LockKeyhole className="h-5 w-5 text-slate-700" />
                        <h2 className="text-lg font-black text-slate-950">Migration Reports</h2>
                    </div>
                    <div className="space-y-3">
                        {reports.length ? reports.map((report) => (
                            <div key={report.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-black text-slate-800">{report.migration_name}</p>
                                    <p className="text-xs font-bold text-slate-400">{new Date(report.created_at).toLocaleString()}</p>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                                    <Info label="Students" value={report.total_students} compact />
                                    <Info label="School Rows" value={report.school_enrollments_created} compact />
                                    <Info label="Madrasa Rows" value={report.madrasa_enrollments_created} compact />
                                    <Info label="Hifz Profiles" value={report.hifz_profiles_created} compact />
                                    <Info label="Snapshots" value={report.snapshots_created} compact />
                                </div>
                            </div>
                        )) : (
                            <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-500">
                                No migration reports found yet.
                            </p>
                        )}
                    </div>
                </section>
            </div>
        </main>
    )
}

function Metric({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "amber" | "emerald" }) {
    const toneClass = tone === "amber" ? "text-amber-600" : tone === "emerald" ? "text-emerald-600" : "text-slate-950"
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className={`text-2xl font-black ${toneClass}`}>{value}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    )
}

function Info({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
    return (
        <div className={`rounded-lg border border-slate-200 bg-white ${compact ? "p-2" : "p-3"}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
        </div>
    )
}
