"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
    ArrowLeft,
    GraduationCap,
    School,
    BookOpen,
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    TrendingUp,
    UserCheck,
    FileText,
    AlertCircle,
    Loader2,
    History,
    BookMarked,
} from "lucide-react"
import api from "@/lib/api"

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type ReportWindow = {
    requested_start_date: string
    requested_end_date: string
    effective_start_date: string
    effective_end_date: string
    admission_date?: string | null
    exit_date?: string | null
    has_overlap: boolean
}

type AttendanceSummary = {
    total_scheduled: number
    cancelled: number
    effective_classes: number
    present: number
    absent: number
    late: number
    on_leave: number
    unmarked: number
    attendance_pct: number
}

type AttendanceSubject = AttendanceSummary & {
    schedule_id: string
    schedule_name: string
    class_type: string
}

type HifzProgress = {
    enrolled?: boolean
    message?: string
    total_sessions: number
    new_verses_sessions: number
    new_pages_memorized: number
    new_verses_memorized: number
    revision_days: number
    breakdown_by_mode: Array<{ mode: string; sessions: number; pages_covered: number; verses_covered: number; unique_juz: number[] }>
}

type MentorEntry = {
    mentor_name: string
    from_date: string
    until_date: string | null
    notes: string | null
}

type Leave = {
    id: string
    leave_type: string
    reason: string
    status: string
    start_date: string
    end_date: string
    actual_return_date?: string | null
    return_status?: string | null
}

type ExamResult = {
    exam_name: string
    department: string
    exam_date: string
    total_obtained: number
    total_max: number
    subjects: Array<{ subject_name: string; marks_obtained: number; max_marks: number; grade: string; remarks: string }>
}

type Report = {
    student: {
        adm_no: string
        name: string
        photo_url?: string
        status: string
        admission_date?: string
        exit_date?: string
        school_standard?: string
        school_section?: string
        madrasa_standard?: string
        madrasa_section?: string
        is_hifz_student: boolean
        hifz_mentor_name?: string
        school_mentor_name?: string
        madrasa_mentor_name?: string
        batch_year?: string
    }
    report_window: ReportWindow
    academic_year: { id: string; start_date?: string; end_date?: string }
    attendance: {
        overall: AttendanceSummary
        hifz: { summary: AttendanceSummary; sessions: AttendanceSubject[] }
        school: { summary: AttendanceSummary; subjects: AttendanceSubject[] }
        madrasa: { summary: AttendanceSummary; subjects: AttendanceSubject[] }
    }
    hifz_progress: HifzProgress
    hifz_mentor_history: MentorEntry[]
    leaves: Leave[]
    exam_results: ExamResult[]
}

// ──────────────────────────────────────────────────────────────────────────────
// Utility components
// ──────────────────────────────────────────────────────────────────────────────

function PctBar({ pct }: { pct: number }) {
    const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-400" : "bg-rose-500"
    return (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
            <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
    )
}

function AttSummaryCard({ label, summary, icon: Icon, color }: {
    label: string
    summary: AttendanceSummary
    icon: React.ElementType
    color: string
}) {
    const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
        blue:   { bg: "bg-blue-50",   text: "text-blue-700",   icon: "text-blue-600" },
        emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-600" },
        violet:  { bg: "bg-violet-50",  text: "text-violet-700",  icon: "text-violet-600" },
    }
    const c = colorMap[color] || colorMap.blue
    if (summary.effective_classes === 0) return null
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.bg}`}>
                    <Icon className={`h-4 w-4 ${c.icon}`} />
                </div>
                <span className={`text-xs font-black uppercase tracking-wider ${c.text}`}>{label}</span>
            </div>
            <div className="flex items-end gap-1">
                <span className="text-3xl font-black text-slate-950">{summary.attendance_pct}%</span>
                <span className="mb-0.5 text-sm font-bold text-slate-400">attendance</span>
            </div>
            <PctBar pct={summary.attendance_pct} />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Present" value={summary.present} color="text-emerald-600" />
                <Stat label="Absent" value={summary.absent} color="text-rose-600" />
                <Stat label="Classes" value={summary.effective_classes} color="text-slate-700" />
            </div>
        </div>
    )
}

function Stat({ label, value, color = "text-slate-700" }: { label: string; value: number; color?: string }) {
    return (
        <div>
            <p className={`text-base font-black ${color}`}>{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    )
}

function SubjectTable({ subjects, emptyText }: { subjects: AttendanceSubject[]; emptyText: string }) {
    if (subjects.length === 0) return (
        <p className="py-6 text-center text-sm font-bold text-slate-400">{emptyText}</p>
    )
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-100">
                        <th className="py-2 px-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Subject / Session</th>
                        <th className="py-2 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Classes</th>
                        <th className="py-2 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Present</th>
                        <th className="py-2 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Absent</th>
                        <th className="py-2 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Late</th>
                        <th className="py-2 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Att %</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {subjects.map((s) => (
                        <tr key={s.schedule_id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-800">{s.schedule_name}</td>
                            <td className="py-2.5 px-3 text-center font-semibold text-slate-600">{s.effective_classes}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-600">{s.present}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-rose-600">{s.absent}</td>
                            <td className="py-2.5 px-3 text-center font-bold text-amber-600">{s.late}</td>
                            <td className="py-2.5 px-3 text-center">
                                <span className={`font-black text-sm ${s.attendance_pct >= 80 ? "text-emerald-600" : s.attendance_pct >= 60 ? "text-amber-600" : "text-rose-600"}`}>
                                    {s.attendance_pct}%
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────

export default function StudentYearlyReportPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const studentId = params?.studentId as string
    const academicYearId = searchParams?.get("academic_year_id") || ""

    const [report, setReport] = useState<Report | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [activeSection, setActiveSection] = useState<"school" | "madrasa" | "hifz">("school")

    useEffect(() => {
        if (!studentId) return
        setLoading(true)
        setError("")
        api.get(`/yearly-report/student/${studentId}`, {
            params: { academic_year_id: academicYearId || undefined }
        })
            .then((res) => {
                if (res.data?.success) {
                    setReport(res.data)
                } else {
                    setError(res.data?.error || "Failed to load report")
                }
            })
            .catch((err) => {
                setError(err?.response?.data?.error || err?.message || "Failed to load report")
            })
            .finally(() => setLoading(false))
    }, [studentId, academicYearId])

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
            <p className="text-sm font-bold text-slate-400">Generating yearly report...</p>
        </div>
    )

    if (error) return (
        <div className="space-y-4">
            <Link href="/admin/reports/yearly" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800">
                <ArrowLeft className="h-4 w-4" /> Back to Reports
            </Link>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                    <p className="font-black text-rose-800">Could not generate report</p>
                    <p className="text-sm text-rose-700 mt-1">{error}</p>
                </div>
            </div>
        </div>
    )

    if (!report) return null

    const { student, report_window, attendance, hifz_progress, hifz_mentor_history, leaves, exam_results } = report

    const hasMadrasaData = attendance.madrasa.summary.effective_classes > 0
    const hasSchoolData = attendance.school.summary.effective_classes > 0
    const hasHifzData = attendance.hifz.summary.effective_classes > 0 || student.is_hifz_student

    return (
        <main className="space-y-5 max-w-5xl mx-auto">
            {/* Back */}
            <Link
                href={`/admin/reports/yearly${academicYearId ? `?academic_year_id=${academicYearId}` : ""}`}
                className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" /> Back to Yearly Reports
            </Link>

            {/* Student identity card */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        {student.photo_url ? (
                            <img src={student.photo_url} alt={student.name} className="h-14 w-14 rounded-xl object-cover border border-slate-200" />
                        ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-xl font-black">
                                {student.name?.charAt(0)}
                            </div>
                        )}
                        <div>
                            <h1 className="text-xl font-black text-slate-950">{student.name}</h1>
                            <p className="text-sm font-semibold text-slate-500">{student.adm_no}</p>
                            <div className="mt-1 flex flex-wrap gap-2">
                                {student.school_standard && (
                                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-black text-blue-700">
                                        School: {student.school_standard}{student.school_section ? ` - ${student.school_section}` : ""}
                                    </span>
                                )}
                                {student.madrasa_standard && (
                                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black text-emerald-700">
                                        Madrasa: {student.madrasa_standard}{student.madrasa_section ? ` - ${student.madrasa_section}` : ""}
                                    </span>
                                )}
                                {student.is_hifz_student && (
                                    <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-black text-violet-700">
                                        Hifz{student.hifz_mentor_name ? `: ${student.hifz_mentor_name}` : ""}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Report window */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">Report Period</p>
                        <p className="font-black text-slate-950">{report_window.effective_start_date} → {report_window.effective_end_date}</p>
                        {report_window.admission_date && (
                            <p className="text-xs font-semibold text-slate-400 mt-0.5">Admitted: {report_window.admission_date}</p>
                        )}
                        {report_window.exit_date && (
                            <p className="text-xs font-semibold text-slate-400">Exit: {report_window.exit_date}</p>
                        )}
                    </div>
                </div>
            </section>

            {/* Overall attendance summary */}
            <section>
                <h2 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Attendance Summary</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                    <AttSummaryCard label="School" summary={attendance.school.summary} icon={School} color="blue" />
                    <AttSummaryCard label="Madrasa" summary={attendance.madrasa.summary} icon={BookOpen} color="emerald" />
                    <AttSummaryCard label="Hifz" summary={attendance.hifz.summary} icon={GraduationCap} color="violet" />
                </div>
                {!hasSchoolData && !hasMadrasaData && !hasHifzData && (
                    <p className="mt-4 text-center text-sm font-bold text-slate-400">No attendance data recorded for this period.</p>
                )}
            </section>

            {/* Subject breakdown tabs */}
            {(hasSchoolData || hasMadrasaData || hasHifzData) && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex border-b border-slate-100">
                        {hasSchoolData && (
                            <button onClick={() => setActiveSection("school")} className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 -mb-px transition-all ${activeSection === "school" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                                <School className="h-4 w-4" /> School
                            </button>
                        )}
                        {hasMadrasaData && (
                            <button onClick={() => setActiveSection("madrasa")} className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 -mb-px transition-all ${activeSection === "madrasa" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                                <BookOpen className="h-4 w-4" /> Madrasa
                            </button>
                        )}
                        {hasHifzData && (
                            <button onClick={() => setActiveSection("hifz")} className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 -mb-px transition-all ${activeSection === "hifz" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                                <GraduationCap className="h-4 w-4" /> Hifz
                            </button>
                        )}
                    </div>
                    <div className="p-4">
                        {activeSection === "school" && (
                            <SubjectTable
                                subjects={attendance.school.subjects}
                                emptyText="No school subject data for this period."
                            />
                        )}
                        {activeSection === "madrasa" && (
                            <SubjectTable
                                subjects={attendance.madrasa.subjects}
                                emptyText="No Madrasa subject data for this period."
                            />
                        )}
                        {activeSection === "hifz" && (
                            <SubjectTable
                                subjects={attendance.hifz.sessions}
                                emptyText="No Hifz session data for this period."
                            />
                        )}
                    </div>
                </section>
            )}

            {/* Hifz Progress */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                    <BookMarked className="h-4 w-4 text-violet-600" />
                    <h2 className="text-sm font-black text-slate-950">Hifz Progress</h2>
                </div>
                <div className="p-5">
                    {!student.is_hifz_student || (hifz_progress as any)?.enrolled === false ? (
                        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3">
                            <AlertCircle className="h-4 w-4 text-slate-400" />
                            <p className="text-sm font-bold text-slate-500">Not enrolled in Hifz classes</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg bg-violet-50 p-4 text-center">
                                <p className="text-2xl font-black text-violet-700">{hifz_progress.total_sessions}</p>
                                <p className="text-xs font-bold text-violet-500 uppercase tracking-wide mt-1">Total Sessions</p>
                            </div>
                            <div className="rounded-lg bg-blue-50 p-4 text-center">
                                <p className="text-2xl font-black text-blue-700">{hifz_progress.new_pages_memorized}</p>
                                <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mt-1">New Pages</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-4 text-center">
                                <p className="text-2xl font-black text-emerald-700">{hifz_progress.new_verses_memorized}</p>
                                <p className="text-xs font-bold text-emerald-500 uppercase tracking-wide mt-1">New Verses</p>
                            </div>
                            <div className="rounded-lg bg-amber-50 p-4 text-center">
                                <p className="text-2xl font-black text-amber-700">{hifz_progress.revision_days}</p>
                                <p className="text-xs font-bold text-amber-500 uppercase tracking-wide mt-1">Revision Days</p>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Hifz Mentor History */}
            {student.is_hifz_student && hifz_mentor_history.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                        <History className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-black text-slate-950">Hifz Mentor History</h2>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {hifz_mentor_history.map((entry, i) => (
                            <div key={i} className="flex items-center justify-between px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-black">
                                        {entry.mentor_name.charAt(0)}
                                    </div>
                                    <span className="text-sm font-bold text-slate-800">{entry.mentor_name}</span>
                                    {entry.notes && <span className="text-xs text-slate-400 italic">{entry.notes}</span>}
                                </div>
                                <span className="text-xs font-semibold text-slate-400">
                                    {entry.from_date} → {entry.until_date || "Present"}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Leaves */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-amber-500" />
                        <h2 className="text-sm font-black text-slate-950">Leave Records</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{leaves.length}</span>
                </div>
                {leaves.length === 0 ? (
                    <p className="py-8 text-center text-sm font-bold text-slate-400">No leaves taken in this period.</p>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {leaves.map((leave) => (
                            <div key={leave.id} className="flex items-center justify-between px-5 py-3">
                                <div>
                                    <p className="text-sm font-bold text-slate-800">{leave.leave_type}</p>
                                    {leave.reason && <p className="text-xs text-slate-400 mt-0.5">{leave.reason}</p>}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-bold text-slate-600">{leave.start_date} → {leave.end_date}</p>
                                    <span className={`text-[11px] font-black ${leave.status === "approved" ? "text-emerald-600" : leave.status === "pending" ? "text-amber-600" : "text-slate-400"}`}>
                                        {leave.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Exam Results */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-500" />
                        <h2 className="text-sm font-black text-slate-950">Exam Results</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{exam_results.length} exams</span>
                </div>
                {exam_results.length === 0 ? (
                    <p className="py-8 text-center text-sm font-bold text-slate-400">No exam results recorded for this period.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {exam_results.map((exam, i) => (
                            <div key={i} className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="font-black text-slate-950">{exam.exam_name}</p>
                                        <p className="text-xs font-semibold text-slate-400">{exam.department} · {exam.exam_date?.slice(0, 10)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xl font-black text-blue-700">{exam.total_obtained} / {exam.total_max}</p>
                                        <p className="text-xs font-bold text-slate-400">
                                            {exam.total_max > 0 ? `${Math.round((exam.total_obtained / exam.total_max) * 100)}%` : "—"}
                                        </p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-100">
                                                <th className="py-1.5 pr-4 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Subject</th>
                                                <th className="py-1.5 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Marks</th>
                                                <th className="py-1.5 px-3 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Grade</th>
                                                <th className="py-1.5 px-3 text-left text-[11px] font-black uppercase tracking-wide text-slate-400">Remarks</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {exam.subjects.map((sub, j) => (
                                                <tr key={j}>
                                                    <td className="py-2 pr-4 font-semibold text-slate-700">{sub.subject_name}</td>
                                                    <td className="py-2 px-3 text-center font-bold text-slate-900">{sub.marks_obtained} / {sub.max_marks}</td>
                                                    <td className="py-2 px-3 text-center font-black text-blue-600">{sub.grade || "—"}</td>
                                                    <td className="py-2 px-3 text-slate-500 text-xs">{sub.remarks || "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    )
}
