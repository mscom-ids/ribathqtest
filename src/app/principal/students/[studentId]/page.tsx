"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import api from "@/lib/api"
import {
    AttendanceTotals,
    EmptyState,
    ExamSummary,
    formatDate,
    hifzChartData,
    hifzTotals,
    HifzChart,
    LoadingBlock,
    logDetail,
    mentorName,
    percent,
    PrincipalFrame,
    PrincipalIcons,
    SectionHeader,
    StatCard,
    StudentProgress,
    TrendChart,
    usePrincipalRange,
} from "../../_components/principal-ui"
import { ArrowLeft, BookOpen, CalendarCheck, DoorOpen, GraduationCap, UserRound, Award, Star, Compass, MapPin } from "lucide-react"
import { toast } from "sonner"

type TabKey = "overview" | "hifz" | "attendance" | "exams" | "leave"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: UserRound },
    { key: "hifz", label: "Quran / Hifz", icon: BookOpen },
    { key: "attendance", label: "Attendance", icon: CalendarCheck },
    { key: "exams", label: "Exams", icon: GraduationCap },
    { key: "leave", label: "Leaves", icon: DoorOpen },
]

export default function PrincipalStudentProfilePage() {
    const params = useParams<{ studentId: string }>()
    const studentId = decodeURIComponent(params.studentId)
    const range = usePrincipalRange()
    const [activeTab, setActiveTab] = useState<TabKey>("overview")
    const [progress, setProgress] = useState<StudentProgress | null>(null)
    const [exams, setExams] = useState<ExamSummary[]>([])
    const [leaveHistory, setLeaveHistory] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [tabLoading, setTabLoading] = useState(false)
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false
        async function loadStudent() {
            setLoading(true)
            setError("")
            try {
                const res = await api.get("/reports/student-progress", {
                    params: { student_id: studentId, type: "Range", start_date: range.startDate, end_date: range.endDate },
                })
                if (!cancelled && res.data?.success) setProgress(res.data.data)
            } catch {
                if (!cancelled) setError("Unable to load student profile")
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        void loadStudent()
        return () => { cancelled = true }
    }, [range.startDate, range.endDate, studentId])

    useEffect(() => {
        if (activeTab !== "exams" || exams.length) return
        let cancelled = false
        async function loadExams() {
            setTabLoading(true)
            try {
                const examsRes = await api.get("/exams")
                const examRows = (examsRes.data?.exams || []).slice(0, 8)
                const summaries = await Promise.all(
                    examRows.map(async (exam: { id: string; title: string; department?: string; start_date?: string }) => {
                        const [details, marks] = await Promise.all([api.get(`/exams/${exam.id}`), api.get(`/exams/${exam.id}/marks`)])
                        const subjectById = new Map<string, { name: string; max_marks: number }>()
                        for (const subject of details.data?.subjects || []) {
                            subjectById.set(subject.id, { name: subject.name, max_marks: Number(subject.max_marks || 0) })
                        }
                        const subjects = (marks.data?.marks || [])
                            .filter((m: { student_id: string }) => m.student_id === studentId)
                            .map((m: { subject_id: string; marks_obtained: number; remarks?: string | null }) => {
                                const subject = subjectById.get(m.subject_id)
                                return { name: subject?.name || "Subject", marks: Number(m.marks_obtained || 0), max: Number(subject?.max_marks || 0), remarks: m.remarks }
                            })
                        const total = subjects.reduce((sum: number, item: { marks: number }) => sum + item.marks, 0)
                        const max = subjects.reduce((sum: number, item: { max: number }) => sum + item.max, 0)
                        return { ...exam, total, max, percentage: max ? Math.round((total / max) * 100) : 0, subjects }
                    })
                )
                if (!cancelled) setExams(summaries.filter((exam) => exam.subjects.length > 0))
            } finally {
                if (!cancelled) setTabLoading(false)
            }
        }
        void loadExams()
        return () => { cancelled = true }
    }, [activeTab, exams.length, studentId])

    useEffect(() => {
        if (activeTab !== "leave" || leaveHistory.length) return
        let cancelled = false
        async function loadLeave() {
            setTabLoading(true)
            try {
                const res = await api.get("/leaves/personal", { params: { student_id: studentId, limit: 100 } })
                if (!cancelled) setLeaveHistory(res.data?.leaves || [])
            } finally {
                if (!cancelled) setTabLoading(false)
            }
        }
        void loadLeave()
        return () => { cancelled = true }
    }, [activeTab, leaveHistory.length, studentId])

    const student = progress?.student
    const attendance = progress?.attendance_totals || null
    const attendancePercent = percent(attendance?.attendedClasses, attendance?.effectiveClasses)
    const totals = hifzTotals(progress)
    const examAvg = exams.length ? Math.round(exams.reduce((sum, exam) => sum + exam.percentage, 0) / exams.length) : 0
    const chartData = useMemo(() => hifzChartData(progress, range.startDate), [progress, range.startDate])
    const attendanceTrend = useMemo(() => chartData.map((item) => ({ label: item.label, value: attendancePercent })), [attendancePercent, chartData])

    const initials = student?.name ? student.name.slice(0, 2).toUpperCase() : "ST"

    return (
        <PrincipalFrame title={student?.name || "Student Profile"} subtitle="Detailed overview, Hifz, exams, and attendance metrics." range={range}>
            <div className="space-y-6">
                <Link href="/principal/students" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-teal-600 uppercase tracking-widest transition">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Registry
                </Link>

                {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-black text-rose-700 uppercase tracking-wider">{error}</div>}

                {loading ? (
                    <LoadingBlock label="Loading student profile" />
                ) : !student ? (
                    <EmptyState title="Student not found" subtitle="This student record is currently unindexed or unavailable to the principal portal." />
                ) : (
                    <>
                        {/* Premium Cover Banner & Profile Header */}
                        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-md">
                            {/* Banner Decorative Grid background */}
                            <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                            <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/20 rounded-full blur-3xl -z-10"></div>
                            
                            <div className="relative z-10 flex flex-col gap-5 p-6 md:flex-row md:items-center">
                                {/* Profile Initial Bubble */}
                                <div className="grid h-16 w-16 flex-none place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 text-xl font-black text-white shadow-xl shadow-teal-500/20 ring-4 ring-slate-800">
                                    {initials}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-xl font-black tracking-tight leading-tight">{student.name}</h2>
                                        <span className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-400">{student.status || "active"}</span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wide">
                                        Admission No: <strong className="text-white">{student.adm_no}</strong> {student.roll_no ? `• Roll No: ${student.roll_no}` : ""} • Class: <strong className="text-white">{student.standard || "Unassigned"}</strong> • Year Batch: <strong className="text-white">{student.batch_year || "-"}</strong>
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Sliding Tab Menu Navigator */}
                        <div className="sticky top-[136px] sm:top-[76px] z-20 flex gap-1.5 overflow-x-auto rounded-2xl bg-slate-100 p-1.5 border border-slate-200/50 backdrop-blur-md">
                            {TABS.map((tab) => (
                                <button 
                                    suppressHydrationWarning 
                                    key={tab.key} 
                                    onClick={() => setActiveTab(tab.key)} 
                                    className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-900"}`}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* TAB CONTENTS */}
                        <div className="space-y-6">
                            
                            {activeTab === "overview" && (
                                <div className="space-y-6">
                                    {/* StatCards grid */}
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                        <StatCard icon={PrincipalIcons.TrendingUp} label="Attendance Average" value={`${attendancePercent}%`} sub={`${attendance?.attendedClasses || 0}/${attendance?.effectiveClasses || 0} classes logged`} tone="emerald" />
                                        <StatCard icon={PrincipalIcons.BookOpen} label="Total Memorizations" value={totals.newPages + totals.recent + totals.juz} sub={`${totals.newPages} new pages memorized`} tone="teal" />
                                        <StatCard icon={PrincipalIcons.GraduationCap} label="Academic Average" value={examAvg ? `${examAvg}%` : "-"} sub="Average across exam papers" tone="amber" />
                                        <StatCard icon={PrincipalIcons.DoorOpen} label="Outside/Leave Status" value={leaveHistory.length ? "Active Leaves" : "Clear"} sub="Leaves logged in ledger" tone="sky" />
                                    </div>

                                    {/* Visual Radial Progress / Metric Meter */}
                                    <div className="grid gap-6 md:grid-cols-2">
                                        {/* Left: Attendance summary card */}
                                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                                            <div>
                                                <SectionHeader icon={CalendarCheck} title="Attendance Metrics" subtitle="Student presence summary analysis for this period." />
                                                <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
                                                    {/* Custom styled dial widget */}
                                                    <div className="relative w-28 h-28 flex-none grid place-items-center">
                                                        <div className="absolute inset-0 rounded-full border-8 border-slate-100"></div>
                                                        <div className="absolute inset-0 rounded-full border-8 border-teal-600 clip-progress" style={{ transform: `rotate(${attendancePercent * 3.6}deg)` }}></div>
                                                        <span className="text-lg font-black text-slate-800">{attendancePercent}%</span>
                                                    </div>
                                                    <div className="space-y-2 text-xs font-semibold text-slate-500">
                                                        <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Present: <strong className="text-slate-800 ml-auto">{attendance?.presentClasses || attendance?.attendedClasses || 0} classes</strong></p>
                                                        <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Absent: <strong className="text-slate-800 ml-auto">{attendance?.absentClasses || attendance?.notAttendedClasses || 0} classes</strong></p>
                                                        <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Late Check-in: <strong className="text-slate-800 ml-auto">{attendance?.lateClasses || 0} classes</strong></p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Quran Hifz Progress summary card */}
                                        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                                            <div>
                                                <SectionHeader icon={BookOpen} title="Memorization Analysis" subtitle="Progress and volumes recited over the current window." />
                                                <div className="mt-5 space-y-3">
                                                    <ProgressBar label="New Pages Recited" value={totals.newPages} max={30} color="bg-teal-600" />
                                                    <ProgressBar label="Revision Cycles (Recent)" value={totals.recent} max={25} color="bg-emerald-500" />
                                                    <ProgressBar label="Juz Revision Count" value={totals.juz} max={10} color="bg-amber-500" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mentor Assignments */}
                                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                                        <SectionHeader icon={UserRound} title="Academic Mentorship Mapping" subtitle="Staff members assigned for academic and Hifz guidance." />
                                        <div className="grid gap-4 sm:grid-cols-3 mt-4">
                                            <MentorCard role="Hifz Mentor" name={mentorName(student.hifz_mentor)} icon={BookOpen} />
                                            <MentorCard role="School Mentor" name={mentorName(student.school_mentor)} icon={Compass} />
                                            <MentorCard role="Madrasa Mentor" name={mentorName(student.madrasa_mentor)} icon={Award} />
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === "hifz" && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">New Pages</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{totals.newPages}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Revision</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{totals.recent}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Juz Revision</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{totals.juz}</p>
                                        </div>
                                    </div>
                                    <HifzChart data={chartData} />
                                    
                                    {/* Timeline-style Recitation Feed */}
                                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                                        <SectionHeader icon={BookOpen} title="Recitation History Feed" subtitle="Timeline of recitation updates submitted by mentors." />
                                        <div className="mt-6 relative pl-4 border-l-2 border-slate-100 space-y-6">
                                            {(progress?.period_logs || []).length === 0 ? (
                                                <EmptyState title="No recitation logs found" subtitle="No recitation records exist for this student in the selected date range." />
                                            ) : (
                                                progress?.period_logs.slice(0, 15).map((log) => {
                                                    const isNew = log.mode === "New Verses"
                                                    const isRecent = log.mode === "Recent Revision"
                                                    return (
                                                        <div key={log.id} className="relative group">
                                                            {/* Custom Timeline dot */}
                                                            <span className={`absolute -left-[22px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ring-4 ring-slate-50 transition-transform duration-300 group-hover:scale-125 ${isNew ? "bg-teal-500" : isRecent ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                                                            
                                                            <div className="flex items-start justify-between gap-4 ml-2">
                                                                <div>
                                                                    <p className="text-xs font-black text-slate-800 tracking-tight leading-none group-hover:text-teal-600 transition-colors">{log.mode}</p>
                                                                    <p className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wide leading-none">{logDetail(log)}</p>
                                                                </div>
                                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{formatDate(log.entry_date)}</span>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </section>
                                </div>
                            )}

                            {activeTab === "attendance" && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Present Ratio</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{attendance?.presentClasses || attendance?.attendedClasses || 0}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Absent Count</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{attendance?.absentClasses || attendance?.notAttendedClasses || 0}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Late Logs</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{attendance?.lateClasses || 0}</p>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-center">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">On Leave</p>
                                            <p className="text-xl font-black text-slate-800 mt-1">{attendance?.leaveClasses || 0}</p>
                                        </div>
                                    </div>
                                    <TrendChart data={attendanceTrend} />
                                </div>
                            )}

                            {activeTab === "exams" && (
                                tabLoading ? (
                                    <LoadingBlock label="Loading exam reports" />
                                ) : exams.length === 0 ? (
                                    <EmptyState title="No exam marks found" subtitle="No marked subject registers exist for this student." />
                                ) : (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {exams.map((exam) => (
                                            <section key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                                                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                                                    <div>
                                                        <h3 className="text-sm font-black text-slate-800 leading-tight">{exam.title}</h3>
                                                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">{exam.department || "Exam Department"} • {formatDate(exam.start_date)}</p>
                                                    </div>
                                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider ${exam.percentage < 40 ? "bg-rose-50 text-rose-600 border border-rose-100" : exam.percentage < 75 ? "bg-amber-50 text-amber-600 border border-amber-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"}`}>{exam.percentage}%</span>
                                                </div>
                                                <div className="space-y-2">
                                                    {exam.subjects.map((subject) => (
                                                        <div key={subject.name} className="flex items-center justify-between rounded-xl bg-slate-50/50 px-3.5 py-2.5 text-xs font-bold text-slate-700">
                                                            <span>{subject.name}</span>
                                                            <span className="font-black text-slate-800">{subject.marks} / {subject.max}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white flex justify-between tracking-wide uppercase">
                                                    <span>Aggregate Score:</span>
                                                    <span>{exam.total} / {exam.max}</span>
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === "leave" && (
                                tabLoading ? (
                                    <LoadingBlock label="Loading leave logs" />
                                ) : leaveHistory.length === 0 ? (
                                    <EmptyState title="No leaves logged" subtitle="No registered checkout or leave ledger entries exist for this profile." />
                                ) : (
                                    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                                        <SectionHeader icon={DoorOpen} title="Personal Leave History" subtitle="Ledger entries tracking checkout exit codes and check-in statuses." />
                                        
                                        <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b border-slate-100 bg-slate-50 font-black text-slate-400 uppercase tracking-widest">
                                                        <th className="px-5 py-4">Leave Type</th>
                                                        <th className="px-5 py-4">Reason Category</th>
                                                        <th className="px-5 py-4">Remarks / Companion</th>
                                                        <th className="px-5 py-4">Interval</th>
                                                        <th className="px-5 py-4 text-right">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                                    {leaveHistory.map((row) => (
                                                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-5 py-4">
                                                                <span className="bg-teal-50 border border-teal-100/50 text-[10px] font-black uppercase text-teal-600 px-2 py-0.5 rounded-lg">{row.leave_type || "Leave"}</span>
                                                            </td>
                                                            <td className="px-5 py-4 text-slate-800 font-black">{row.reason_category || "-"}</td>
                                                            <td className="px-5 py-4 text-slate-500 font-bold max-w-xs truncate">{row.remarks || row.companion_name || "-"}</td>
                                                            <td className="px-5 py-4 text-slate-500 font-bold">{formatDate(row.start_datetime)} to {formatDate(row.end_datetime)}</td>
                                                            <td className="px-5 py-4 text-right">
                                                                <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${row.status === "returned" || row.status === "completed" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"}`}>
                                                                    {row.status || "-"}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>
                                )
                            )}
                        </div>
                    </>
                )}
            </div>
        </PrincipalFrame>
    )
}

function MentorCard({ role, name, icon: Icon }: { role: string; name: string; icon: React.ElementType }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
                <Icon className="h-4.5 w-4.5" />
            </div>
            <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{role}</p>
                <p className="font-black text-slate-800 text-sm tracking-tight mt-1.5 leading-none">{name}</p>
            </div>
        </div>
    )
}

function ProgressBar({ label, value, max, color = "bg-teal-600" }: { label: string; value: number; max: number; color?: string }) {
    const pct = Math.min(100, Math.round((value / max) * 100))
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>{label}</span>
                <span className="font-black text-slate-800">{value} / {max}</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }}></div>
            </div>
        </div>
    )
}
