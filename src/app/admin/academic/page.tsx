"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
    ArrowRight,
    CalendarDays,
    ClipboardList,
    Users,
    CheckCircle2,
    AlertCircle,
    BookOpen,
    RefreshCw,
} from "lucide-react"
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

const actions = [
    {
        href: "/admin/setup/academic-years",
        icon: CalendarDays,
        title: "Academic Years",
        detail: "Create, edit, and set the active academic year",
        step: 1,
        color: "blue",
    },
    {
        href: "/admin/academic/enrollments",
        icon: Users,
        title: "Student Placement",
        detail: "Set student standards, Non-class placements, and divisions",
        step: 2,
        color: "indigo",
    },
    {
        href: "/admin/reports/yearly",
        icon: ClipboardList,
        title: "Yearly Student Reports",
        detail: "Attendance, Hifz progress, leave, and exam summary per year",
        step: 4,
        color: "emerald",
    },
]

const colorMap: Record<string, { card: string; icon: string; badge: string }> = {
    blue:    { card: "hover:border-blue-200 hover:bg-blue-50/40",   icon: "bg-blue-100 text-blue-700",   badge: "bg-blue-600" },
    indigo:  { card: "hover:border-indigo-200 hover:bg-indigo-50/40", icon: "bg-indigo-100 text-indigo-700", badge: "bg-indigo-600" },
    violet:  { card: "hover:border-violet-200 hover:bg-violet-50/40", icon: "bg-violet-100 text-violet-700", badge: "bg-violet-600" },
    emerald: { card: "hover:border-emerald-200 hover:bg-emerald-50/40", icon: "bg-emerald-100 text-emerald-700", badge: "bg-emerald-600" },
}

export default function AcademicHubPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    const currentYear = useMemo(() => years.find((y) => y.is_current) || years[0], [years])

    async function load() {
        setLoading(true)
        setError("")
        try {
            const res = await api.get("/academic-history/years")
            setYears(res.data?.data || [])
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.message || "Unable to load academic years")
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])

    const setupComplete = !!(currentYear)

    return (
        <main className="space-y-6">
            {/* Header / Current Year Status */}
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow">
                            <BookOpen className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-blue-600">Academic Year</p>
                            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-950">
                                {loading ? "Loading..." : currentYear?.name || "No academic year set up"}
                            </h1>
                            {currentYear ? (
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    {currentYear.start_date?.slice(0, 10)} - {currentYear.end_date?.slice(0, 10)}
                                </p>
                            ) : (
                                <p className="mt-1 text-sm font-semibold text-amber-600">
                                    Create an academic year to begin using the system.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Status pills */}
                        {currentYear && (
                            <div className="flex flex-wrap gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${currentYear.year_locked ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>
                                    {currentYear.year_locked
                                        ? <><AlertCircle className="h-3 w-3" /> Year Locked</>
                                        : <><CheckCircle2 className="h-3 w-3" /> Active Year</>
                                    }
                                </span></div>
                        )}
                        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
                {error && (
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                        {error}
                    </p>
                )}
            </section>

            {/* What to do next */}
            {!setupComplete && !loading && (
                <section className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <p className="text-sm font-bold text-amber-800">
                        ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ¢â‚¬Â¹ <strong>Getting started:</strong> First, create an Academic Year (Step 1 below). Then place students in standards and divisions (Step 2). Once the year is underway, you can view yearly reports anytime (Step 4).
                    </p>
                </section>
            )}

            {/* Action cards */}
            <section>
                <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Workflow</h2>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {actions.map((action) => {
                        const c = colorMap[action.color]
                        const Icon = action.icon
                        return (
                            <Link
                                key={action.href}
                                href={action.href}
                                className={`group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 ${c.card} hover:shadow-md`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.icon}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black text-white ${c.badge}`}>
                                        {action.step}
                                    </span>
                                </div>
                                <h3 className="mt-4 text-sm font-black text-slate-950">{action.title}</h3>
                                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{action.detail}</p>
                                <div className="mt-3 flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-slate-700 transition-colors">
                                    Open <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                                </div>
                            </Link>
                        )
                    })}
                </div>
            </section>

            {/* Other Academic Years */}
            {years.length > 1 && (
                <section>
                    <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">All Academic Years</h2>
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
                        {years.map((year) => (
                            <div key={year.id} className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-black text-slate-950">{year.name}</span>
                                    {year.is_current && (
                                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700">Current</span>
                                    )}
                                    {year.year_locked && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Locked</span>
                                    )}
                                </div>
                                <span className="text-xs font-semibold text-slate-400">
                                    {year.start_date?.slice(0, 10)} - {year.end_date?.slice(0, 10)}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </main>
    )
}
