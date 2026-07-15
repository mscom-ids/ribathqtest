"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ArrowRight, CalendarRange, RefreshCw, UsersRound } from "lucide-react"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { AttendanceGroups } from "@/app/admin/academic/enrollments/attendance-groups"
import { AttendanceTimetable } from "@/app/admin/attendance-setup/attendance-timetable"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ThreeBallLoader } from "@/components/ui/three-ball-loader"

type AcademicYear = { id: string; name: string; is_current?: boolean }
type Placement = { adm_no: string; name: string; standard: string; division?: string | null }

function errorMessage(error: unknown) {
    const candidate = error as { response?: { data?: { error?: string } }; message?: string } | undefined
    return candidate?.response?.data?.error || candidate?.message || "Attendance setup could not be loaded."
}

export default function AttendanceSetupPage() {
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [students, setStudents] = useState<Placement[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [refreshVersion, setRefreshVersion] = useState(0)
    const [timetableVersion, setTimetableVersion] = useState(0)

    const loadPlacements = useCallback(async (targetYearId: string) => {
        if (!targetYearId) {
            setStudents([])
            return
        }
        const response = await cachedGet(
            "/academic-placements",
            { academic_year_id: targetYearId },
            2 * 60_000,
        )
        setStudents(response.data?.data || [])
    }, [])

    const initialise = useCallback(async () => {
        setLoading(true)
        setError("")
        try {
            const response = await cachedGet("/academic-placements/academic-years", undefined, 5 * 60_000)
            const nextYears: AcademicYear[] = response.data?.data || []
            const currentYearId = nextYears.find(year => year.is_current)?.id || nextYears[0]?.id || ""
            setYears(nextYears)
            setYearId(currentYearId)
            await loadPlacements(currentYearId)
        } catch (loadError) {
            setError(errorMessage(loadError))
        } finally {
            setLoading(false)
        }
    }, [loadPlacements])

    useEffect(() => {
        void initialise()
    }, [initialise])

    async function changeYear(nextYearId: string) {
        setYearId(nextYearId)
        setLoading(true)
        setError("")
        try {
            await loadPlacements(nextYearId)
        } catch (loadError) {
            setError(errorMessage(loadError))
        } finally {
            setLoading(false)
        }
    }

    async function refresh() {
        setLoading(true)
        setError("")
        try {
            invalidateCache("/academic-placements")
            invalidateCache("/academic-placements/attendance-groups")
            invalidateCache("/academic-placements/divisions")
            invalidateCache("/attendance/schedules")
            await loadPlacements(yearId)
            setRefreshVersion(value => value + 1)
        } catch (loadError) {
            setError(errorMessage(loadError))
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="mx-auto w-full max-w-[1500px] space-y-5 pb-12">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <CalendarRange className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h1 className="text-2xl font-black text-slate-950">Timetable &amp; Attendance Setup</h1>
                            <p className="mt-1 text-sm font-medium text-slate-500">Schedule weekly classes and connect them to mentor division rosters</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Select value={yearId} onValueChange={value => void changeYear(value)}>
                            <SelectTrigger className="w-full sm:w-[190px]">
                                <SelectValue placeholder="Academic year" />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map(year => <SelectItem key={year.id} value={year.id}>{year.name}{year.is_current ? " (Current)" : ""}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => void refresh()} disabled={loading || !yearId}>
                            <RefreshCw className={"mr-2 h-4 w-4 " + (loading ? "animate-spin" : "")} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <UsersRound className="h-5 w-5 text-slate-400" />
                    <div>
                        <p className="font-bold text-slate-900">{students.length} students available</p>
                        <p className="text-xs text-slate-500">Standards and base divisions come from Student Placement.</p>
                    </div>
                </div>
                <Button asChild variant="outline">
                    <Link href="/admin/academic/enrollments">
                        Student Placement
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </section>

            {error && (
                <section className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                        <div>
                            <p className="font-bold">Attendance setup is unavailable</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => void initialise()}>Retry</Button>
                </section>
            )}

            {loading && students.length === 0 ? (
                <section className="rounded-xl border border-slate-200 bg-white py-24">
                    <ThreeBallLoader label="Loading attendance setup..." />
                </section>
            ) : yearId ? (
                <>
                    <AttendanceTimetable
                        academicYearId={yearId}
                        refreshVersion={refreshVersion + timetableVersion}
                    />
                    <AttendanceGroups
                        key={yearId + ":" + refreshVersion}
                        academicYearId={yearId}
                        students={students}
                        onGroupsChanged={() => setTimetableVersion(value => value + 1)}
                    />
                </>
            ) : !error ? (
                <section className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
                    Create an academic year before configuring attendance.
                </section>
            ) : null}
        </main>
    )
}