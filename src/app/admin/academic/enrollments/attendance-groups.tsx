"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckSquare2, Layers3, Loader2, Plus, Square, Trash2, UserRoundCheck, UserRoundX, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

const DEPARTMENTS = ["hifz", "school", "madrasa"] as const
const STANDARDS = ["Non-class", "5th", "6th", "7th", "8th", "9th", "10th", "Plus One", "Plus Two"] as const

type Department = typeof DEPARTMENTS[number]
type Placement = { adm_no: string; name: string; standard: string; division?: string | null }
type Division = { id: string; standard: string; name: string }
type Mentor = { id: string; name: string; role: string }
type AttendanceGroup = {
    id: string
    department: Department
    standard: string
    division: string
    mentor_id?: string | null
    mentor_name?: string | null
    student_count: number
    student_ids: string[]
}

type Props = {
    academicYearId: string
    students: Placement[]
    onGroupsChanged?: () => void
}

function errorMessage(error: unknown) {
    const candidate = error as { response?: { data?: { error?: string } }; message?: string } | undefined
    return candidate?.response?.data?.error || candidate?.message || "Something went wrong"
}

function departmentLabel(department: Department) {
    return department === "hifz" ? "Hifz" : department === "school" ? "School" : "Madrasa"
}

export function AttendanceGroups({ academicYearId, students, onGroupsChanged }: Props) {
    const { toast } = useToast()
    const [department, setDepartment] = useState<Department>("hifz")
    const [groups, setGroups] = useState<AttendanceGroup[]>([])
    const [mentors, setMentors] = useState<Mentor[]>([])
    const [divisions, setDivisions] = useState<Division[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [createOpen, setCreateOpen] = useState(false)
    const [manageGroup, setManageGroup] = useState<AttendanceGroup | null>(null)
    const [standard, setStandard] = useState<string>("5th")
    const [division, setDivision] = useState("")
    const [mentorId, setMentorId] = useState("__none")
    const [saving, setSaving] = useState(false)
    const [studentSearch, setStudentSearch] = useState("")
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    async function loadGroups() {
        if (!academicYearId) return
        setLoading(true)
        setLoadError("")
        try {
            const [groupsResponse, divisionsResponse] = await Promise.all([
                api.get("/academic-placements/attendance-groups", {
                    params: { academic_year_id: academicYearId },
                }),
                api.get("/academic-placements/divisions", {
                    params: { academic_year_id: academicYearId },
                }),
            ])
            setGroups(groupsResponse.data?.data || [])
            setMentors(groupsResponse.data?.mentors || [])
            setDivisions(divisionsResponse.data?.data || [])
        } catch (error) {
            const message = errorMessage(error)
            setLoadError(message)
            toast({ title: "Could not load attendance groups", description: message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadGroups()
        // Reload only when the selected academic year changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicYearId])

    const visibleGroups = useMemo(
        () => groups.filter(group => group.department === department),
        [department, groups],
    )

    const divisionOptions = useMemo(
        () => divisions.filter(item => item.standard === standard),
        [divisions, standard],
    )

    const departmentStats = useMemo(() => {
        const assignedStudents = new Set(visibleGroups.flatMap(group => group.student_ids || []))
        return {
            groups: visibleGroups.length,
            assignedStudents: assignedStudents.size,
            unassignedMentors: visibleGroups.filter(group => !group.mentor_id).length,
        }
    }, [visibleGroups])

    const groupByStudentId = useMemo(() => {
        const assignments = new Map<string, AttendanceGroup>()
        visibleGroups.forEach(group => group.student_ids?.forEach(studentId => assignments.set(studentId, group)))
        return assignments
    }, [visibleGroups])

    const eligibleStudents = useMemo(() => {
        if (!manageGroup) return []
        const query = studentSearch.trim().toLowerCase()
        return students.filter(student =>
            student.standard === manageGroup.standard
            && (student.division || "") === manageGroup.division
            && (!query || student.name.toLowerCase().includes(query) || student.adm_no.toLowerCase().includes(query)),
        )
    }, [manageGroup, studentSearch, students])

    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
    const allVisibleSelected = eligibleStudents.length > 0 && eligibleStudents.every(student => selectedSet.has(student.adm_no))

    function openCreate() {
        setStandard("5th")
        setDivision("")
        setMentorId("__none")
        setCreateOpen(true)
    }

    function openStudents(group: AttendanceGroup) {
        setManageGroup(group)
        setSelectedIds(group.student_ids || [])
        setStudentSearch("")
    }

    function toggleStudent(studentId: string) {
        setSelectedIds(current => current.includes(studentId)
            ? current.filter(id => id !== studentId)
            : [...current, studentId])
    }

    function toggleVisibleStudents() {
        setSelectedIds(current => {
            const next = new Set(current)
            if (allVisibleSelected) eligibleStudents.forEach(student => next.delete(student.adm_no))
            else eligibleStudents.forEach(student => next.add(student.adm_no))
            return [...next]
        })
    }

    async function createGroup() {
        if (!academicYearId || !division.trim()) return
        setSaving(true)
        try {
            await api.post("/academic-placements/attendance-groups", {
                academic_year_id: academicYearId,
                department,
                standard,
                division: division.trim(),
                mentor_id: mentorId === "__none" ? null : mentorId,
            })
            setCreateOpen(false)
            await loadGroups()
            onGroupsChanged?.()
            toast({ title: "Attendance group saved" })
        } catch (error) {
            toast({ title: "Could not save attendance group", description: errorMessage(error), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    async function changeMentor(group: AttendanceGroup, nextMentorId: string) {
        try {
            await api.post("/academic-placements/attendance-groups", {
                academic_year_id: academicYearId,
                department: group.department,
                standard: group.standard,
                division: group.division,
                mentor_id: nextMentorId === "__none" ? null : nextMentorId,
            })
            await loadGroups()
            onGroupsChanged?.()
        } catch (error) {
            toast({ title: "Could not update mentor", description: errorMessage(error), variant: "destructive" })
        }
    }

    async function saveStudents() {
        if (!manageGroup) return
        setSaving(true)
        try {
            await api.put("/academic-placements/attendance-groups/" + manageGroup.id + "/students", {
                student_ids: selectedIds,
            })
            setManageGroup(null)
            await loadGroups()
            onGroupsChanged?.()
            toast({ title: "Group students updated", description: String(selectedIds.length) + " students assigned." })
        } catch (error) {
            toast({ title: "Could not update group students", description: errorMessage(error), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    async function deleteGroup(group: AttendanceGroup) {
        if (!window.confirm("Delete " + group.standard + " " + group.division + " from " + departmentLabel(group.department) + "?")) return
        try {
            await api.delete("/academic-placements/attendance-groups/" + group.id)
            await loadGroups()
            onGroupsChanged?.()
        } catch (error) {
            toast({ title: "Could not delete attendance group", description: errorMessage(error), variant: "destructive" })
        }
    }

    return (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">Reusable attendance rosters</p>
                        <h2 className="mt-1 text-xl font-black text-slate-950">Division Rosters</h2>
                        <p className="mt-1 text-sm text-slate-500">Define each department's students once, then reuse the roster in weekly timetable classes.</p>
                    </div>
                    <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create group</Button>
                </div>
                <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-1">
                    {DEPARTMENTS.map(item => {
                        const groupCount = groups.filter(group => group.department === item).length
                        return (
                            <button
                                key={item}
                                type="button"
                                aria-pressed={department === item}
                                onClick={() => setDepartment(item)}
                                className={"rounded-md px-4 py-2 text-sm font-bold transition " + (department === item ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}
                            >
                                {departmentLabel(item)}
                                <span className={"ml-2 rounded px-1.5 py-0.5 text-[10px] " + (department === item ? "bg-blue-50 text-blue-700" : "bg-slate-200 text-slate-500")}>{groupCount}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="grid gap-px border-b border-slate-200 bg-slate-200 sm:grid-cols-3">
                <div className="flex items-center gap-3 bg-white px-5 py-4">
                    <Layers3 className="h-5 w-5 text-blue-600" />
                    <div><p className="text-xl font-black text-slate-950">{departmentStats.groups}</p><p className="text-xs font-semibold text-slate-500">Groups</p></div>
                </div>
                <div className="flex items-center gap-3 bg-white px-5 py-4">
                    <UserRoundCheck className="h-5 w-5 text-emerald-600" />
                    <div><p className="text-xl font-black text-slate-950">{departmentStats.assignedStudents}</p><p className="text-xs font-semibold text-slate-500">Students assigned</p></div>
                </div>
                <div className="flex items-center gap-3 bg-white px-5 py-4">
                    <UserRoundX className={"h-5 w-5 " + (departmentStats.unassignedMentors ? "text-amber-600" : "text-slate-400")} />
                    <div><p className="text-xl font-black text-slate-950">{departmentStats.unassignedMentors}</p><p className="text-xs font-semibold text-slate-500">Groups without mentor</p></div>
                </div>
            </div>

            {loadError && !loading ? (
                <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
                    <AlertTriangle className="h-8 w-8 text-rose-500" />
                    <div><p className="font-bold text-slate-900">Groups could not be loaded</p><p className="mt-1 text-sm text-slate-500">{loadError}</p></div>
                    <Button variant="outline" onClick={() => void loadGroups()}>Retry</Button>
                </div>
            ) : loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : visibleGroups.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                    <Users className="h-9 w-9 text-slate-300" />
                    <p className="mt-3 font-bold text-slate-700">No {departmentLabel(department)} groups yet</p>
                    <p className="mt-1 text-sm text-slate-400">Create the first standard division and assign its mentor.</p>
                </div>
            ) : (
                <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                    {visibleGroups.map(group => (
                        <article key={group.id} className="rounded-lg border border-slate-200 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-lg font-black text-slate-950">{group.standard} - {group.division}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{group.student_count} students</p>
                                </div>
                                <Button variant="ghost" size="icon" title="Delete group" onClick={() => void deleteGroup(group)}>
                                    <Trash2 className="h-4 w-4 text-rose-500" />
                                </Button>
                            </div>
                            <div className="mt-4">
                                <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">Mentor</p>
                                <Select value={group.mentor_id || "__none"} onValueChange={value => void changeMentor(group, value)}>
                                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none">Unassigned</SelectItem>
                                        {mentors.map(mentor => <SelectItem key={mentor.id} value={mentor.id}>{mentor.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button variant="outline" className="mt-3 w-full" onClick={() => openStudents(group)}>
                                <Users className="mr-2 h-4 w-4" />Manage students
                            </Button>
                        </article>
                    ))}
                </div>
            )}

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create {departmentLabel(department)} attendance group</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <p className="mb-2 text-xs font-black uppercase text-slate-500">Standard</p>
                            <Select value={standard} onValueChange={nextStandard => {
                                setStandard(nextStandard)
                                setDivision("")
                            }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{STANDARDS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-black uppercase text-slate-500">Division</p>
                            <Select value={division} onValueChange={setDivision} disabled={divisionOptions.length === 0}>
                                <SelectTrigger><SelectValue placeholder={divisionOptions.length ? "Select division" : "No divisions configured"} /></SelectTrigger>
                                <SelectContent>
                                    {divisionOptions.map(item => <SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                            <p className="mt-2 text-xs text-slate-500">
                                {divisionOptions.length
                                    ? "Only divisions configured for this standard are available."
                                    : "Create a division for this standard in Student Placement first."}
                            </p>
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-black uppercase text-slate-500">Mentor</p>
                            <Select value={mentorId} onValueChange={setMentorId}>
                                <SelectTrigger><SelectValue placeholder="Select mentor" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">Assign later</SelectItem>
                                    {mentors.map(mentor => <SelectItem key={mentor.id} value={mentor.id}>{mentor.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={() => void createGroup()} disabled={saving || !division}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(manageGroup)} onOpenChange={open => { if (!open) setManageGroup(null) }}>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
                    <DialogHeader>
                        <DialogTitle>{manageGroup?.standard} - {manageGroup?.division} students</DialogTitle>
                    </DialogHeader>
                    <Input value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search eligible students" />
                    <div className="flex items-center justify-between text-sm">
                        <button type="button" className="flex items-center gap-2 font-bold text-blue-700" onClick={toggleVisibleStudents}>
                            {allVisibleSelected ? <CheckSquare2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                            {allVisibleSelected ? "Clear visible" : "Select visible"}
                        </button>
                        <span className="text-slate-500">{selectedIds.length} selected</span>
                    </div>
                    <div className="max-h-[48vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                        {eligibleStudents.map(student => {
                            const assignedGroup = groupByStudentId.get(student.adm_no)
                            const isSelected = selectedSet.has(student.adm_no)
                            return (
                                <button key={student.adm_no} type="button" onClick={() => toggleStudent(student.adm_no)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                                    {isSelected ? <CheckSquare2 className="h-5 w-5 shrink-0 text-blue-600" /> : <Square className="h-5 w-5 shrink-0 text-slate-300" />}
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bold">{student.name}</span>
                                        <span className="text-xs text-slate-500">{student.adm_no}</span>
                                    </span>
                                    {assignedGroup && (
                                        <span className={"max-w-[160px] truncate rounded px-2 py-1 text-[11px] font-bold " + (assignedGroup.id === manageGroup?.id ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                                            {assignedGroup.id === manageGroup?.id ? "In this group" : assignedGroup.standard + " - " + assignedGroup.division}
                                        </span>
                                    )}
                                </button>
                            )
                        })}
                        {eligibleStudents.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No students in this standard and division.</p>}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setManageGroup(null)}>Cancel</Button>
                        <Button onClick={() => void saveStudents()} disabled={saving}>
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save students
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
