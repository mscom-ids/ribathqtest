import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { type Student } from "@/app/admin/students/page"
import api from "@/lib/api"
import { format, eachDayOfInterval, startOfMonth, endOfMonth, startOfWeek, addDays, isSameDay, getDay } from "date-fns"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type SessionInfo = {
    id: string; name: string; type: "Hifz" | "School" | "Madrassa"
    start_time: string | null; end_time: string | null; standards: string[] | null
}
type AttendanceRecord = { date: string; session_id: string; status: string; department: string }
type CalendarPolicy = {
    date: string; is_holiday: boolean; day_mode: string
    allowed_session_types: string[] | null; session_overrides: Record<string, string[]> | null
    cancelled_sessions: Record<string, any> | null; leave_standards: string[] | null
}

function getImplicitMode(dow: number) { return dow === 5 ? "Friday" : (dow === 0 || dow === 6) ? "Weekday" : "Normal" }
function getAllowedTypes(mode: string) {
    if (mode === "Friday") return ["School"]
    if (mode === "Weekday") return ["Hifz", "Madrassa"]
    return ["Hifz", "School"]
}

function isSessionApplicable(s: SessionInfo, std: string, d: Date, p?: CalendarPolicy):
    "active" | "cancelled" | "na" | "holiday" | "leave" {
    if (p?.is_holiday) return "holiday"
    if (p?.leave_standards?.includes(std)) return "leave"
    const mode = p?.day_mode || getImplicitMode(getDay(d))
    const types = p?.allowed_session_types || getAllowedTypes(mode)
    if (!types.includes(s.type)) return "na"
    if (p?.cancelled_sessions?.[s.id]) return "cancelled"
    const ov = p?.session_overrides?.[s.id]
    if (ov && ov.length > 0 && !ov.includes(std) && !ov.includes("Hifz")) return "na"
    else if (s.standards && s.standards.length > 0 && !s.standards.includes(std)) return "na"
    return "active"
}

export function AttendanceTab({ student }: { student: Student }) {
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    const [records, setRecords] = useState<AttendanceRecord[]>([])
    const [policies, setPolicies] = useState<Record<string, CalendarPolicy>>({})
    const [loading, setLoading] = useState(true)
    const [viewMonth, setViewMonth] = useState(new Date())
    const [selectedDay, setSelectedDay] = useState<Date | null>(null)
    const [viewMode, setViewMode] = useState<"weekly" | "monthly">("monthly")
    const studentStd = student.standard || ""

    useEffect(() => {
        async function load() {
            setLoading(true)
            const ms = startOfMonth(viewMonth), me = endOfMonth(viewMonth)
            const startStr = format(ms, "yyyy-MM-dd"), endStr = format(me, "yyyy-MM-dd")
            try {
                const [sessRes, attRes, calRes] = await Promise.all([
                    api.get('/academics/sessions'),
                    api.get('/academics/attendance', { params: { student_ids: student.adm_no, start_date: startStr, end_date: endStr } }),
                    api.get('/academics/calendar-range', { params: { start_date: startStr, end_date: endStr } }),
                ])
                if (sessRes.data.success) setSessions(sessRes.data.sessions as SessionInfo[])
                if (attRes.data.success) setRecords(attRes.data.data as AttendanceRecord[])
                if (calRes.data.success) {
                    const m: Record<string, CalendarPolicy> = {}
                    calRes.data.calendars.forEach((p: any) => { m[p.date] = p }); setPolicies(m)
                }
            } catch (err) {
                console.error("Failed to load attendance", err)
            }
            setLoading(false)
        }
        load()
    }, [student.adm_no, viewMonth])

    const sessionsByDept = useMemo(() => {
        const g: Record<string, SessionInfo[]> = { Hifz: [], School: [], Madrassa: [] }
        sessions.forEach(s => { if (g[s.type]) g[s.type].push(s) }); return g
    }, [sessions])

    const monthDays = useMemo(() =>
        eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) })
        , [viewMonth])

    const weekDays = useMemo(() => {
        const ref = selectedDay || new Date()
        const ws = startOfWeek(ref, { weekStartsOn: 0 })
        return eachDayOfInterval({ start: ws, end: addDays(ws, 6) })
    }, [selectedDay])

    const getRec = (dateStr: string, sid: string) => records.find(r => r.date === dateStr && r.session_id === sid)

    // Per-department per-session stats for the month
    const deptStats = useMemo(() => {
        const result: Record<string, {
            overall: { present: number; total: number }
            sessions: Record<string, { present: number; total: number; name: string; time: string }>
        }> = {}

            ; (["Hifz", "School", "Madrassa"] as const).forEach(dept => {
                const deptSessions = sessionsByDept[dept] || []
                const sessionStats: Record<string, { present: number; total: number; name: string; time: string }> = {}
                let totalP = 0, totalT = 0

                deptSessions.forEach(session => {
                    let p = 0, t = 0
                    monthDays.forEach(day => {
                        const ds = format(day, "yyyy-MM-dd")
                        const ap = isSessionApplicable(session, studentStd, day, policies[ds])
                        if (ap === "active") {
                            t++
                            const r = getRec(ds, session.id)
                            if (r?.status === "Present") p++
                        }
                    })
                    const timeStr = session.start_time && session.end_time
                        ? `${session.start_time.slice(0, 5)}–${session.end_time.slice(0, 5)}`
                        : session.start_time ? session.start_time.slice(0, 5) : ""
                    sessionStats[session.id] = { present: p, total: t, name: session.name, time: timeStr }
                    totalP += p; totalT += t
                })

                result[dept] = { overall: { present: totalP, total: totalT }, sessions: sessionStats }
            })
        return result
    }, [monthDays, sessions, records, policies, studentStd, sessionsByDept])

    // Get day cell info for the calendar
    const getDaySessions = (day: Date) => {
        const ds = format(day, "yyyy-MM-dd")
        const pol = policies[ds]
        if (pol?.is_holiday) return { type: "holiday" as const, sessions: [] }
        if (pol?.leave_standards?.includes(studentStd)) return { type: "leave" as const, sessions: [] }

        const active: { name: string; status: string; dept: string }[] = []
        sessions.forEach(s => {
            const ap = isSessionApplicable(s, studentStd, day, pol)
            if (ap === "active") {
                const r = getRec(ds, s.id)
                active.push({ name: s.name, status: r?.status || "—", dept: s.type })
            }
        })
        return { type: "normal" as const, sessions: active }
    }

    if (loading) return <div className="text-center py-12 text-slate-400">Loading attendance data...</div>

    const deptColors = {
        Hifz: { text: "text-emerald-400", bg: "bg-emerald-950/30", border: "border-emerald-800", bar: "bg-emerald-500", badge: "border-emerald-600 text-emerald-400" },
        School: { text: "text-blue-400", bg: "bg-blue-950/30", border: "border-blue-800", bar: "bg-blue-500", badge: "border-blue-600 text-blue-400" },
        Madrassa: { text: "text-purple-400", bg: "bg-purple-950/30", border: "border-purple-800", bar: "bg-purple-500", badge: "border-purple-600 text-purple-400" },
    }

    return (
        <div className="space-y-6">
            {/* Per-Department Session Stats with Progress Bars */}
            {(["Hifz", "School", "Madrassa"] as const).map(dept => {
                const ds = deptStats[dept]
                if (!ds || Object.keys(ds.sessions).length === 0) return null
                const pct = ds.overall.total > 0 ? Math.round((ds.overall.present / ds.overall.total) * 100) : 0
                const c = deptColors[dept]

                return (
                    <Card key={dept} className={cn("border shadow-sm", c.bg, c.border)}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <CardTitle className={cn("text-base", c.text)}>{dept}</CardTitle>
                                    <span className="text-xs text-slate-400">
                                        {Object.keys(ds.sessions).length} session{Object.keys(ds.sessions).length > 1 ? "s" : ""} enrolled
                                    </span>
                                </div>
                                <span className={cn("text-xl font-bold", c.text)}>{pct}%</span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Object.values(ds.sessions).map((s, i) => {
                                const sPct = s.total > 0 ? Math.round((s.present / s.total) * 100) : 0
                                return (
                                    <div key={i} className="space-y-1">
                                        <div className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-slate-200">{s.name}</span>
                                                <span className="text-[10px] text-slate-500">{s.time}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-300 font-semibold">{s.present}</span>
                                                <span className="text-slate-500">/{s.total}</span>
                                                <span className={cn("text-xs font-bold", c.text)}>({sPct}%)</span>
                                            </div>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className={cn("h-full rounded-full transition-all", c.bar)}
                                                style={{ width: `${sPct}%` }} />
                                        </div>
                                    </div>
                                )
                            })}
                        </CardContent>
                    </Card>
                )
            })}

            {/* View Toggle + Month Navigation */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-0.5">
                    <Button size="sm" variant={viewMode === "weekly" ? "default" : "ghost"}
                        className={cn("h-7 text-xs", viewMode === "weekly" && "bg-slate-600")}
                        onClick={() => setViewMode("weekly")}>Weekly</Button>
                    <Button size="sm" variant={viewMode === "monthly" ? "default" : "ghost"}
                        className={cn("h-7 text-xs", viewMode === "monthly" && "bg-emerald-600")}
                        onClick={() => setViewMode("monthly")}>Monthly</Button>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => setViewMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))}>
                        <ChevronLeft size={14} />
                    </Button>
                    <span className="text-sm font-medium min-w-[120px] text-center">{format(viewMonth, "MMMM yyyy")}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7"
                        onClick={() => setViewMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))}>
                        <ChevronRight size={14} />
                    </Button>
                </div>
            </div>

            {/* 30-Day Session Calendar (with session names inside cells) */}
            <Card className="border-none shadow-sm bg-slate-900/50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">30-Day Session Calendar</CardTitle>
                    <CardDescription>Each day cell shows all sessions. Click a day to see detail.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                        {monthDays.map(day => {
                            const cell = getDaySessions(day)
                            const isToday = isSameDay(day, new Date())
                            const isSel = selectedDay && isSameDay(day, selectedDay)

                            let cellBg = "bg-slate-800/40 border-slate-700"
                            if (cell.type === "holiday") cellBg = "bg-red-900/30 border-red-800"
                            else if (cell.type === "leave") cellBg = "bg-amber-900/30 border-amber-800"
                            else {
                                const allP = cell.sessions.every(s => s.status === "Present")
                                const anyA = cell.sessions.some(s => s.status === "Absent")
                                const anyP = cell.sessions.some(s => s.status === "Present")
                                if (cell.sessions.length > 0) {
                                    if (allP) cellBg = "bg-emerald-900/30 border-emerald-800"
                                    else if (anyA && anyP) cellBg = "bg-orange-900/25 border-orange-800"
                                    else if (anyA) cellBg = "bg-red-900/25 border-red-800"
                                }
                            }

                            return (
                                <div key={day.toISOString()} onClick={() => setSelectedDay(day)}
                                    className={cn(
                                        "cursor-pointer rounded-lg border p-1.5 transition-all min-h-[70px]",
                                        cellBg,
                                        isSel && "ring-2 ring-white/60",
                                        isToday && "ring-1 ring-emerald-400"
                                    )}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className={cn("text-xs font-bold", isToday ? "text-emerald-400" : "text-white/80")}>
                                            {format(day, "d")}
                                        </span>
                                        <span className="text-[8px] text-slate-500">{format(day, "EEE")}</span>
                                    </div>

                                    {cell.type === "holiday" && <div className="text-[8px] text-red-400">Holiday</div>}
                                    {cell.type === "leave" && <div className="text-[8px] text-amber-400">Leave</div>}
                                    {cell.type === "normal" && cell.sessions.length > 0 && (
                                        <div className="space-y-0.5">
                                            {cell.sessions.map((s, i) => (
                                                <div key={i} className="flex items-center gap-1 text-[8px]">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                                        s.status === "Present" ? "bg-emerald-400" :
                                                            s.status === "Absent" ? "bg-red-400" :
                                                                s.status === "Leave" ? "bg-amber-400" : "bg-slate-500"
                                                    )} />
                                                    <span className="text-slate-300 truncate">{s.name.replace("SCHOOL ", "").replace("MADRASA ", "").replace("CLASS ", "C")}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {cell.type === "normal" && cell.sessions.length === 0 && (
                                        <div className="text-[8px] text-slate-600">No class</div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-slate-800 text-[10px] text-slate-400 justify-center">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400" /> Present</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /> Absent</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> Leave</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /> Mixed</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-500" /> Unmarked</span>
                    </div>
                </CardContent>
            </Card>

            {/* Weekly Session Breakdown (table view) */}
            {viewMode === "weekly" && (
                <Card className="border-none shadow-sm bg-slate-900/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                            Weekly Breakdown
                            <span className="text-sm font-normal text-slate-400 ml-2">
                                {format(weekDays[0], "MMM d")} – {format(weekDays[6], "MMM d")}
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-2 px-2 text-xs text-slate-400 font-medium min-w-[160px]">Session</th>
                                    {weekDays.map(d => (
                                        <th key={d.toISOString()} className={cn(
                                            "text-center py-2 px-1 text-xs font-medium min-w-[40px]",
                                            isSameDay(d, new Date()) ? "text-emerald-400" : "text-slate-400"
                                        )}>
                                            <div>{format(d, "EEE")}</div>
                                            <div className="font-bold text-white/80">{format(d, "d")}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(["Hifz", "School", "Madrassa"] as const).map(dept => {
                                    const deptSess = sessionsByDept[dept] || []
                                    if (deptSess.length === 0) return null
                                    const c = deptColors[dept]
                                    return deptSess.map((session, idx) => (
                                        <tr key={session.id} className={cn(
                                            "border-b border-slate-800/50",
                                            idx === 0 && "border-t-2 border-t-slate-600"
                                        )}>
                                            <td className="py-2 px-2">
                                                <div className="flex items-center gap-2">
                                                    {idx === 0 && <Badge variant="outline" className={cn("text-[9px] px-1.5", c.badge)}>{dept}</Badge>}
                                                    <span className="text-xs font-medium text-slate-200">{session.name}</span>
                                                </div>
                                            </td>
                                            {weekDays.map(day => {
                                                const ds = format(day, "yyyy-MM-dd")
                                                const ap = isSessionApplicable(session, studentStd, day, policies[ds])
                                                if (ap !== "active") {
                                                    return <td key={ds} className="text-center py-2"><span className="text-[10px] text-slate-600">—</span></td>
                                                }
                                                const r = getRec(ds, session.id)
                                                return (
                                                    <td key={ds} className="text-center py-2">
                                                        {r ? (r.status === "Present"
                                                            ? <CheckCircle2 size={16} className="mx-auto text-emerald-400" />
                                                            : r.status === "Absent"
                                                                ? <XCircle size={16} className="mx-auto text-red-400" />
                                                                : <Minus size={14} className="mx-auto text-amber-400" />
                                                        ) : <span className="text-[10px] text-slate-600">·</span>}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))
                                })}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}

            {/* Day Detail */}
            {selectedDay && (
                <Card className="border-none shadow-sm bg-slate-900/50 border border-slate-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{format(selectedDay, "EEEE, MMMM d, yyyy")}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {(() => {
                            const cell = getDaySessions(selectedDay)
                            if (cell.type === "holiday") return <div className="text-red-400 text-sm">Holiday — No sessions</div>
                            if (cell.type === "leave") return <div className="text-amber-400 text-sm">On Leave</div>
                            if (cell.sessions.length === 0) return <div className="text-slate-400 text-sm">No active sessions</div>
                            return (
                                <div className="space-y-2">
                                    {cell.sessions.map((s, i) => (
                                        <div key={i} className="flex items-center justify-between border-b border-slate-800 pb-1.5 last:border-0">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className={cn("text-[9px]", deptColors[s.dept as keyof typeof deptColors]?.badge)}>{s.dept}</Badge>
                                                <span className="text-sm">{s.name}</span>
                                            </div>
                                            <span className={cn("text-xs font-bold",
                                                s.status === "Present" ? "text-emerald-400" :
                                                    s.status === "Absent" ? "text-red-400" :
                                                        s.status === "Leave" ? "text-amber-400" : "text-slate-500"
                                            )}>{s.status}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        })()}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
