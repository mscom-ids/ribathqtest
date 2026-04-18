"use client"

import { useState, useEffect, useMemo } from "react"
import {
    format, startOfMonth, endOfMonth, subDays, isWithinInterval,
    eachDayOfInterval, getDay,
} from "date-fns"
import {
    Loader2, ChevronLeft, ChevronRight, BookOpen, RotateCcw,
    BookMarked, TrendingUp, Calendar,
} from "lucide-react"
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, resolveBackendUrl } from "@/lib/utils"
import api from "@/lib/api"
import { calculatePages, MUSHAF_PAGES } from "@/lib/quran-pages"
import { getSurahId, formatHifzLogLabel, toGlobalVerseIndex } from "@/lib/hifz-progress"

// ── Types ────────────────────────────────────────────────────────────────────
type Log = {
    id: string
    entry_date: string
    mode: string
    surah_name?: string
    start_v?: number
    end_v?: number
    start_page?: number
    end_page?: number
    juz_number?: number
    juz_portion?: string
    recorded_by_name?: string
}

type AttendanceRecord = {
    date: string
    status: string
    department?: string
}

type Props = {
    open: boolean
    onClose: () => void
    student: {
        adm_no: string
        name: string
        standard: string | null
        photo_url?: string | null
    } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const getPhotoUrl = (url?: string | null) => resolveBackendUrl(url)

function logLabel(log: Log) {
    return formatHifzLogLabel(log);
}

const MODE_DOT: Record<string, string> = {
    "New Verses": "bg-blue-500",
    "Recent Revision": "bg-orange-500",
    "Juz Revision": "bg-emerald-500",
    "Juz Revision (New)": "bg-blue-500",
    "Juz Revision (Old)": "bg-emerald-500",
}

// ── Week grouper (same logic as admin progress-tab) ──────────────────────────
function buildWeeklyReport(allLogs: Log[], attendanceRecords: AttendanceRecord[], month: Date) {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

    const monthLogs = allLogs.filter(l =>
        isWithinInterval(new Date(l.entry_date), { start: monthStart, end: monthEnd })
    )

    const weeks: { days: Date[]; weekNum: number }[] = []
    let currentWeek: Date[] = []
    let weekNum = 1

    allDays.forEach((day, i) => {
        currentWeek.push(day)
        if (getDay(day) === 4 || i === allDays.length - 1) {
            weeks.push({ days: [...currentWeek], weekNum })
            currentWeek = []
            weekNum++
        }
    })

    return weeks.map(week => {
        const dayRows = week.days.map(day => {
            const dateStr = format(day, "yyyy-MM-dd")
            const dow = getDay(day)

            const dayLogs = monthLogs.filter(
                l => format(new Date(l.entry_date), "yyyy-MM-dd") === dateStr
            )
            const newVerses = dayLogs.filter(l => l.mode === "New Verses")
            const recentRev = dayLogs.filter(l => l.mode === "Recent Revision")
            const juzRev = dayLogs.filter(l => l.mode === "Juz Revision")
            const newRevHafiz = dayLogs.filter(l => l.mode === "Juz Revision (New)")
            const oldRevHafiz = dayLogs.filter(l => l.mode === "Juz Revision (Old)")

            const att = attendanceRecords.filter(
                r => format(new Date(r.date), "yyyy-MM-dd") === dateStr &&
                     r.department?.toLowerCase() === "hifz"
            )
            const isPresent = att.some(r => r.status === "Present")
            const isAbsent = att.some(r => r.status === "Absent")

            const newHifzEntries = newVerses.map(l => formatHifzLogLabel(l)).filter(Boolean)
            const recentRevEntries = recentRev.map(l => formatHifzLogLabel(l)).filter(Boolean)
            const juzRevEntries = juzRev.map(l => formatHifzLogLabel(l)).filter(Boolean)
            const newRevHafizEntries = newRevHafiz.map(l => formatHifzLogLabel(l)).filter(Boolean)
            const oldRevHafizEntries = oldRevHafiz.map(l => formatHifzLogLabel(l)).filter(Boolean)

            return {
                date: day,
                dateStr,
                dayNum: format(day, "d"),
                dayName: format(day, "EEE"),
                isFriday: dow === 5,
                isWeekend: dow === 6,
                hasLogs: dayLogs.length > 0,
                attendance: isPresent ? "P" : isAbsent ? "A" : dow === 5 ? "—" : "",
                newHifzEntries,
                recentRevEntries,
                juzRevEntries,
                newRevHafizEntries,
                oldRevHafizEntries,
            }
        })

        const totalNewHafiz = dayRows.filter(d => d.newRevHafizEntries.length > 0).length
        const totalOldHafiz = dayRows.filter(d => d.oldRevHafizEntries.length > 0).length

        return {
            weekNum: week.weekNum,
            days: dayRows,
            summary: {
                totalNew: dayRows.filter(d => d.newHifzEntries.length > 0).length,
                totalRecent: dayRows.filter(d => d.recentRevEntries.length > 0).length,
                totalJuz: dayRows.filter(d => d.juzRevEntries.length > 0).length,
                totalNewHafiz,
                totalOldHafiz,
            },
        }
    })
}

// ── Component ────────────────────────────────────────────────────────────────
export function HifzProgressModal({ open, onClose, student }: Props) {
    const [loading, setLoading] = useState(false)
    const [reportMonth, setReportMonth] = useState(new Date())
    const [allLogs, setAllLogs] = useState<Log[]>([])
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([])
    const [lifetimeLogs, setLifetimeLogs] = useState<Log[]>([])
    const [isHafiz, setIsHafiz] = useState(false)

    // Reset month when a new student is opened
    useEffect(() => {
        if (!open || !student) return
        setReportMonth(new Date())
    }, [open, student?.adm_no])

    // Reload on month change
    useEffect(() => {
        if (!open || !student) return
        load()
    }, [open, student?.adm_no, reportMonth])

    async function load() {
        if (!student) return
        setLoading(true)
        try {
            const monthStart = startOfMonth(reportMonth)
            const monthEnd = endOfMonth(reportMonth)
            const startStr = format(monthStart, "yyyy-MM-dd")
            const endStr = format(monthEnd, "yyyy-MM-dd")

            const [logsRes, attRes, lifetimeRes] = await Promise.all([
                api.get("/hifz/logs", {
                    params: {
                        student_id: student.adm_no,
                        start_date: monthStart.toISOString(),
                        end_date: monthEnd.toISOString(),
                    },
                }),
                api.get("/academics/attendance", {
                    params: {
                        student_id: student.adm_no,
                        start_date: startStr,
                        end_date: endStr,
                        department: "Hifz",
                    },
                }),
                api.get("/hifz/logs", {
                    params: { student_id: student.adm_no, mode: "New Verses" },
                }),
            ])

            setAllLogs(logsRes.data?.logs || [])
            setAttendanceRecords(attRes.data?.data || [])
            setLifetimeLogs(lifetimeRes.data?.logs || [])
        } catch { /* non-blocking */ }
        setLoading(false)
    }

    // ── Derived stats ────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const monthStart = startOfMonth(reportMonth)
        const monthEnd = endOfMonth(reportMonth)
        const monthLogs = allLogs.filter(l =>
            isWithinInterval(new Date(l.entry_date), { start: monthStart, end: monthEnd })
        )

        let hifzPages = 0
        const recentRevDates = new Set<string>()
        let juzRevTotal = 0
        let newRevCount = 0
        let oldRevCount = 0

        monthLogs.forEach(log => {
            if (log.mode === "New Verses") {
                const sid = getSurahId(log.surah_name || "")
                let p = 0
                if (sid && log.start_v && log.end_v) {
                    p = calculatePages(sid, log.start_v, sid, log.end_v)
                } else if (log.start_page && log.end_page) {
                    p = log.start_page === log.end_page ? 0.5 : log.end_page - log.start_page + 1
                }
                hifzPages += p
            } else if (log.mode === "Recent Revision") {
                recentRevDates.add(format(new Date(log.entry_date), "yyyy-MM-dd"))
            } else if (log.mode?.startsWith("Juz Revision")) {
                const p = log.juz_portion
                if (p === "Full") juzRevTotal += 1
                else if (p?.includes("Half")) juzRevTotal += 0.5
                else if (p?.startsWith("Q")) juzRevTotal += 0.25
                else juzRevTotal += 1

                if (log.mode === "Juz Revision (New)") newRevCount += 1
                if (log.mode === "Juz Revision (Old)") oldRevCount += 1
            }
        })

        // ── Lifetime Hifz Pages (merge ranges + MUSHAF_PAGES boundary check) ──
        const lifetimeRanges: { start: number; end: number }[] = []
        let lifetimeFallbackPages = 0

        lifetimeLogs.forEach(log => {
            const sId = getSurahId(log.surah_name || "")
            if (sId && log.start_v && log.end_v) {
                const startG = toGlobalVerseIndex(sId, log.start_v)
                const endG = toGlobalVerseIndex(sId, log.end_v)
                if (startG >= 0 && endG >= 0) {
                    lifetimeRanges.push({ start: Math.min(startG, endG), end: Math.max(startG, endG) })
                }
            } else if (log.start_page && log.end_page) {
                lifetimeFallbackPages += (log.end_page - log.start_page + 1)
            }
        })

        let lifetimePages = lifetimeFallbackPages

        if (lifetimeRanges.length > 0) {
            lifetimeRanges.sort((a, b) => a.start - b.start)
            const merged: { start: number; end: number }[] = [lifetimeRanges[0]]
            for (let i = 1; i < lifetimeRanges.length; i++) {
                const cur = merged[merged.length - 1]
                const next = lifetimeRanges[i]
                if (next.start <= cur.end + 1) {
                    if (next.end > cur.end) cur.end = next.end
                } else {
                    merged.push({ ...next })
                }
            }
            // Count fully-covered pages using MUSHAF_PAGES boundaries
            const pageBounds = MUSHAF_PAGES.map((p, i) => {
                const startGlobal = toGlobalVerseIndex(p.surah, p.ayah)
                let endGlobal: number
                if (i + 1 < MUSHAF_PAGES.length) {
                    const nextP = MUSHAF_PAGES[i + 1]
                    endGlobal = toGlobalVerseIndex(nextP.surah, nextP.ayah) - 1
                } else {
                    endGlobal = toGlobalVerseIndex(114, 6)
                }
                return { startGlobal, endGlobal }
            })
            for (const pb of pageBounds) {
                for (const range of merged) {
                    if (range.start <= pb.endGlobal && range.end >= pb.endGlobal) {
                        lifetimePages++
                        break
                    }
                }
            }
        }

        const calcTotalJuz = Math.min(Math.floor(lifetimePages / 20), 30)
        setIsHafiz(calcTotalJuz >= 30)

        return {
            hifzPages: parseFloat(hifzPages.toFixed(2)),
            recentRevisionDays: recentRevDates.size,
            juzRevision: parseFloat(juzRevTotal.toFixed(2)),
            totalJuz: calcTotalJuz,
            newRevisionCount: newRevCount,
            oldRevisionCount: oldRevCount,
        }
    }, [allLogs, lifetimeLogs, reportMonth])

    // ── Weekly report ────────────────────────────────────────────────────────
    const weeklyReport = useMemo(() =>
        buildWeeklyReport(allLogs, attendanceRecords, reportMonth),
        [allLogs, attendanceRecords, reportMonth]
    )

    // ── Recent logs — last 3 days only ────────────────────────────────────────
    const recentLogs = useMemo(() => {
        const cutoff = subDays(new Date(), 3)
        return [...allLogs]
            .filter(l => new Date(l.entry_date) >= cutoff)
            .reverse()
    }, [allLogs])

    const statCards = isHafiz ? [
        { label: "Total Juz Rev.",  value: stats.juzRevision,         color: "bg-orange-50 text-orange-600", icon: BookMarked },
        { label: "New Rev.",        value: stats.newRevisionCount,     color: "bg-blue-50 text-blue-600",     icon: BookOpen },
        { label: "Old Rev.",        value: stats.oldRevisionCount,     color: "bg-emerald-50 text-emerald-600",icon: RotateCcw },
        { label: "Total Juz",      value: stats.totalJuz,             color: "bg-purple-50 text-purple-600", icon: TrendingUp },
    ] : [
        { label: "Hifz Pages",  value: stats.hifzPages,          color: "bg-blue-50 text-blue-600",     icon: BookOpen },
        { label: "Rev. Days",   value: stats.recentRevisionDays,  color: "bg-orange-50 text-orange-600", icon: RotateCcw },
        { label: "Juz Rev.",    value: stats.juzRevision,         color: "bg-emerald-50 text-emerald-600",icon: BookMarked },
        { label: "Total Juz",  value: stats.totalJuz,             color: "bg-purple-50 text-purple-600", icon: TrendingUp },
    ]

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            {/*
                showCloseButton={false} — prevents the auto close X from dialog.tsx
                so we get only ONE close button (the built-in Radix one we disable here,
                while our custom compact header handles closing via onOpenChange).
                We pass showCloseButton={false} to avoid the absolute-positioned X
                clashing with our custom header layout.
            */}
            <DialogContent
                showCloseButton={false}
                className="max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden"
            >
                {/* ── Visually-present DialogTitle (satisfies Radix a11y) + custom header ── */}
                <DialogHeader className="shrink-0 p-0">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
                        {student && (
                            <>
                                <Avatar className="h-10 w-10 rounded-xl shrink-0">
                                    <AvatarImage src={getPhotoUrl(student.photo_url)} className="object-cover" />
                                    <AvatarFallback className="rounded-xl bg-[#e8ebfd] text-[#3d5ee1] font-bold text-sm">
                                        {student.name.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <DialogTitle className="font-bold text-slate-900 dark:text-white text-sm truncate leading-tight">
                                        {student.name}
                                    </DialogTitle>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {student.adm_no}{student.standard ? ` · ${student.standard}` : ""} · Hifz Progress
                                    </p>
                                </div>
                            </>
                        )}
                        {/* Single close button — aligned to header */}
                        <button
                            onClick={onClose}
                            className="ml-auto shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                </DialogHeader>

                {/* ── Month navigator ─────────────────────────────────────── */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <button
                        onClick={() => setReportMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {format(reportMonth, "MMMM yyyy")}
                    </div>
                    <button
                        onClick={() => setReportMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))}
                        className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* ── Scrollable body ─────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0f172a]">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
                        </div>
                    ) : (
                        <div className="p-5 space-y-6">

                            {/* ── 1. Summary stat cards ────────────────────── */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {statCards.map(s => {
                                    const Icon = s.icon
                                    const [bg, text] = s.color.split(" ")
                                    return (
                                        <div key={s.label} className={`rounded-xl p-3.5 ${bg}`}>
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <Icon className={`h-3.5 w-3.5 ${text}`} />
                                                <p className="text-[11px] font-semibold text-slate-500">{s.label}</p>
                                            </div>
                                            <p className={`text-2xl font-black ${text}`}>{s.value}</p>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* ── 2. Weekly Hifz Report ────────────────────── */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Weekly Hifz Report
                                    </p>
                                    <span className="text-[10px] text-slate-300">—</span>
                                    <p className="text-[10px] text-slate-400">Monthly breakdown by week</p>
                                </div>

                                {weeklyReport.length === 0 ? (
                                    <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                                        No data for this month.
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {weeklyReport.map(week => (
                                            <div key={week.weekNum} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-indigo-50 dark:bg-indigo-900/30">
                                                            <th className="text-left py-2 px-3 text-indigo-600 dark:text-indigo-300 font-bold text-xs" colSpan={4}>
                                                                Week {week.weekNum}
                                                            </th>
                                                        </tr>
                                                        <tr className="bg-slate-100 dark:bg-[#1a2035] text-xs text-slate-500 dark:text-slate-400">
                                                            <th className="py-1.5 px-3 text-left font-semibold w-[70px]">Date</th>
                                                            {isHafiz ? (
                                                                <>
                                                                    <th className="py-1.5 px-2 text-left font-semibold">مراجعة جديدة (New Revision)</th>
                                                                    <th className="py-1.5 px-2 text-left font-semibold">مراجعة قديمة (Old Revision)</th>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <th className="py-1.5 px-2 text-left font-semibold">حفظ يومي (New Hifz)</th>
                                                                    <th className="py-1.5 px-2 text-left font-semibold">تسميع (Revision)</th>
                                                                    <th className="py-1.5 px-2 text-left font-semibold">مراجعة (Juz Rev)</th>
                                                                </>
                                                            )}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {week.days.map(day => (
                                                            <tr
                                                                key={day.dateStr}
                                                                className={cn(
                                                                    "border-t border-slate-100 dark:border-slate-700/50 transition-colors",
                                                                    day.isFriday && "bg-orange-50/50 dark:bg-orange-900/10",
                                                                    day.isWeekend && "bg-purple-50/50 dark:bg-purple-900/10",
                                                                    day.hasLogs && "bg-emerald-50/30 dark:bg-emerald-900/10"
                                                                )}
                                                            >
                                                                <td className="py-1.5 px-3">
                                                                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{day.dayNum}</span>
                                                                    <span className="text-slate-400 text-[10px] ml-1">{day.dayName}</span>
                                                                </td>
                                                                {isHafiz ? (
                                                                    <>
                                                                        <td className="py-1.5 px-2 align-top">
                                                                            {day.newRevHafizEntries.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {day.newRevHafizEntries.map((txt: string, idx: number) => (
                                                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] sm:text-xs font-medium border border-blue-100 dark:border-blue-800 break-words whitespace-normal leading-tight">
                                                                                            {txt}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                                        </td>
                                                                        <td className="py-1.5 px-2 align-top">
                                                                            {day.oldRevHafizEntries.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {day.oldRevHafizEntries.map((txt: string, idx: number) => (
                                                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-[10px] sm:text-xs font-medium border border-emerald-100 dark:border-emerald-800 break-words whitespace-normal leading-tight">
                                                                                            {txt}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                                        </td>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <td className="py-1.5 px-2 align-top">
                                                                            {day.newHifzEntries.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {day.newHifzEntries.map((txt, idx) => (
                                                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 text-[10px] sm:text-xs font-medium border border-blue-100 dark:border-blue-800 break-words whitespace-normal leading-tight">
                                                                                            {txt}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                                        </td>
                                                                        <td className="py-1.5 px-2 align-top">
                                                                            {day.recentRevEntries.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {day.recentRevEntries.map((txt, idx) => (
                                                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400 text-[10px] sm:text-xs font-medium border border-orange-100 dark:border-orange-800 break-words whitespace-normal leading-tight">
                                                                                            {txt}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                                        </td>
                                                                        <td className="py-1.5 px-2 align-top">
                                                                            {day.juzRevEntries.length > 0 ? (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {day.juzRevEntries.map((txt, idx) => (
                                                                                        <span key={idx} className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-[10px] sm:text-xs font-medium border border-emerald-100 dark:border-emerald-800 break-words whitespace-normal leading-tight">
                                                                                            {txt}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
                                                                        </td>
                                                                    </>
                                                                )}
                                                            </tr>
                                                        ))}
                                                        <tr className="bg-slate-100 dark:bg-[#1a2035] border-t border-slate-200 dark:border-slate-700 text-xs font-semibold">
                                                            <td className="py-2 px-3 text-slate-500">Summary</td>
                                                            {isHafiz ? (
                                                                <>
                                                                    <td className="py-2 px-2 text-blue-600 dark:text-blue-400">{week.summary.totalNewHafiz} entries</td>
                                                                    <td className="py-2 px-2 text-emerald-600 dark:text-emerald-400">{week.summary.totalOldHafiz} entries</td>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <td className="py-2 px-2 text-blue-600 dark:text-blue-400">{week.summary.totalNew} entries</td>
                                                                    <td className="py-2 px-2 text-orange-600 dark:text-orange-400">{week.summary.totalRecent} entries</td>
                                                                    <td className="py-2 px-2 text-emerald-600 dark:text-emerald-400">{week.summary.totalJuz} entries</td>
                                                                </>
                                                            )}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* ── 3. Recent Activity (last 3 days) ─────────── */}
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                                    Recent Activity (last 3 days)
                                </p>
                                {recentLogs.length === 0 ? (
                                    <div className="text-center py-6 text-sm text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                                        No entries in the last 3 days.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recentLogs.map((log, i) => (
                                            <div
                                                key={log.id ?? i}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                                            >
                                                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${MODE_DOT[log.mode] || "bg-slate-400"}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{log.mode}</p>
                                                    <p className="text-[11px] text-slate-500 break-words whitespace-normal leading-snug">{logLabel(log)}</p>
                                                    {log.recorded_by_name && (
                                                        <p className="text-[10px] text-slate-400 italic mt-0.5">Recorded by: <span className="font-medium text-slate-500 dark:text-slate-300 not-italic">{log.recorded_by_name}</span></p>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-slate-400 shrink-0">
                                                    {format(new Date(log.entry_date), "dd MMM")}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    )}
                </div>

                {/* ── Footer ──────────────────────────────────────────────── */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0f172a] shrink-0">
                    <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-9 text-sm">
                        <a href={`/staff/entry/${student?.adm_no}`}>
                            <BookOpen className="h-3.5 w-3.5 mr-2" /> Record Hifz
                        </a>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
