"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
    AlertTriangle,
    CalendarDays,
    CheckSquare2,
    Clock3,
    Copy,
    ExternalLink,
    Loader2,
    Plus,
    Square,
    Trash2,
    UserRound,
    UsersRound,
} from "lucide-react"
import api from "@/lib/api"
import { cachedGet, invalidateCache } from "@/lib/api-cache"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const DEPARTMENTS = ["hifz", "school", "madrasa"] as const
const DAYS = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
] as const

type Department = typeof DEPARTMENTS[number]
type Mentor = { id: string; name: string }
type AttendanceGroup = {
    id: string
    department: Department
    standard: string
    division: string
    mentor_id?: string | null
    mentor_name?: string | null
    student_count: number
}
type Schedule = {
    id: string
    class_type: string
    name?: string | null
    standards: string[] | string
    day_of_week: number
    start_time: string
    end_time: string
    effective_from?: string | null
    mentor_id?: string | null
    mentor_name?: string | null
    attendance_groups?: AttendanceGroup[] | string
}

type Props = {
    academicYearId: string
    refreshVersion?: number
}

function departmentLabel(department: Department) {
    return department === "hifz" ? "Hifz" : department === "school" ? "School" : "Madrasa"
}

function errorMessage(error: unknown) {
    const candidate = error as { response?: { data?: { error?: string } }; message?: string } | undefined
    return candidate?.response?.data?.error || candidate?.message || "Timetable setup could not be loaded."
}

function localDateKey() {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 10)
}

function divisionLabel(division: string) {
    return division === "__none" ? "No division" : division
}

function parseGroups(value: Schedule["attendance_groups"]): AttendanceGroup[] {
    if (Array.isArray(value)) return value
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value)
            return Array.isArray(parsed) ? parsed : []
        } catch {
            return []
        }
    }
    return []
}

function parseStandards(value: Schedule["standards"]): string[] {
    if (Array.isArray(value)) return value
    try {
        const parsed = JSON.parse(value || "[]")
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function formatTime(value: string) {
    const [hourValue, minute = "00"] = String(value || "").split(":")
    const hour = Number(hourValue)
    if (!Number.isFinite(hour)) return value
    const suffix = hour >= 12 ? "PM" : "AM"
    return String(hour % 12 || 12).padStart(2, "0") + ":" + minute + " " + suffix
}

function formatDate(value?: string | null) {
    if (!value) return "Not set"
    const dateKey = value.slice(0, 10)
    const date = new Date(dateKey + "T00:00:00")
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function standardOrder(value: string) {
    const numeric = Number.parseInt(value, 10)
    return Number.isFinite(numeric) ? numeric : 999
}

export function AttendanceTimetable({ academicYearId, refreshVersion = 0 }: Props) {
    const { toast } = useToast()
    const [department, setDepartment] = useState<Department>("hifz")
    const [groups, setGroups] = useState<AttendanceGroup[]>([])
    const [mentors, setMentors] = useState<Mentor[]>([])
    const [schedules, setSchedules] = useState<Schedule[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState("")
    const [selectedMentorId, setSelectedMentorId] = useState("")
    const [createOpen, setCreateOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [groupIds, setGroupIds] = useState<string[]>([])
    const [className, setClassName] = useState("")
    const [weekday, setWeekday] = useState("0")
    const [startTime, setStartTime] = useState("06:30")
    const [endTime, setEndTime] = useState("08:00")
    const [effectiveFrom, setEffectiveFrom] = useState(localDateKey())
    const [copyOpen, setCopyOpen] = useState(false)
    const [copying, setCopying] = useState(false)
    const [copyTargetDay, setCopyTargetDay] = useState("1")
    const [copySourceDay, setCopySourceDay] = useState("")
    const [copyEffectiveFrom, setCopyEffectiveFrom] = useState(localDateKey())

    const loadData = useCallback(async () => {
        if (!academicYearId) return
        setLoading(true)
        setLoadError("")
        try {
            const [groupResponse, scheduleResponse] = await Promise.all([
                cachedGet(
                    "/academic-placements/attendance-groups",
                    { academic_year_id: academicYearId },
                    2 * 60_000,
                ),
                cachedGet(
                    "/attendance/schedules",
                    { academic_year_id: academicYearId },
                    60_000,
                ),
            ])
            setGroups(groupResponse.data?.data || [])
            setMentors(groupResponse.data?.mentors || [])
            setSchedules(scheduleResponse.data?.data || [])
        } catch (error) {
            setLoadError(errorMessage(error))
        } finally {
            setLoading(false)
        }
    }, [academicYearId])

    useEffect(() => {
        void loadData()
    }, [loadData, refreshVersion])

    const departmentMentors = useMemo(() => {
        const mentorIds = new Set(
            groups
                .filter(group => group.department === department && group.mentor_id)
                .map(group => group.mentor_id as string),
        )
        return mentors
            .filter(mentor => mentorIds.has(mentor.id))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [department, groups, mentors])

    useEffect(() => {
        setSelectedMentorId(current =>
            departmentMentors.some(mentor => mentor.id === current)
                ? current
                : (departmentMentors[0]?.id || ""),
        )
    }, [departmentMentors])

    const departmentSchedules = useMemo(
        () => schedules.filter(schedule => {
            const type = schedule.class_type === "madrassa" ? "madrasa" : schedule.class_type
            return type === department
        }),
        [department, schedules],
    )

    const mentorSchedules = useMemo(
        () => departmentSchedules.filter(schedule => schedule.mentor_id === selectedMentorId),
        [departmentSchedules, selectedMentorId],
    )

    const rosterOptions = useMemo(
        () => groups
            .filter(group => group.department === department && group.mentor_id === selectedMentorId)
            .sort((a, b) => standardOrder(a.standard) - standardOrder(b.standard) || a.division.localeCompare(b.division)),
        [department, groups, selectedMentorId],
    )

    const rostersByStandard = useMemo(
        () => Array.from(new Set(rosterOptions.map(group => group.standard)))
            .sort((a, b) => standardOrder(a) - standardOrder(b) || a.localeCompare(b))
            .map(standard => ({
                standard,
                rosters: rosterOptions.filter(group => group.standard === standard),
            })),
        [rosterOptions],
    )

    const selectedMentor = departmentMentors.find(mentor => mentor.id === selectedMentorId) || null
    const scheduledRosterCount = new Set(
        mentorSchedules.flatMap(schedule => parseGroups(schedule.attendance_groups).map(group => group.id)),
    ).size
    const copyTarget = DAYS.find(day => day.value === copyTargetDay)
    const copySourceOptions = DAYS
        .filter(day => day.value !== copyTargetDay)
        .map(day => ({
            ...day,
            classCount: mentorSchedules.filter(schedule => schedule.day_of_week === Number(day.value)).length,
        }))
        .filter(day => day.classCount > 0)
    function changeDepartment(nextDepartment: Department) {
        setDepartment(nextDepartment)
        setSelectedMentorId("")
        setGroupIds([])
    }

    function openCreate(dayValue = "0") {
        if (!selectedMentorId) {
            toast({
                title: "Select a mentor",
                description: "Choose a teaching mentor before adding a weekly class.",
                variant: "destructive",
            })
            return
        }
        setGroupIds([])
        setClassName(departmentLabel(department) + " Class")
        setWeekday(dayValue)
        setStartTime("06:30")
        setEndTime("08:00")
        setEffectiveFrom(localDateKey())
        setCreateOpen(true)
    }

    function openCopy(dayValue: string) {
        if (!selectedMentorId) return
        const source = DAYS.find(day => (
            day.value !== dayValue
            && mentorSchedules.some(schedule => schedule.day_of_week === Number(day.value))
        ))
        if (!source) {
            toast({
                title: "No timetable day to copy",
                description: "Add at least one class to another weekday first.",
                variant: "destructive",
            })
            return
        }
        setCopyTargetDay(dayValue)
        setCopySourceDay(source.value)
        setCopyEffectiveFrom(localDateKey())
        setCopyOpen(true)
    }
    function toggleGroup(groupId: string) {
        setGroupIds(current => current.includes(groupId)
            ? current.filter(id => id !== groupId)
            : [...current, groupId])
    }

    function toggleStandard(standard: string) {
        const standardGroupIds = rosterOptions
            .filter(group => group.standard === standard)
            .map(group => group.id)
        const allSelected = standardGroupIds.every(id => groupIds.includes(id))
        setGroupIds(current => allSelected
            ? current.filter(id => !standardGroupIds.includes(id))
            : Array.from(new Set([...current, ...standardGroupIds])),
        )
    }

    async function createSchedule() {
        if (!selectedMentorId || groupIds.length === 0 || !className.trim() || !startTime || !endTime) return
        if (startTime >= endTime) {
            toast({ title: "Invalid time", description: "End time must be after start time.", variant: "destructive" })
            return
        }
        setSaving(true)
        try {
            await api.post("/attendance/schedules", {
                academic_year_id: academicYearId,
                class_type: department,
                name: className.trim(),
                day_of_week: Number(weekday),
                start_time: startTime,
                end_time: endTime,
                effective_from: effectiveFrom,
                mentor_id: selectedMentorId,
                group_ids: groupIds,
            })
            invalidateCache("/attendance/schedules")
            setCreateOpen(false)
            await loadData()
            toast({
                title: "Weekly class created",
                description: "Attendance will open only for this class and its selected divisions.",
            })
        } catch (error) {
            toast({ title: "Could not create timetable class", description: errorMessage(error), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    async function removeSchedule(schedule: Schedule) {
        if (!window.confirm("Deactivate " + (schedule.name || "this class") + "? Past attendance will be preserved.")) return
        try {
            await api.delete("/attendance/schedules/" + schedule.id)
            invalidateCache("/attendance/schedules")
            await loadData()
            toast({ title: "Timetable class deactivated" })
        } catch (error) {
            toast({ title: "Could not deactivate class", description: errorMessage(error), variant: "destructive" })
        }
    }

    async function copyScheduleDay() {
        if (!selectedMentorId || !copySourceDay || !copyTargetDay || !copyEffectiveFrom) return
        setCopying(true)
        try {
            const response = await api.post("/attendance/schedules/copy-day", {
                academic_year_id: academicYearId,
                class_type: department,
                mentor_id: selectedMentorId,
                source_day: Number(copySourceDay),
                target_day: Number(copyTargetDay),
                effective_from: copyEffectiveFrom,
            })
            invalidateCache("/attendance/schedules")
            const copiedCount = Number(response.data?.data?.copied_count || 0)
            const skippedCount = Number(response.data?.data?.skipped_count || 0)
            setCopyOpen(false)
            await loadData()
            toast({
                title: copiedCount > 0 ? "Timetable day copied" : "Timetable already up to date",
                description: copiedCount > 0
                    ? copiedCount + " classes copied to " + (copyTarget?.label || "the selected day")
                        + (skippedCount > 0 ? "; " + skippedCount + " already existed." : ".")
                    : "All classes from the source day already exist on " + (copyTarget?.label || "the target day") + ".",
            })
        } catch (error) {
            toast({ title: "Could not copy timetable day", description: errorMessage(error), variant: "destructive" })
        } finally {
            setCopying(false)
        }
    }
    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase text-blue-600">Timetable builder</p>
                        <h2 className="mt-1 text-xl font-black text-slate-950">Weekly Classes</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">
                            Select a department and mentor, then add classes directly to each weekday.
                            Attendance is available only for scheduled classes.
                        </p>
                    </div>
                    <Button asChild variant="outline" className="w-full xl:w-auto">
                        <Link href="/admin/timetable/view">
                            View timetable
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>

                <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
                        <div>
                            <p className="mb-2 text-xs font-bold text-slate-500">Department</p>
                            <div className="inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto">
                                {DEPARTMENTS.map(item => {
                                    const rosterCount = groups.filter(group => group.department === item).length
                                    return (
                                        <button
                                            key={item}
                                            type="button"
                                            aria-pressed={department === item}
                                            onClick={() => changeDepartment(item)}
                                            className={
                                                "min-w-24 rounded-md px-3 py-2 text-sm font-bold transition " +
                                                (department === item
                                                    ? "bg-white text-blue-700 shadow-sm"
                                                    : "text-slate-500 hover:text-slate-800")
                                            }
                                        >
                                            {departmentLabel(item)}
                                            <span className="ml-2 text-xs font-semibold text-slate-400">{rosterCount}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="min-w-0 sm:w-[320px]">
                            <p className="mb-2 text-xs font-bold text-slate-500">Teaching mentor</p>
                            <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
                                <SelectTrigger className="w-full">
                                    <UserRound className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
                                    <SelectValue placeholder="Select mentor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {departmentMentors.map(mentor => (
                                        <SelectItem key={mentor.id} value={mentor.id}>{mentor.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4 text-blue-500" />
                            {mentorSchedules.length} weekly classes
                        </span>
                        <span className="flex items-center gap-1.5">
                            <UsersRound className="h-4 w-4 text-emerald-500" />
                            {scheduledRosterCount} rosters
                        </span>
                    </div>
                </div>
            </div>

            {loadError && !loading ? (
                <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                    <AlertTriangle className="h-8 w-8 text-rose-500" />
                    <div>
                        <p className="font-bold text-slate-900">Timetable could not be loaded</p>
                        <p className="mt-1 text-sm text-slate-500">{loadError}</p>
                    </div>
                    <Button variant="outline" onClick={() => void loadData()}>Retry</Button>
                </div>
            ) : loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            ) : departmentMentors.length === 0 ? (
                <div className="px-5 py-14 text-center">
                    <UserRound className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 font-bold text-slate-900">No {departmentLabel(department)} mentor rosters yet</p>
                    <p className="mt-1 text-sm text-slate-500">
                        Create a class/division roster below and assign its mentor before building the timetable.
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-800">
                                {selectedMentor?.name || "Select mentor"}
                            </p>
                            <p className="text-xs text-slate-500">
                                {departmentLabel(department)} weekly timetable
                            </p>
                        </div>
                        <Button size="sm" onClick={() => openCreate("0")} disabled={!selectedMentorId}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add class
                        </Button>
                    </div>
                    <div className="overflow-x-auto px-4 py-4">
                        <div className="grid min-w-[1190px] grid-cols-7 border border-slate-200">
                            {DAYS.map((day, index) => {
                                const daySchedules = mentorSchedules
                                    .filter(schedule => schedule.day_of_week === Number(day.value))
                                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                                return (
                                    <div
                                        key={day.value}
                                        className={
                                            "flex min-h-[330px] min-w-0 flex-col bg-white " +
                                            (index < DAYS.length - 1 ? "border-r border-slate-200" : "")
                                        }
                                    >
                                        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-slate-50 px-3">
                                            <p className="text-sm font-black text-slate-800">{day.label}</p>
                                            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                                                {daySchedules.length}
                                            </span>
                                        </div>

                                        <div className="flex flex-1 flex-col gap-2 p-2">
                                            {daySchedules.map(schedule => {
                                                const linkedGroups = parseGroups(schedule.attendance_groups)
                                                const rosterLabels = linkedGroups.length
                                                    ? linkedGroups.map(group => group.standard + "-" + divisionLabel(group.division))
                                                    : parseStandards(schedule.standards)
                                                const studentCount = linkedGroups.reduce(
                                                    (sum, group) => sum + Number(group.student_count || 0),
                                                    0,
                                                )
                                                return (
                                                    <article
                                                        key={schedule.id}
                                                        className="border-l-2 border-blue-500 bg-slate-50 px-3 py-3"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className="flex items-center gap-1 text-xs font-black text-slate-900">
                                                                <Clock3 className="h-3.5 w-3.5 text-blue-600" />
                                                                {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
                                                            </p>
                                                            <button
                                                                type="button"
                                                                title="Deactivate class"
                                                                onClick={() => void removeSchedule(schedule)}
                                                                className="shrink-0 text-slate-300 transition hover:text-rose-500"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                        <p className="mt-2 text-sm font-black text-slate-900">
                                                            {schedule.name || departmentLabel(department) + " Class"}
                                                        </p>
                                                        <div className="mt-2 flex flex-wrap gap-1">
                                                            {rosterLabels.map(label => (
                                                                <span
                                                                    key={label}
                                                                    className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700"
                                                                >
                                                                    {label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-400">
                                                            <span>{studentCount ? studentCount + " students" : "Legacy roster"}</span>
                                                            <span>From {formatDate(schedule.effective_from)}</span>
                                                        </div>
                                                    </article>
                                                )
                                            })}

                                            {daySchedules.length === 0 && (
                                                <div className="flex flex-1 items-center justify-center px-2 py-8 text-center text-xs font-semibold text-slate-300">
                                                    No classes scheduled
                                                </div>
                                            )}

                                            <div className="mt-auto grid gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => openCreate(day.value)}
                                                    className="flex h-9 w-full items-center justify-center gap-1.5 border border-dashed border-slate-300 text-xs font-bold text-slate-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add class
                                                </button>
                                                {mentorSchedules.some(schedule => schedule.day_of_week !== Number(day.value)) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => openCopy(day.value)}
                                                        className="flex h-9 w-full items-center justify-center gap-1.5 border border-slate-200 text-xs font-bold text-slate-500 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700"
                                                    >
                                                        <Copy className="h-3.5 w-3.5" />
                                                        Copy day
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto p-0">
                    <DialogHeader className="border-b border-slate-100 px-6 py-5">
                        <DialogTitle>Add weekly timetable class</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 px-6 py-5">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-slate-50 px-4 py-3 text-sm">
                            <span>
                                <span className="text-slate-500">Department:</span>{" "}
                                <strong>{departmentLabel(department)}</strong>
                            </span>
                            <span>
                                <span className="text-slate-500">Mentor:</span>{" "}
                                <strong>{selectedMentor?.name || "Not selected"}</strong>
                            </span>
                        </div>

                        <div>
                            <p className="mb-2 text-xs font-bold text-slate-600">Class name</p>
                            <Input
                                value={className}
                                onChange={event => setClassName(event.target.value)}
                                placeholder="Example: Hifz @ Subh"
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <p className="mb-2 text-xs font-bold text-slate-600">Weekday</p>
                                <Select value={weekday} onValueChange={setWeekday}>
                                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {DAYS.map(day => (
                                            <SelectItem key={day.value} value={day.value}>{day.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-bold text-slate-600">Effective from</p>
                                <Input
                                    type="date"
                                    value={effectiveFrom}
                                    onChange={event => setEffectiveFrom(event.target.value)}
                                />
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-bold text-slate-600">Start time</p>
                                <Input
                                    type="time"
                                    value={startTime}
                                    onChange={event => setStartTime(event.target.value)}
                                />
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-bold text-slate-600">End time</p>
                                <Input
                                    type="time"
                                    value={endTime}
                                    onChange={event => setEndTime(event.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-bold text-slate-600">Classes &amp; divisions</p>
                                    <p className="mt-0.5 text-xs text-slate-400">
                                        Select the exact student rosters attending this class.
                                    </p>
                                </div>
                                <span className="shrink-0 text-xs font-bold text-blue-600">{groupIds.length} selected</span>
                            </div>

                            <div className="max-h-64 overflow-y-auto border border-slate-200">
                                {rostersByStandard.map(({ standard, rosters }) => {
                                    const allSelected = rosters.every(roster => groupIds.includes(roster.id))
                                    return (
                                        <div key={standard} className="border-b border-slate-100 last:border-b-0">
                                            <button
                                                type="button"
                                                onClick={() => toggleStandard(standard)}
                                                className="flex w-full items-center justify-between bg-slate-50 px-4 py-2.5 text-left"
                                            >
                                                <span className="text-sm font-black text-slate-800">{standard} Standard</span>
                                                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                    {allSelected
                                                        ? <CheckSquare2 className="h-4 w-4 text-blue-600" />
                                                        : <Square className="h-4 w-4 text-slate-300" />}
                                                    All
                                                </span>
                                            </button>
                                            <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2">
                                                {rosters.map(roster => {
                                                    const selected = groupIds.includes(roster.id)
                                                    return (
                                                        <button
                                                            key={roster.id}
                                                            type="button"
                                                            aria-pressed={selected}
                                                            onClick={() => toggleGroup(roster.id)}
                                                            className={
                                                                "flex items-center gap-3 bg-white px-4 py-3 text-left transition " +
                                                                (selected ? "text-blue-700" : "text-slate-700 hover:bg-slate-50")
                                                            }
                                                        >
                                                            {selected
                                                                ? <CheckSquare2 className="h-5 w-5 shrink-0 text-blue-600" />
                                                                : <Square className="h-5 w-5 shrink-0 text-slate-300" />}
                                                            <span>
                                                                <span className="block text-sm font-bold">Division {roster.division}</span>
                                                                <span className="text-xs text-slate-400">{roster.student_count} students</span>
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}

                                {rostersByStandard.length === 0 && (
                                    <p className="px-4 py-10 text-center text-sm text-slate-400">
                                        This mentor has no {departmentLabel(department)} class/division rosters.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="border-t border-slate-100 px-6 py-4">
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => void createSchedule()}
                            disabled={saving || !selectedMentorId || groupIds.length === 0 || !className.trim()}
                        >
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create class
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
                <DialogContent className="max-w-lg p-0">
                    <DialogHeader className="border-b border-slate-100 px-6 py-5">
                        <DialogTitle>Copy classes to {copyTarget?.label || "weekday"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-5 px-6 py-5">
                        <div className="border-l-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Copy every class, time, name, and division roster from one populated weekday.
                            The whole copy is stopped if any timetable conflict is found.
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-bold text-slate-600">Copy from</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {copySourceOptions.map(day => {
                                    const selected = copySourceDay === day.value
                                    return (
                                        <button
                                            key={day.value}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => setCopySourceDay(day.value)}
                                            className={
                                                "flex items-center justify-between border px-3 py-3 text-left transition " +
                                                (selected
                                                    ? "border-blue-500 bg-blue-50 text-blue-800"
                                                    : "border-slate-200 text-slate-700 hover:border-blue-300")
                                            }
                                        >
                                            <span className="flex items-center gap-2 text-sm font-bold">
                                                <Copy className="h-4 w-4" />
                                                {day.label}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-400">
                                                {day.classCount} {day.classCount === 1 ? "class" : "classes"}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-bold text-slate-600">Effective from</p>
                            <Input
                                type="date"
                                value={copyEffectiveFrom}
                                onChange={event => setCopyEffectiveFrom(event.target.value)}
                            />
                            <p className="mt-2 text-xs text-slate-400">
                                Copied classes begin on this date. Existing source classes are unchanged.
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="border-t border-slate-100 px-6 py-4">
                        <Button variant="outline" onClick={() => setCopyOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => void copyScheduleDay()}
                            disabled={copying || !copySourceDay || !copyEffectiveFrom}
                        >
                            {copying
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Copy className="mr-2 h-4 w-4" />}
                            Copy classes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    )
}
