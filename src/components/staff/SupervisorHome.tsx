"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
    Users, DoorOpen, CheckCircle2, GraduationCap, BookOpen, Search, Loader2,
    Target, ChevronRight, type LucideIcon,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import api from "@/lib/api"
import { cachedGet } from "@/lib/api-cache"
import { MentorFocus } from "@/components/staff/MentorFocus"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import { resolveBackendUrl as getPhotoUrl } from "@/lib/utils"

type AllStudent = { adm_no: string; name: string; standard: string | null; status?: string }
type Mentor = { id: string; name: string; photo_url: string | null; place: string | null; student_count: number }

const STAT_COLORS = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    indigo: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-600 dark:text-indigo-400", bar: "bg-indigo-500" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
} as const

function StatTile({ icon: Icon, color, label, value, sub, pct }: {
    icon: LucideIcon; color: keyof typeof STAT_COLORS; label: string; value: string; sub: string; pct: number
}) {
    const c = STAT_COLORS[color]
    return (
        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
                <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${c.bg}`}>
                    <Icon className={`h-3.5 w-3.5 ${c.text}`} />
                </div>
                <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">{label}</span>
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white leading-none">{value}</p>
            <p className="text-[11px] text-slate-400 dark:text-gray-500 mt-1.5 truncate">{sub}</p>
            <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 mt-2.5 overflow-hidden">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
        </div>
    )
}

function getGreeting(h: number) {
    if (h < 12) return "Good Morning"
    if (h < 17) return "Good Afternoon"
    return "Good Evening"
}

/**
 * Leadership home for Principal / Vice Principal when NO Mentor Focus is set.
 * Shows a school-wide overview of every student (not a single mentor's class),
 * in the same visual language as the mentor portal. Choosing a mentor via
 * Mentor Focus (or the Mentors panel) switches the whole portal into that
 * mentor's class — handled by the parent page once the focus token is set.
 */
export function SupervisorHome({ role }: { role: string }) {
    const [name, setName] = useState("")
    const [photo, setPhoto] = useState("")
    const [counts, setCounts] = useState<{ active: number; on_campus: number; out_campus: number; mentors: number } | null>(null)
    const [attendance, setAttendance] = useState<{ present: number; total: number } | null>(null)
    const [students, setStudents] = useState<AllStudent[]>([])
    const [mentors, setMentors] = useState<Mentor[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [focusingId, setFocusingId] = useState<string | null>(null)

    type ChartStudent = { adm_no: string; name: string; standard: string | null }
    const [chartStudent, setChartStudent] = useState<ChartStudent | null>(null)

    const [now, setNow] = useState<Date | null>(null)
    useEffect(() => { setNow(new Date()) }, [])

    useEffect(() => {
        let cancelled = false
        async function load() {
            setLoading(true)
            const today = format(new Date(), "yyyy-MM-dd")
            const [me, admin, daily, mentorList, studentList] = await Promise.allSettled([
                cachedGet("/staff/me", undefined, 60_000),
                cachedGet("/dashboard/admin", undefined, 60_000),
                cachedGet("/attendance/daily-stats", { start_date: today, end_date: today }, 60_000),
                cachedGet("/delegations/focusable-mentors", undefined, 60_000),
                cachedGet("/students", { scope: "all", light: "true", status: "active", limit: 500, count: "false", sort: "name" }, 60_000),
            ])
            if (cancelled) return

            if (me.status === "fulfilled" && me.value.data?.staff) {
                setName(me.value.data.staff.name || "")
                setPhoto(me.value.data.staff.photo_url || "")
            }
            if (admin.status === "fulfilled" && admin.value.data?.summary) {
                const s = admin.value.data.summary
                setCounts({
                    active: s.students?.active ?? 0,
                    on_campus: s.students?.on_campus ?? 0,
                    out_campus: s.students?.out_campus ?? 0,
                    mentors: s.staff?.active ?? 0,
                })
            }
            if (daily.status === "fulfilled" && daily.value.data?.students) {
                setAttendance({ present: daily.value.data.students.present ?? 0, total: daily.value.data.students.total ?? 0 })
            }
            if (mentorList.status === "fulfilled" && mentorList.value.data?.mentors) {
                setMentors(mentorList.value.data.mentors)
            }
            if (studentList.status === "fulfilled" && studentList.value.data?.students) {
                setStudents(studentList.value.data.students)
            }
            setLoading(false)
        }
        load()
        return () => { cancelled = true }
    }, [])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return students
        return students.filter(s => s.name.toLowerCase().includes(q) || s.adm_no.toLowerCase().includes(q))
    }, [students, search])

    const attendancePct = attendance && attendance.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0
    const roleLabel = role === "principal" ? "Principal" : "Vice Principal"

    async function focusMentor(m: Mentor) {
        setFocusingId(m.id)
        try {
            const res = await api.post("/delegations/supervisor-focus", { mentorId: m.id })
            if (res.data?.success) {
                sessionStorage.setItem("delegationToken", res.data.delegationToken)
                sessionStorage.setItem("delegationMentorName", res.data.mentor.name)
                sessionStorage.setItem("mentorFocus", "1")
                sessionStorage.removeItem("delegationStudentName")
                window.location.href = "/staff"
            } else {
                setFocusingId(null)
            }
        } catch {
            setFocusingId(null)
        }
    }

    if (loading && !counts) {
        return (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                    <p className="text-sm">Loading overview…</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full overflow-y-auto bg-slate-50 dark:bg-[#020617]" suppressHydrationWarning>

            {/* ── Welcome banner ── */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white shadow-2xl ring-1 ring-white/10 rounded-2xl mx-3 mt-3 lg:mx-6 lg:mt-6">
                <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/5" />
                <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/5" />
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 md:p-7">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 md:h-14 md:w-14 rounded-xl ring-2 ring-white/20 shrink-0">
                            <AvatarImage src={getPhotoUrl(photo)} className="object-cover" />
                            <AvatarFallback className="bg-white/15 rounded-xl text-base font-bold text-white">
                                {name ? name.substring(0, 2).toUpperCase() : "VP"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1.5">
                            <p className="text-blue-200 text-[11px] font-medium tracking-wide uppercase">Leadership Portal · {roleLabel}</p>
                            <h1 className="text-xl md:text-2xl font-bold leading-tight">
                                {getGreeting(now ? now.getHours() : 12)}, {name || roleLabel} 👋
                            </h1>
                            <p className="text-blue-100 text-xs">{now ? format(now, "EEEE, MMMM d, yyyy") : ""}</p>
                            <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 w-fit text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                                Full access to every student and mentor
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.active ?? "—"}</div>
                            <div className="text-blue-200 text-[11px]">Students</div>
                        </div>
                        <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.on_campus ?? "—"}</div>
                            <div className="text-blue-200 text-[11px]">On Campus</div>
                        </div>
                        <div className="bg-amber-500/30 backdrop-blur-sm rounded-xl px-4 py-2.5 text-center min-w-[76px]">
                            <div className="text-xl font-bold">{counts?.out_campus ?? "—"}</div>
                            <div className="text-amber-100 text-[11px]">Outside</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Mentor Focus (optional) ── */}
            <MentorFocus role={role} />

            <div className="w-full px-4 lg:px-6 py-4 lg:py-6 space-y-4">

                {/* ── School-wide stat strip ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <StatTile icon={Users} color="blue" label="Total Students" value={String(counts?.active ?? 0)} sub={`${counts?.on_campus ?? 0} on campus`} pct={100} />
                    <StatTile icon={CheckCircle2} color="emerald" label="Attendance Today" value={`${attendancePct}%`} sub={attendance ? `${attendance.present} of ${attendance.total} marks` : "No marks yet"} pct={attendancePct} />
                    <StatTile icon={DoorOpen} color="amber" label="Currently Outside" value={String(counts?.out_campus ?? 0)} sub={`of ${counts?.active ?? 0} students`} pct={counts && counts.active ? (counts.out_campus / counts.active) * 100 : 0} />
                    <StatTile icon={GraduationCap} color="indigo" label="Active Mentors" value={String(counts?.mentors ?? 0)} sub="teaching & leadership" pct={100} />
                </div>

                {/* ── Main: all students | mentors panel ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* Left: All students */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex flex-wrap items-center gap-3 p-5 border-b border-slate-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">All Students</span>
                                </div>
                                <div className="relative flex-1 min-w-[160px]">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                    <Input placeholder="Search name or admission no…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                                </div>
                            </div>

                            {loading && students.length === 0 ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-10 text-sm text-slate-400">{search ? "No students match your search." : "No students found."}</div>
                            ) : (
                                <>
                                    <div className="px-5 py-2 text-[11px] text-slate-400 border-b border-slate-50 dark:border-slate-800">
                                        Showing {filtered.length} student{filtered.length !== 1 ? "s" : ""}
                                    </div>
                                    <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50" style={{ maxHeight: 560 }}>
                                        {filtered.map(student => (
                                            <div key={student.adm_no} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <div className="h-10 w-10 rounded-full bg-[#e8ebfd] text-[#3d5ee1] flex items-center justify-center font-bold text-sm shrink-0">
                                                    {student.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{student.name}</p>
                                                    <p className="text-[11px] text-slate-400 dark:text-gray-400">{student.adm_no}{student.standard ? ` · ${student.standard}` : ""}</p>
                                                </div>
                                                <Button onClick={() => setChartStudent({ adm_no: student.adm_no, name: student.name, standard: student.standard })} size="sm" className="h-7 text-[11px] bg-green-600 hover:bg-green-700 text-white shrink-0">
                                                    <BookOpen className="h-3 w-3" /> Open progress
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right: Mentors panel */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 p-5 border-b border-slate-100 dark:border-gray-700">
                                <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                                    <Target className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">Mentors</p>
                                    <p className="text-[11px] text-slate-400">Open a mentor&apos;s class</p>
                                </div>
                            </div>
                            {mentors.length === 0 ? (
                                <div className="text-center py-8 text-xs text-slate-400">No mentors found.</div>
                            ) : (
                                <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-100 dark:divide-gray-800/50">
                                    {mentors.map(m => (
                                        <button
                                            key={m.id}
                                            type="button"
                                            disabled={focusingId !== null}
                                            onClick={() => focusMentor(m)}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-60"
                                        >
                                            <Avatar className="h-9 w-9 shrink-0">
                                                <AvatarImage src={getPhotoUrl(m.photo_url)} className="object-cover" />
                                                <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
                                                    {m.name.substring(0, 2).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
                                                <p className="truncate text-[11px] text-slate-400">
                                                    {m.place ? `${m.place} · ` : ""}{m.student_count} student{m.student_count !== 1 ? "s" : ""}
                                                </p>
                                            </div>
                                            {focusingId === m.id
                                                ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />
                                                : <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hifz register modal — opens any student's monthly progress */}
            <HifzMonthlyRegister
                open={!!chartStudent}
                onClose={() => setChartStudent(null)}
                student={chartStudent}
                onChange={() => { /* read-oriented supervisor view; no dashboard refresh needed */ }}
            />
        </div>
    )
}
