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
import { ArrowLeft, BookOpen, CalendarCheck, DoorOpen, GraduationCap, UserRound } from "lucide-react"

type TabKey = "overview" | "hifz" | "attendance" | "exams" | "leave"

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: UserRound },
    { key: "hifz", label: "Hifz", icon: BookOpen },
    { key: "attendance", label: "Attendance", icon: CalendarCheck },
    { key: "exams", label: "Exams", icon: GraduationCap },
    { key: "leave", label: "Leave", icon: DoorOpen },
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

    return (
        <PrincipalFrame title={student?.name || "Student Profile"} subtitle="Student-centered reports with tab-based lazy loading." range={range}>
            <div className="space-y-5">
                <Link href="/principal/students" className="inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-indigo-600">
                    <ArrowLeft className="h-4 w-4" />
                    Back to Students
                </Link>

                {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}

                {loading ? (
                    <LoadingBlock label="Loading student profile" />
                ) : !student ? (
                    <EmptyState title="Student not found" subtitle="This student is unavailable or not visible to the principal portal." />
                ) : (
                    <>
                        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="grid h-14 w-14 place-items-center rounded-lg bg-indigo-100 text-lg font-black text-indigo-700">
                                        {student.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black">{student.name}</h2>
                                        <p className="text-sm font-semibold text-slate-500">
                                            {student.adm_no} {student.roll_no ? `- Roll ${student.roll_no}` : ""} - {student.standard || "Class not set"} - Batch {student.batch_year || "-"}
                                        </p>
                                    </div>
                                </div>
                                <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-black capitalize text-emerald-700">{student.status || "active"}</span>
                            </div>
                        </section>

                        <div className="sticky top-[121px] z-20 flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50/90 py-2 backdrop-blur">
                            {TABS.map((tab) => (
                                <button suppressHydrationWarning key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-black ${activeTab === tab.key ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {activeTab === "overview" && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                    <StatCard icon={PrincipalIcons.TrendingUp} label="Attendance" value={`${attendancePercent}%`} sub={`${attendance?.attendedClasses || 0}/${attendance?.effectiveClasses || 0} classes`} tone="emerald" />
                                    <StatCard icon={PrincipalIcons.BookOpen} label="Hifz Progress" value={totals.newPages + totals.recent + totals.juz} sub="Activity records" tone="indigo" />
                                    <StatCard icon={PrincipalIcons.GraduationCap} label="Exam Average" value={examAvg ? `${examAvg}%` : "-"} sub="Open Exams tab to refresh" tone="amber" />
                                    <StatCard icon={PrincipalIcons.DoorOpen} label="Leave Status" value={leaveHistory.length ? "Active" : "Clear"} sub="Open Leave tab for history" tone="sky" />
                                </div>
                                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                                    <SectionHeader icon={UserRound} title="Mentor Mapping" subtitle="Assigned academic and Hifz mentors." />
                                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                                        <Info label="Hifz Mentor" value={mentorName(student.hifz_mentor)} />
                                        <Info label="School Mentor" value={mentorName(student.school_mentor)} />
                                        <Info label="Madrasa Mentor" value={mentorName(student.madrasa_mentor)} />
                                    </div>
                                </section>
                            </div>
                        )}

                        {activeTab === "hifz" && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-3 gap-3">
                                    <Info label="New Pages" value={totals.newPages} />
                                    <Info label="Recent Revision" value={totals.recent} />
                                    <Info label="Juz Revision" value={totals.juz} />
                                </div>
                                <HifzChart data={chartData} />
                                <Records logs={progress?.period_logs || []} />
                            </div>
                        )}

                        {activeTab === "attendance" && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                                    <StatCard icon={PrincipalIcons.TrendingUp} label="Attendance" value={`${attendancePercent}%`} sub="Selected range" tone="emerald" />
                                    <Info label="Present" value={attendance?.presentClasses || attendance?.attendedClasses || 0} />
                                    <Info label="Absent" value={attendance?.absentClasses || attendance?.notAttendedClasses || 0} />
                                    <Info label="Late" value={attendance?.lateClasses || 0} />
                                    <Info label="Leave" value={attendance?.leaveClasses || 0} />
                                </div>
                                <TrendChart data={attendanceTrend} />
                            </div>
                        )}

                        {activeTab === "exams" && (
                            tabLoading ? <LoadingBlock label="Loading exams" /> : <ExamList exams={exams} />
                        )}

                        {activeTab === "leave" && (
                            tabLoading ? <LoadingBlock label="Loading leave history" /> : <LeaveList rows={leaveHistory} />
                        )}
                    </>
                )}
            </div>
        </PrincipalFrame>
    )
}

function Info({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 font-black text-slate-900">{value}</p>
        </div>
    )
}

function Records({ logs }: { logs: StudentProgress["period_logs"] }) {
    if (!logs.length) return <EmptyState title="No recitation records" subtitle="Records will appear here after Hifz entries are submitted." />
    return (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={BookOpen} title="Recent Recitation Records" subtitle="Latest records in the selected range." />
            <div className="mt-4 divide-y divide-slate-100">
                {logs.slice(0, 12).map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 py-3">
                        <div>
                            <p className="font-black">{log.mode}</p>
                            <p className="text-xs font-semibold text-slate-500">{logDetail(log)}</p>
                        </div>
                        <p className="text-xs font-black text-slate-500">{formatDate(log.entry_date)}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}

function ExamList({ exams }: { exams: ExamSummary[] }) {
    if (!exams.length) return <EmptyState title="No exam marks" subtitle="No subject marks were found for this student." />
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {exams.map((exam) => (
                <section key={exam.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="font-black">{exam.title}</h3>
                            <p className="text-xs font-semibold text-slate-500">{exam.department || "Exam"} - {formatDate(exam.start_date)}</p>
                        </div>
                        <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{exam.percentage}%</span>
                    </div>
                    <div className="mt-4 space-y-2">
                        {exam.subjects.map((subject) => (
                            <div key={subject.name} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold">
                                <span>{subject.name}</span>
                                <span>{subject.marks}/{subject.max}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white">
                        Total: {exam.total}/{exam.max}
                    </div>
                </section>
            ))}
        </div>
    )
}

function LeaveList({ rows }: { rows: any[] }) {
    if (!rows.length) return <EmptyState title="No leave history" subtitle="Leave records for this student will appear here." />
    return (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={DoorOpen} title="Leave History" subtitle="Current and previous leave records." />
            <div className="mt-4 divide-y divide-slate-100">
                {rows.map((row) => (
                    <div key={row.id} className="grid gap-1 py-3 md:grid-cols-4 md:items-center">
                        <p className="font-black">{row.leave_type || "Leave"}</p>
                        <p className="text-sm font-semibold text-slate-500">{row.reason_category || row.remarks || "-"}</p>
                        <p className="text-sm font-semibold text-slate-500">{formatDate(row.start_datetime)} - {formatDate(row.end_datetime)}</p>
                        <p className="text-sm font-black capitalize text-slate-700">{row.status || "-"}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}
