"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Save, Search, Users } from "lucide-react"
import api from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

type AcademicYear = { id: string; name: string; is_current?: boolean }
type ClassModel = {
    id: string
    name: string
    type: "School" | "Madrassa" | "Hifz"
    standard?: string | null
    section?: string | null
}

type AssignmentRow = {
    adm_no: string
    name: string
    school_class_id?: string | null
    school_class_name?: string | null
    madrasa_class_id?: string | null
    madrasa_class_name?: string | null
    hifz_class_id?: string | null
    hifz_group_name?: string | null
}

type DraftAssignment = {
    school_class_id: string
    madrasa_class_id: string
    hifz_class_id: string
}

const none = "__none"

function labelForClass(item: ClassModel) {
    if (item.type === "Hifz") return item.name
    return item.name || [item.standard, item.section].filter(Boolean).join(" ")
}

export default function StudentEnrollmentsPage() {
    const { toast } = useToast()
    const [years, setYears] = useState<AcademicYear[]>([])
    const [yearId, setYearId] = useState("")
    const [classes, setClasses] = useState<ClassModel[]>([])
    const [rows, setRows] = useState<AssignmentRow[]>([])
    const [drafts, setDrafts] = useState<Record<string, DraftAssignment>>({})
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<string | null>(null)

    const schoolClasses = useMemo(() => classes.filter((item) => item.type === "School"), [classes])
    const madrasaClasses = useMemo(() => classes.filter((item) => item.type === "Madrassa"), [classes])
    const hifzGroups = useMemo(() => classes.filter((item) => item.type === "Hifz"), [classes])

    async function loadYears() {
        const res = await api.get("/classes/academic-years")
        const nextYears = res.data?.data || []
        setYears(nextYears)
        const selected = yearId || nextYears.find((year: AcademicYear) => year.is_current)?.id || nextYears[0]?.id || ""
        setYearId(selected)
        return selected
    }

    async function loadClasses(targetYear = yearId) {
        if (!targetYear) return
        const res = await api.get("/classes", { params: { academic_year_id: targetYear } })
        setClasses(res.data?.data || [])
    }

    async function loadAssignments(targetYear = yearId, term = search) {
        if (!targetYear) return
        setLoading(true)
        try {
            const res = await api.get("/classes/student-assignments", {
                params: { academic_year_id: targetYear, search: term || undefined, limit: 150 },
            })
            const nextRows = res.data?.data || []
            setRows(nextRows)
            setDrafts(Object.fromEntries(nextRows.map((row: AssignmentRow) => [
                row.adm_no,
                {
                    school_class_id: row.school_class_id || none,
                    madrasa_class_id: row.madrasa_class_id || none,
                    hifz_class_id: row.hifz_class_id || none,
                },
            ])))
        } catch (err: any) {
            toast({
                title: "Failed to load enrollments",
                description: err?.response?.data?.error || err.message,
                variant: "destructive",
            })
        } finally {
            setLoading(false)
        }
    }

    async function refreshAll(targetYear = yearId) {
        await Promise.all([loadClasses(targetYear), loadAssignments(targetYear)])
    }

    useEffect(() => {
        loadYears()
            .then((selected) => refreshAll(selected))
            .catch((err) => {
                setLoading(false)
                toast({ title: "Failed to load academic years", description: err.message, variant: "destructive" })
            })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (yearId) void refreshAll(yearId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [yearId])

    function updateDraft(studentId: string, key: keyof DraftAssignment, value: string) {
        setDrafts((current) => ({
            ...current,
            [studentId]: {
                ...(current[studentId] || { school_class_id: none, madrasa_class_id: none, hifz_class_id: none }),
                [key]: value,
            },
        }))
    }

    async function saveAssignment(row: AssignmentRow) {
        const draft = drafts[row.adm_no]
        if (!draft) return
        setSavingId(row.adm_no)
        try {
            await api.post("/classes/student-assignments", {
                student_id: row.adm_no,
                academic_year_id: yearId,
                school_class_id: draft.school_class_id === none ? null : draft.school_class_id,
                madrasa_class_id: draft.madrasa_class_id === none ? null : draft.madrasa_class_id,
                hifz_class_id: draft.hifz_class_id === none ? null : draft.hifz_class_id,
            })
            toast({ title: "Enrollment saved", description: row.name })
            await loadAssignments(yearId, search)
        } catch (err: any) {
            toast({ title: "Save failed", description: err?.response?.data?.error || err.message, variant: "destructive" })
        } finally {
            setSavingId(null)
        }
    }

    return (
        <main className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Academic</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">Student Enrollments</h1>
                        <p className="mt-1 text-sm font-medium text-slate-500">
                            Assign each active student to a School class, Madrasa class, and Hifz group for the selected academic year.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Select value={yearId} onValueChange={setYearId}>
                            <SelectTrigger className="w-full bg-white sm:w-[190px]"><SelectValue placeholder="Academic year" /></SelectTrigger>
                            <SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") void loadAssignments(yearId, search)
                                }}
                                className="pl-9 sm:w-[260px]"
                                placeholder="Search name or admission no."
                            />
                        </div>
                        <Button variant="outline" onClick={() => loadAssignments(yearId, search)}>
                            <Search className="mr-2 h-4 w-4" />
                            Search
                        </Button>
                        <Button variant="outline" onClick={() => refreshAll(yearId)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh
                        </Button>
                    </div>
                </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 p-4">
                    <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-slate-600" />
                        <h2 className="font-black text-slate-950">Active Students</h2>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{rows.length}</span>
                </div>

                {loading ? (
                    <div className="p-10 text-center text-sm font-bold text-slate-400">Loading enrollments...</div>
                ) : rows.length === 0 ? (
                    <div className="p-10 text-center text-sm font-bold text-slate-400">No active students found.</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {rows.map((row) => {
                            const draft = drafts[row.adm_no] || { school_class_id: none, madrasa_class_id: none, hifz_class_id: none }
                            return (
                                <div key={row.adm_no} className="grid gap-3 p-4 xl:grid-cols-[minmax(180px,1fr)_220px_220px_220px_auto] xl:items-center">
                                    <div className="min-w-0">
                                        <p className="truncate font-black text-slate-950">{row.name}</p>
                                        <p className="text-xs font-semibold text-slate-500">{row.adm_no}</p>
                                    </div>
                                    <Select value={draft.school_class_id} onValueChange={(value) => updateDraft(row.adm_no, "school_class_id", value)}>
                                        <SelectTrigger><SelectValue placeholder="School class" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={none}>No School Class</SelectItem>
                                            {schoolClasses.map((item) => <SelectItem key={item.id} value={item.id}>{labelForClass(item)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={draft.madrasa_class_id} onValueChange={(value) => updateDraft(row.adm_no, "madrasa_class_id", value)}>
                                        <SelectTrigger><SelectValue placeholder="Madrasa class" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={none}>No Madrasa Class</SelectItem>
                                            {madrasaClasses.map((item) => <SelectItem key={item.id} value={item.id}>{labelForClass(item)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={draft.hifz_class_id} onValueChange={(value) => updateDraft(row.adm_no, "hifz_class_id", value)}>
                                        <SelectTrigger><SelectValue placeholder="Hifz group" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={none}>No Hifz Group</SelectItem>
                                            {hifzGroups.map((item) => <SelectItem key={item.id} value={item.id}>{labelForClass(item)}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button onClick={() => saveAssignment(row)} disabled={savingId === row.adm_no}>
                                        <Save className="mr-2 h-4 w-4" />
                                        {savingId === row.adm_no ? "Saving" : "Save"}
                                    </Button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>
        </main>
    )
}
