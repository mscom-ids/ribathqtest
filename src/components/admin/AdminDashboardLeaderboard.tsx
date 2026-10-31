"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Trophy } from "lucide-react"
import { LeadershipLeaderboard } from "@/components/leadership/LeadershipLeaderboard"
import { LeadershipPointsTable } from "@/components/leadership/LeadershipPointsTable"
import { HifzMonthlyRegister } from "@/components/staff/HifzMonthlyRegister"
import { cachedGet } from "@/lib/api-cache"
import { getHifzPerformancePoints, type HifzPerformanceScoreSource } from "@/lib/hifz-performance"

type Student = { adm_no: string; name: string; standard: string | null; photo_url?: string | null }
type Mentor = { id: string; name: string; role?: string; is_active?: boolean }
type Report = HifzPerformanceScoreSource & {
    adm_no: string; name?: string; standard?: string; grade?: string | null
    bonusPoints?: number; hifz_stage?: string
}
type Performer = Student & { standard: string; totalPoints: number; bonusPoints: number; grade: string; isHafiz: boolean }

export function AdminDashboardLeaderboard() {
    const [open, setOpen] = useState(false)
    const [month, setMonth] = useState("")
    const [months, setMonths] = useState<{ value: string; label: string }[]>([])
    const [mentor, setMentor] = useState("all")
    const [mentors, setMentors] = useState<Mentor[]>([])
    const [performers, setPerformers] = useState<Performer[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [chartStudent, setChartStudent] = useState<Student | null>(null)

    useEffect(() => {
        const now = new Date()
        const options = []
        for (const date = new Date(now.getFullYear(), now.getMonth(), 1); date >= new Date(2026, 5, 1); date.setMonth(date.getMonth() - 1)) {
            options.push({ value: format(date, "yyyy-MM"), label: format(date, "MMM yyyy") })
        }
        setMonths(options)
        setMonth(format(now, "yyyy-MM"))
    }, [])

    useEffect(() => {
        if (!open || !month) return
        let cancelled = false
        setLoading(true)
        setError(null)
        Promise.all([
            cachedGet<{ reports: Report[] }>("/hifz/monthly-reports/calculate", { month, ...(mentor !== "all" ? { mentor_id: mentor } : {}) }, 120_000),
            cachedGet<{ staff: Mentor[] }>("/staff", undefined, 60_000),
            cachedGet<{ students: Student[] }>("/students", { scope: "all", light: "true", status: "active", limit: 500, count: "false", sort: "name" }, 60_000),
        ]).then(([reportResponse, mentorResponse, studentResponse]) => {
            if (cancelled) return
            const photos = new Map((studentResponse.data.students || []).map(student => [student.adm_no, student.photo_url]))
            setMentors((mentorResponse.data.staff || []).filter(item => item.is_active !== false && ["staff", "usthad", "mentor", "teacher"].includes(item.role || "")))
            const students = (reportResponse.data.reports || []).flatMap(report => {
                const totalPoints = getHifzPerformancePoints(report)
                if (totalPoints === null || totalPoints < 0) return []
                return [{
                    adm_no: report.adm_no, name: report.name || report.adm_no, standard: report.standard || "",
                    photo_url: photos.get(report.adm_no) || null,
                    totalPoints, bonusPoints: Number(report.bonusPoints || 0), grade: report.grade || "NO GRADE",
                    isHafiz: report.hifz_stage === "HAFIZ_REVISION",
                }]
            })
            setPerformers(students)
        }).catch(() => {
            if (cancelled) return
            setPerformers([])
            setError("Could not load the leaderboard. Close and reopen to try again.")
        }).finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [open, month, mentor])

    return <>
        <LeadershipLeaderboard open={open} onOpenChange={setOpen} slide trigger={
            <button type="button" disabled={!month} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-70">
                <Trophy className="h-4 w-4" aria-hidden="true" /> Top Performers
            </button>
        }>
            <LeadershipPointsTable performers={performers} loading={loading} error={error}
                month={month} months={months} onMonthChange={value => { if (value !== month) setLoading(true); setMonth(value) }}
                mentors={mentors} mentor={mentor} onMentorChange={value => { if (value !== mentor) setLoading(true); setMentor(value) }}
                onStudentClick={student => { setChartStudent(student); setOpen(false) }} />
        </LeadershipLeaderboard>
        <HifzMonthlyRegister open={!!chartStudent} onClose={() => setChartStudent(null)} student={chartStudent} onChange={() => {}} />
    </>
}
